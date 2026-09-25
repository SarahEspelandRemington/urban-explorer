/**
 * Lifecycle-aware thin-lodging/commercial guardrail for Walk Mode.
 *
 * Background (Aug. 31 field test): a chain hotel's bare `start_date` tag
 * alone gives the discoveryTier text classifier hasYear=true, which escapes
 * its T4-A/T4-C rules without any real story ever existing (Aliz Hotel,
 * Element, Hampton Inn — none carry wikidata/wikipedia/historic/description/
 * heritage:description, none have Wikipedia A3 evidence). The original
 * guardrail forced any candidate whose *current* category was a lodging type
 * (hotel, hostel, guest_house, motel, apartment) with no positive story
 * signal into Tier 4 ("lowQuality"), already consumed client-side by
 * walkEligibility.ts.
 *
 * Gap closed here (Production Guardrail B, 2026-09-24): OSM records a
 * place's *former* use with a lifecycle prefix on the same key that would
 * normally describe current use — e.g. `was:tourism=hotel`,
 * `disused:amenity=restaurant`. A candidate tagged only this way falls
 * through the osmType priority chain (historic > tourism > amenity >
 * building > ...) to a generic `building` category, because none of the
 * un-prefixed keys are present — silently bypassing the guardrail above even
 * though the candidate is exactly as thin as a current-use hotel/restaurant.
 *
 * deriveLifecycleFormerUse() reads that former use as its own independent
 * dimension — it never overwrites or is merged into current category/
 * identity. A candidate may be `category: "building"`, `formerUse: "hotel"`
 * at the same time, without Streetlit ever asserting the place is currently
 * a hotel. The lifecycle signal is only a reason to apply this guardrail —
 * it is never itself treated as positive story evidence.
 *
 * evaluateThinLodgingCommercialGuardrail() is the pure decision: it widens
 * the trigger condition to "current category is lodging/commercial, OR
 * lifecycle-derived former use is lodging/commercial". Its exemptions were
 * revised 2026-09-24 to match the settled product rule that enrichment/trust
 * and editorial worthiness are separate dimensions — a candidate must escape
 * suppression because it has *positive story evidence*, not because its OSM
 * tags happen to be rich. Each exemption below was individually re-verified
 * against that rule:
 *
 *   - Tier 1-3 classification (`discoveryTier`): KEPT. This is a real,
 *     independently-earned positive classifier match over the generated
 *     narrative text (discoveryTier.ts), not a trust/richness proxy. The bug
 *     this guardrail exists to fix (bare `start_date` giving hasYear=true)
 *     lands in "unclassified" (undefined), never Tier 1-3, so this exemption
 *     cannot be exploited by the thin case it must catch.
 *   - `hasApprovedCuratedEntry`: KEPT. Presence in
 *     CURATED_LOCAL_HISTORY/GENERATED_LOCAL_HISTORY means the subject has
 *     real, sourced evidence text by construction — true for both
 *     hand-curated entries (which normally omit the separate
 *     `hasStoryBearingClaim` flag) and automated entries alike. No
 *     additional `hasStoryBearingClaim` check is needed on top of presence.
 *   - `hasPositiveWikiEvidence` (NEW, replaces `hasEvidenceRef`): the old
 *     `hasEvidenceRef` field only reflected `evidenceRefByOsmId` membership,
 *     which is set unconditionally for up to 3 closest Wikipedia-enriched
 *     candidates *before* the evidence-selection attempt's outcome is known
 *     — it is an attempt/eligibility marker, not proof of genuine evidence.
 *     The real signal is whether `selectEvidenceParagraphs()` (the GPT-based
 *     A3 evidence selector) actually succeeded, i.e. `osmId` is present in
 *     `selectorEnhancedWikiContent`. That selector performs genuine
 *     editorial judgment and can decline; only a success carries positive
 *     story evidence.
 *   - `trustLevel === "osm_enriched"` (REMOVED): this is a pure input/
 *     tag-richness metric, not an editorial-worthiness signal — explicitly
 *     rejected per product decision. An osm_enriched hotel/restaurant with
 *     no positive story evidence must still be suppressed.
 *
 * Walk Mode only — the Explore tab's non-walkMode osm-anchor branch is
 * unaffected. Does not touch global discovery-worthiness gating, discovery
 * tiers 1-3, ranking, or narration timing.
 */

/** OSM current-category / lifecycle-former-use values that mean "lodging". */
export const LODGING_USE_VALUES: ReadonlySet<string> = new Set([
  "hotel",
  "hostel",
  "guest_house",
  "motel",
  "apartment",
]);

/** OSM current-category / lifecycle-former-use values that mean "commercial
 *  service" (food/drink service — the category family a `disused:amenity`
 *  candidate like a former restaurant falls into). Deliberately narrow: this
 *  is not the same list as commercialUseFilter.ts's shop/office/craft, which
 *  is a different, earlier pipeline stage. */
export const COMMERCIAL_SERVICE_USE_VALUES: ReadonlySet<string> = new Set([
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "nightclub",
]);

export type ThinUseCategory = "lodging" | "commercial";

/** Classifies a single category/former-use value into "lodging",
 *  "commercial", or undefined (neither). Shared by both the current-category
 *  check and the lifecycle-derived-former-use check so the two stay in sync
 *  by construction. */
export function classifyThinUseValue(
  value: string,
): ThinUseCategory | undefined {
  const v = value.toLowerCase().trim();
  if (LODGING_USE_VALUES.has(v)) return "lodging";
  if (COMMERCIAL_SERVICE_USE_VALUES.has(v)) return "commercial";
  return undefined;
}

const LIFECYCLE_PREFIXES = [
  "was",
  "disused",
  "abandoned",
  "demolished",
  "ruins",
  "old",
];
const LIFECYCLE_BASE_KEYS = ["tourism", "amenity"];

export interface LifecycleFormerUse {
  /** The raw former-use value, lowercased/trimmed, e.g. "hotel". */
  value: string;
  category: ThinUseCategory;
  /** The lifecycle-prefixed tag key it was read from, e.g. "was:tourism". */
  sourceTag: string;
}

/**
 * Scans `was:`, `disused:`, `abandoned:`, `demolished:`, `ruins:`, and
 * `old:` prefixes on `tourism` and `amenity` for a value that maps to a
 * known lodging or commercial-service use. Returns undefined when no
 * lifecycle-prefixed tag matches one of those two categories — this is
 * deliberately narrow to what this guardrail cares about, not a general
 * lifecycle-tag reader.
 */
export function deriveLifecycleFormerUse(
  tags: Record<string, string>,
): LifecycleFormerUse | undefined {
  for (const baseKey of LIFECYCLE_BASE_KEYS) {
    for (const prefix of LIFECYCLE_PREFIXES) {
      const sourceTag = `${prefix}:${baseKey}`;
      const raw = tags[sourceTag];
      if (!raw) continue;
      const category = classifyThinUseValue(raw);
      if (category) {
        return { value: raw.toLowerCase().trim(), category, sourceTag };
      }
    }
  }
  return undefined;
}

export type ThinLodgingCommercialRejectionReason =
  | "genericLodging"
  | "genericCommercial"
  | "genericFormerLodging"
  | "genericFormerCommercial";

export interface ThinLodgingCommercialGuardrailInput {
  discoveryTier: number | undefined;
  /** Current category (e.g. `p.category` / former `p.type`). */
  category: string | undefined;
  /** Lifecycle-derived former-use value, e.g. "hotel" — undefined when none. */
  formerUse: string | undefined;
  /**
   * True when the A3 Wikipedia evidence selector (selectEvidenceParagraphs)
   * actually succeeded for this candidate — i.e. `selectorEnhancedWikiContent`
   * has an entry for its osmId. Deliberately NOT the same as raw evidenceRef
   * presence, which is only an attempt marker set before the selector's
   * outcome is known.
   */
  hasPositiveWikiEvidence: boolean;
  hasApprovedCuratedEntry: boolean;
}

/**
 * Pure decision function. Returns the discoveryRejectionReason to force
 * (caller should also set discoveryTier = 4), or undefined to leave the
 * candidate unchanged.
 */
export function evaluateThinLodgingCommercialGuardrail(
  input: ThinLodgingCommercialGuardrailInput,
): ThinLodgingCommercialRejectionReason | undefined {
  if (
    input.discoveryTier === 1 ||
    input.discoveryTier === 2 ||
    input.discoveryTier === 3
  ) {
    return undefined;
  }

  const currentUseCategory = input.category
    ? classifyThinUseValue(input.category)
    : undefined;
  const formerUseCategory = input.formerUse
    ? classifyThinUseValue(input.formerUse)
    : undefined;
  if (!currentUseCategory && !formerUseCategory) return undefined;

  if (input.hasPositiveWikiEvidence) return undefined;
  if (input.hasApprovedCuratedEntry) return undefined;

  if (currentUseCategory === "lodging") return "genericLodging";
  if (currentUseCategory === "commercial") return "genericCommercial";
  if (formerUseCategory === "lodging") return "genericFormerLodging";
  return "genericFormerCommercial";
}
