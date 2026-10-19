/**
 * Walk-only SHADOW measurement of a reserved-slot copy-generation rule
 * (2026-10-18, approved as diagnostic-only — it never changes which
 * candidates are sent to copy generation, the response, or any tier).
 *
 * Hypothetical rule being measured: within the existing
 * COPY_GEN_CANDIDATE_CAP (22), up to `reservedSlots` (3) already-eligible
 * candidates that rank BELOW the normal distance cutoff and carry an exact
 * knowledge tag are promoted into the 22, displacing the farthest
 * displaceable ordinary candidates so the total stays at the cap.
 *
 * - Exact knowledge tag: ONLY the plain `wikipedia` tag passing
 *   parseWikipediaOsmTag, or the plain `wikidata` tag passing
 *   isValidWikidataId. Prefixed/related tags (operator:wikidata,
 *   name:etymology:wikidata, brand:wikidata, subject:wikidata, ...), name
 *   matches and proximity never count. Tag presence is a copy-gen priority
 *   signal only — never a trust or evidence signal.
 * - Tagged candidates already inside the normal cap stay put and do not
 *   consume a reserved slot; they are also never displaced.
 * - Protected (never displaced): Streetlit-owned candidates, approvedRescue
 *   candidates, and curated bare-entry exceptions. Only ordinary OSM
 *   candidates are displaceable; if the farthest candidate is protected,
 *   the next farthest displaceable one is used instead.
 * - Ranking reproduces the production cap exactly: a stable sort by
 *   distance (ascending) over the post-bare-exclusion candidate list.
 *
 * Pure: no I/O, no mutation of its inputs.
 */
import { isValidWikidataId, parseWikipediaOsmTag } from "./wikipediaEnrichment";

export const WALK_RESERVED_SLOT_COUNT = 3;

export type ExactKnowledgeTag = "wikipedia" | "wikidata";

export interface ReservedSlotShadowCandidate {
  osmId: string;
  name: string;
  tags: Record<string, string>;
  candidateOrigin?: "streetlit" | "approvedRescue";
  /** True for an osm_bare candidate let into copy-gen only because it has an approved curated entry. */
  isCuratedBareException: boolean;
  /** Distance from the request centre, computed exactly as the production cap sort does. */
  distanceMeters: number;
}

export interface ReservedSlotShadowResult {
  /** False when the candidate count is at or below the cap (no cap applies, nothing to reserve). */
  capApplies: boolean;
  reservedSlotsUsed: number;
  /** Tagged candidates below the cutoff that would qualify, before the N limit and displacement availability. */
  eligibleBelowCutoff: number;
  promoted: Array<{
    osmId: string;
    name: string;
    distanceRank: number;
    qualifyingTags: ExactKnowledgeTag[];
  }>;
  displaced: Array<{ osmId: string; name: string; distanceRank: number }>;
  /** The hypothetical copy-gen set, in distance order. Same size as the real one. */
  hypotheticalSelectionIds: string[];
}

export function exactKnowledgeTags(
  tags: Record<string, string>,
): ExactKnowledgeTag[] {
  const found: ExactKnowledgeTag[] = [];
  const wikipedia = tags["wikipedia"];
  if (typeof wikipedia === "string" && parseWikipediaOsmTag(wikipedia)) {
    found.push("wikipedia");
  }
  if (isValidWikidataId(tags["wikidata"])) found.push("wikidata");
  return found;
}

export function isDisplacementProtected(
  c: ReservedSlotShadowCandidate,
): boolean {
  return (
    c.candidateOrigin === "streetlit" ||
    c.candidateOrigin === "approvedRescue" ||
    c.isCuratedBareException
  );
}

export function computeWalkReservedSlotShadow(
  candidates: readonly ReservedSlotShadowCandidate[],
  cap: number,
  reservedSlots: number = WALK_RESERVED_SLOT_COUNT,
): ReservedSlotShadowResult {
  const ranked = [...candidates].sort(
    (a, b) => a.distanceMeters - b.distanceMeters,
  );
  const rankOf = new Map(ranked.map((c, i) => [c, i + 1]));

  if (ranked.length <= cap) {
    return {
      capApplies: false,
      reservedSlotsUsed: 0,
      eligibleBelowCutoff: 0,
      promoted: [],
      displaced: [],
      hypotheticalSelectionIds: ranked.map((c) => c.osmId),
    };
  }

  const inside = ranked.slice(0, cap);
  const eligibleBelow = ranked
    .slice(cap)
    .filter((c) => exactKnowledgeTags(c.tags).length > 0);
  const displaceableFarthestFirst = inside
    .filter(
      (c) =>
        !isDisplacementProtected(c) && exactKnowledgeTags(c.tags).length === 0,
    )
    .reverse();

  const used = Math.min(
    reservedSlots,
    eligibleBelow.length,
    displaceableFarthestFirst.length,
  );
  const promoted = eligibleBelow.slice(0, used);
  const displaced = displaceableFarthestFirst.slice(0, used);
  const displacedSet = new Set(displaced);
  const selection = [
    ...inside.filter((c) => !displacedSet.has(c)),
    ...promoted,
  ];

  return {
    capApplies: true,
    reservedSlotsUsed: used,
    eligibleBelowCutoff: eligibleBelow.length,
    promoted: promoted.map((c) => ({
      osmId: c.osmId,
      name: c.name,
      distanceRank: rankOf.get(c)!,
      qualifyingTags: exactKnowledgeTags(c.tags),
    })),
    displaced: displaced.map((c) => ({
      osmId: c.osmId,
      name: c.name,
      distanceRank: rankOf.get(c)!,
    })),
    hypotheticalSelectionIds: selection.map((c) => c.osmId),
  };
}
