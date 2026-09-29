/**
 * Hybrid Discovery v1 — sibling-placeKey canonicalization + combined PAB +
 * Baldwin Park claim assembly. Offline/non-production, experimental — see
 * README.md.
 *
 * Extracted out of run-pab-baldwinpark-production-proof.ts's main() so this
 * logic is independently testable (see combinePabAndBaldwinPark.test.ts).
 * No behavior change from the extraction itself — this is the exact logic
 * that previously lived inline in the orchestration script's Baldwin Park
 * stage.
 *
 * BUG FIXED (Hybrid Discovery v1 first runtime audit): distinct PAB
 * placeKeys can legitimately ground to the SAME productionSubjectId (two
 * PAB database records for one real-world building). checks.ts's
 * temporalConsistency and crossSourceJoin.ts's conflict/corroboration
 * grouping are both scoped strictly by claim.placeKey (by design, unchanged
 * here) — so a Baldwin Park page independently dominant-matched against
 * BOTH sibling placeKeys could previously produce a claim that genuinely
 * conflicts with a PAB claim at one placeKey (correctly HOLD there) and a
 * byte-identical duplicate claim at the sibling placeKey with no competing
 * claim there (incorrectly AUTO-ADMIT), reintroducing the disputed fact
 * once the runtime projection groups by productionSubjectId (artifact.ts's
 * subjectId is derived only from productionSubjectId, never placeKey).
 *
 * Fix: every claim whose productionSubjectId is shared by more than one
 * placeKey is reattributed to a single synthetic canonical placeKey derived
 * from the productionSubjectId itself (order-independent — does not depend
 * on which sibling happens to be processed first). This is a claim/
 * cross-source join key reassignment only (placeKey is documented in
 * types.ts as "the internal claim/cross-source join key, never the runtime
 * subject identity") — it does not touch checks.ts/decide.ts/pipeline.ts
 * decision logic. A productionSubjectId grounded by only one placeKey is
 * completely unaffected (canonical key === its own original placeKey).
 *
 * Baldwin Park extraction is additionally deduped by
 * `${page.slug}::${canonicalPlaceKey}` so a page independently
 * dominant-matched by more than one sibling placeKey sharing a
 * productionSubjectId is only extracted once — the direct fix for benign
 * duplicate PAB records producing duplicate runtime prose.
 */
import type { BaldwinParkPage } from "./baldwinpark/baldwinParkAdapter";
import {
  extractBaldwinParkClaims,
  buildBaldwinParkSource,
} from "./baldwinpark/baldwinParkExtractor";
import { findBaldwinParkMatches } from "./baldwinpark/baldwinParkMatcher";
import type { PabGroundingResult } from "./pab/pabGrounding";
import type { Claim, Source } from "./types";

export interface CombinablePabPlace {
  placeKey: string;
  address: string;
  title: string;
  grounding: PabGroundingResult;
  pabClaims: Claim[];
}

/**
 * Groups placeKeys by productionSubjectId. A productionSubjectId with only
 * one associated placeKey is not a sibling case — see
 * canonicalPlaceKeyForSubject.
 */
export function computePlaceKeysBySubjectId(
  places: { placeKey: string; grounding: { osmElementId?: string } }[],
): Map<string, Set<string>> {
  const placeKeysBySubjectId = new Map<string, Set<string>>();
  for (const place of places) {
    const subjectId = place.grounding.osmElementId;
    if (!subjectId) continue;
    if (!placeKeysBySubjectId.has(subjectId)) {
      placeKeysBySubjectId.set(subjectId, new Set());
    }
    placeKeysBySubjectId.get(subjectId)!.add(place.placeKey);
  }
  return placeKeysBySubjectId;
}

/**
 * A synthetic canonical placeKey for a shared productionSubjectId, or the
 * place's own placeKey unchanged when its productionSubjectId is undefined
 * or grounded by only one placeKey. Order-independent: does not depend on
 * which sibling is evaluated first.
 */
export function canonicalPlaceKeyForSubject(
  placeKeysBySubjectId: Map<string, Set<string>>,
  subjectId: string | undefined,
  ownPlaceKey: string,
): string {
  if (!subjectId) return ownPlaceKey;
  const siblings = placeKeysBySubjectId.get(subjectId);
  if (!siblings || siblings.size < 2) return ownPlaceKey;
  return `subject:${subjectId}`;
}

export interface CombineResult {
  combinedPabClaims: Claim[];
  combinedSources: Record<string, Source>;
  bpClaimsBySlug: Record<string, Claim[]>;
  bpClaimsWithoutProductionSubjectId: {
    claimId: string;
    placeKey: string;
    address: string;
    pageSlug: string;
    proposedIdentityType: string;
  }[];
  skippedNonDominantByPlace: {
    placeKey: string;
    address: string;
    pageSlug: string;
  }[];
  pagesMatchedByMultiplePlaces: Map<string, Set<string>>;
}

/**
 * Deep-clones pabOnlyClaims for the combined run, reattributes placeKey for
 * any claim whose productionSubjectId is shared across sibling placeKeys,
 * then finds/extracts/dedupes Baldwin Park claims per place using the same
 * canonicalization. pabOnlyClaims is never mutated.
 */
export function combinePabAndBaldwinParkClaims(
  places: CombinablePabPlace[],
  pabOnlyClaims: Claim[],
  pabSources: Record<string, Source>,
  bpPages: BaldwinParkPage[],
): CombineResult {
  const placeKeysBySubjectId = computePlaceKeysBySubjectId(places);

  const combinedPabClaims: Claim[] = pabOnlyClaims.map((c) => {
    const cloned = structuredClone(c);
    cloned.placeKey = canonicalPlaceKeyForSubject(
      placeKeysBySubjectId,
      cloned.productionSubjectId,
      cloned.placeKey,
    );
    return cloned;
  });
  const combinedSources: Record<string, Source> = { ...pabSources };
  const bpClaimsBySlug: Record<string, Claim[]> = {};
  const bpClaimsWithoutProductionSubjectId: CombineResult["bpClaimsWithoutProductionSubjectId"] =
    [];
  const skippedNonDominantByPlace: CombineResult["skippedNonDominantByPlace"] =
    [];
  const pagesMatchedByMultiplePlaces = new Map<string, Set<string>>();
  const bpExtractedForPageAndSubject = new Set<string>();

  for (const place of places) {
    const allMatches = findBaldwinParkMatches(place.address, bpPages);
    const dominant = allMatches.filter((m) => m.isDominantSubject);
    const nonDominant = allMatches.filter((m) => !m.isDominantSubject);
    for (const m of nonDominant) {
      skippedNonDominantByPlace.push({
        placeKey: place.placeKey,
        address: place.address,
        pageSlug: m.page.slug,
      });
    }

    const canonicalPlaceKey = canonicalPlaceKeyForSubject(
      placeKeysBySubjectId,
      place.grounding.osmElementId,
      place.placeKey,
    );

    for (const match of dominant) {
      const page = match.page;
      if (!pagesMatchedByMultiplePlaces.has(page.slug)) {
        pagesMatchedByMultiplePlaces.set(page.slug, new Set());
      }
      pagesMatchedByMultiplePlaces.get(page.slug)!.add(place.placeKey);

      const dedupeKey = `${page.slug}::${canonicalPlaceKey}`;
      if (bpExtractedForPageAndSubject.has(dedupeKey)) continue;
      bpExtractedForPageAndSubject.add(dedupeKey);

      const bpClaims = extractBaldwinParkClaims({
        page,
        placeKey: canonicalPlaceKey,
        address: place.address,
        title: place.title,
        proposedIdentityType: place.grounding.proposedIdentityType,
      });
      if (bpClaims.length === 0) continue;

      for (const claim of bpClaims) {
        if (place.grounding.osmElementId) {
          claim.productionSubjectId = place.grounding.osmElementId;
        } else {
          bpClaimsWithoutProductionSubjectId.push({
            claimId: claim.id,
            placeKey: canonicalPlaceKey,
            address: place.address,
            pageSlug: page.slug,
            proposedIdentityType: place.grounding.proposedIdentityType,
          });
        }
      }

      combinedSources[`bp-${page.slug}`] = buildBaldwinParkSource(
        page,
        bpClaims,
      );
      bpClaimsBySlug[page.slug] = [
        ...(bpClaimsBySlug[page.slug] ?? []),
        ...bpClaims,
      ];
      combinedPabClaims.push(...bpClaims);
    }
  }

  return {
    combinedPabClaims,
    combinedSources,
    bpClaimsBySlug,
    bpClaimsWithoutProductionSubjectId,
    skippedNonDominantByPlace,
    pagesMatchedByMultiplePlaces,
  };
}
