/**
 * Task F Stage 3/4 — place-based cross-source join and provenance-aware
 * corroboration/conflict detection across ALL claims at a place (PAB and
 * Baldwin Park alike). Offline/non-production, experimental — see README.md.
 *
 * The join itself already happened at claim-construction time: a Baldwin
 * Park claim is only ever built with the SAME placeKey as the PAB record
 * whose grounded corridor address the source page was matched against
 * (see baldwinpark/baldwinParkMatcher.ts) — never by matching names/themes
 * alone. This module only detects, after the fact, which same-place claim
 * pairs genuinely corroborate or conflict, using exact (non-fuzzy)
 * string/date comparison only — never fuzzy name similarity.
 *
 * SAME-UNDERLYING-FACT GROUPING (generalized beyond source pairing and
 * exact claimType — fixes the failure shape where a disputed underlying
 * fact could escape comparison merely by appearing on a second page within
 * the same source ecosystem, or under a different broad claimType):
 * comparison is no longer restricted to one-PAB-claim-vs-one-BP-claim pairs
 * with an identical claimType. Instead, every claim at a place is assigned
 * a factCategory (see factCategoryFor) and grouped by
 * (placeKey, factCategory, precise date). Two claimTypes are merged into
 * one factCategory ONLY when they can describe the very same physical
 * event — construction-date and demolition both assert "what stood here,
 * and when" for the same structure (the concrete case this generalization
 * was built for: a "built in 1937" claim on one Baldwin Park page and a
 * "razed the prior building and put up the current structure in 1937"
 * claim on a different page are the same underlying construction event).
 * All other claimTypes keep their own category unchanged — e.g.
 * "constructed in 1875" and "purchased in 1922" are deliberately NOT
 * grouped; they are different facts about the same place, not competing
 * versions of one fact, so they must stay independent.
 *
 * Within a same-fact group, any two claims that share a named entity
 * corroborate each other, regardless of source family. A NEW conflict,
 * however, is only raised between claims that span the PAB and Baldwin
 * Park source families — two Baldwin Park pages asserting different exact
 * entity strings for the same fact (an acronym vs. a full name, a stray
 * extraction-boundary word) is a known, expected consequence of this
 * harness's no-fuzzy-matching policy, not evidence of a real dispute, and
 * must not HOLD otherwise-clean, mutually-agreeing same-ecosystem claims.
 * A claim with no named entity at all is not, by itself, evidence either
 * way — grouping it does not manufacture a conflict, but see PROPAGATION
 * below for the case where it must still be held back from AUTO-ADMIT.
 *
 * PROPAGATION: once any claim in a same-fact group is disputed — either by
 * the entity-conflict rule above, or because it already independently
 * carries a blocking epistemic marker (e.g. legend-or-tradition) — every
 * OTHER claim in that same group is marked disputed-across-sources too,
 * regardless of its own claimType or source page. This is what stops a
 * clean-looking manifestation of a disputed fact from AUTO-ADMITting
 * merely because it happened to land on a different page or under a
 * different claimType than the flagged manifestation.
 *
 * Corroboration and conflict are recorded via existing Claim fields
 * (corroborationKey, epistemicMarkers) rather than by adding new frozen
 * check logic:
 *  - a detected conflict is tagged with the existing "disputed-across-sources"
 *    epistemic marker, which checks.ts's (frozen, unmodified)
 *    epistemicMarkerPreservation check already treats as block-auto-admit,
 *    so the conflict reaches HOLD entirely through the existing trust
 *    semantics — no new check logic is added.
 *  - corroborationKey is set on genuinely-corroborating pairs for this
 *    experiment's own reporting (Stage 4 point 5); it also feeds
 *    checks.ts's existing superlativeCorroboration/temporalConsistency
 *    logic for any claim type that already consumes it.
 *
 * PROVENANCE INDEPENDENCE: "genuinely cross-class corroborated" (Stage 4
 * point 5) is only counted when a corroborating pair spans the PAB source
 * family and the Baldwin Park source family — two Baldwin Park pages
 * agreeing with each other still sets corroborationKey (so checks.ts's
 * existing class-diversity requirement for superlative claims already
 * treats it correctly as non-independent), but is not counted toward this
 * harness's own "cross-class" metric. This is the direct fix for "multiple
 * Baldwin Park pages repeating one citation chain are not independent
 * corroboration" — in this specific two-source-family harness, PAB-prefix
 * vs. bp-prefix already IS the source-class boundary, so no new source
 * lookups are needed to determine it.
 *
 * Because name matching here is exact-string (case/whitespace-normalized)
 * only, a real same-person case whose two sources spell/order the name
 * differently (e.g. an OCR-garbled PAB field vs. a narrative source's
 * correctly spelled name) will NOT be linked — this is a known, deliberate
 * design limit of the harness's no-fuzzy-matching policy, not a bug.
 */
import type { Claim, ClaimType } from "./types";

function normalizeEntity(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isPabClaim(claim: Claim): boolean {
  return claim.sourceIds.some((id) => id.startsWith("pab-"));
}

function isBpClaim(claim: Claim): boolean {
  return claim.sourceIds.some((id) => id.startsWith("bp-"));
}

/**
 * Coarser-than-claimType grouping key for "what kind of real-world
 * proposition is this." Only construction-date and demolition are merged
 * (see module doc) — every other claimType maps to itself, preserving the
 * prior same-claimType-only comparison scope for facts with no structural
 * justification to merge.
 */
function factCategoryFor(claimType: ClaimType): string {
  if (claimType === "construction-date" || claimType === "demolition")
    return "structural-change";
  return claimType;
}

const BLOCKING_MARKERS = new Set([
  "legend-or-tradition",
  "unresolved-cross-source-conflict",
  "author-uncertainty",
  "disputed-across-sources",
]);

function isAlreadyDisputed(claim: Claim): boolean {
  return (
    !!claim.sourceRefutesThisClaim ||
    !!claim.epistemicMarkers?.some((m) => BLOCKING_MARKERS.has(m))
  );
}

export interface CrossSourceConflict {
  claimIdA: string;
  claimIdB: string;
  claimType: string;
  reason: string;
}

export interface CrossSourceJoinResult {
  corroboratedClaimIds: string[];
  conflicts: CrossSourceConflict[];
}

/**
 * Mutates claims in place (corroborationKey / epistemicMarkers) and returns
 * a report of what was found. Mutating already-constructed claims
 * post-hoc mirrors the existing precedent in run-pab-extraction.ts /
 * run-pab-grounding.ts, which already override claim.proposedIdentityType /
 * claim.locationHints after construction using grounding results.
 */
export function joinPabAndBaldwinParkClaims(
  claims: Claim[],
): CrossSourceJoinResult {
  const byPlace = new Map<string, Claim[]>();
  for (const claim of claims) {
    if (!byPlace.has(claim.placeKey)) byPlace.set(claim.placeKey, []);
    byPlace.get(claim.placeKey)!.push(claim);
  }

  const corroboratedClaimIds = new Set<string>();
  const conflicts: CrossSourceConflict[] = [];

  for (const [placeKey, placeClaims] of byPlace) {
    // Group every claim at this place (any source, any page, any claimType)
    // by (factCategory, precise date) — the same-underlying-fact anchor.
    // Claims without a precise date cannot be exact-date-anchored and are
    // excluded from this grouping entirely, same as the prior logic.
    const groups = new Map<string, Claim[]>();
    for (const claim of placeClaims) {
      if (!claim.dateRange?.precise || !claim.dateRange.start) continue;
      const key = `${factCategoryFor(claim.claimType)}::${claim.dateRange.start}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(claim);
    }

    for (const [groupKey, groupClaims] of groups) {
      if (groupClaims.length < 2) continue;
      const [factCategory, date] = groupKey.split("::");

      for (let i = 0; i < groupClaims.length; i++) {
        for (let j = i + 1; j < groupClaims.length; j++) {
          const a = groupClaims[i];
          const b = groupClaims[j];
          const namesA = new Set(
            (a.relatedEntities ?? []).map(normalizeEntity),
          );
          const namesB = new Set(
            (b.relatedEntities ?? []).map(normalizeEntity),
          );
          const sharedName = [...namesA].find((n) => namesB.has(n));

          if (sharedName) {
            const key = `corrob-${placeKey}-${factCategory}-${date}-${sharedName}`;
            a.corroborationKey = key;
            b.corroborationKey = key;
            // Only counted as "genuinely cross-class" when the pair spans
            // the PAB and Baldwin Park source families — see module doc.
            if (
              (isPabClaim(a) && isBpClaim(b)) ||
              (isBpClaim(a) && isPabClaim(b))
            ) {
              corroboratedClaimIds.add(a.id);
              corroboratedClaimIds.add(b.id);
            }
            continue;
          }

          // A NEW conflict is only raised between claims from different
          // source families (PAB vs. Baldwin Park) — same restriction as
          // the "genuinely cross-class" corroboration count above. Two
          // Baldwin Park pages naming the same real entity in different
          // exact wording (an acronym vs. a full name, an extraction-
          // boundary artifact) is common and, per this harness's own
          // documented no-fuzzy-matching limitation, expected; treating
          // that mismatch as a genuine dispute would incorrectly HOLD
          // clean, mutually-agreeing same-ecosystem claims — the opposite
          // of "unrelated clean claims... must remain unaffected."
          const spansSourceFamilies =
            (isPabClaim(a) && isBpClaim(b)) || (isBpClaim(a) && isPabClaim(b));
          if (namesA.size > 0 && namesB.size > 0 && spansSourceFamilies) {
            const key = `conflict-${placeKey}-${factCategory}-${date}`;
            a.corroborationKey = key;
            b.corroborationKey = key;
            if (!a.epistemicMarkers?.includes("disputed-across-sources"))
              a.epistemicMarkers = [
                ...(a.epistemicMarkers ?? []),
                "disputed-across-sources",
              ];
            if (!b.epistemicMarkers?.includes("disputed-across-sources"))
              b.epistemicMarkers = [
                ...(b.epistemicMarkers ?? []),
                "disputed-across-sources",
              ];
            conflicts.push({
              claimIdA: a.id,
              claimIdB: b.id,
              claimType: factCategory,
              reason: `Same underlying fact (${factCategory}, ${date}) but different named entities: "${a.id}"="${[...namesA].join("; ")}" vs "${b.id}"="${[...namesB].join("; ")}".`,
            });
          }
        }
      }

      // PROPAGATION: if any claim in this same-fact group is disputed (by
      // the entity-conflict rule just above, or independently, e.g. it
      // already carries "legend-or-tradition"), every other claim in the
      // group must be disputed too — no manifestation of the same fact may
      // stay clean merely because it lives on a different page or under a
      // different claimType than the flagged one.
      if (groupClaims.some(isAlreadyDisputed)) {
        for (const claim of groupClaims) {
          if (!claim.epistemicMarkers?.includes("disputed-across-sources")) {
            claim.epistemicMarkers = [
              ...(claim.epistemicMarkers ?? []),
              "disputed-across-sources",
            ];
          }
        }
      }
    }
  }

  return { corroboratedClaimIds: [...corroboratedClaimIds], conflicts };
}
