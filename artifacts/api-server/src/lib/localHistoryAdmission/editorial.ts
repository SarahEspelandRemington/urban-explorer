/**
 * Editorial-quality heuristic for the Streetlit local-history admission
 * engine.
 *
 * Promoted (faithful port) from experiments/hybrid-discovery-v0.1/editorial.ts
 * for production offline batch-tool use.
 *
 * Editorial quality is deliberately independent of factual trust and
 * grounding confidence: a true, well-grounded, low-interest fact (e.g. a
 * bare register-status listing) can still AUTO-ADMIT with low editorial
 * quality, and this axis must never gate the decision itself.
 */
import type { Claim, ClaimType, EditorialQuality } from "./types";

const STORY_RICH_TYPES: ClaimType[] = [
  "use-history",
  "biographical",
  "event",
  "institutional-founding",
  "legend-tradition",
  "relationship",
];

const THIN_FACT_TYPES: ClaimType[] = ["register-status", "statistic"];

export function assessEditorialQuality(claim: Claim): EditorialQuality {
  const hasRelatedEntities =
    !!claim.relatedEntities && claim.relatedEntities.length > 0;
  const isSpecific = claim.claimText.trim().length > 40;

  if (
    STORY_RICH_TYPES.includes(claim.claimType) &&
    (hasRelatedEntities || isSpecific)
  ) {
    return "high";
  }
  if (THIN_FACT_TYPES.includes(claim.claimType) && !hasRelatedEntities) {
    return "low";
  }
  if (
    claim.claimType === "construction-date" ||
    claim.claimType === "architect" ||
    claim.claimType === "identity"
  ) {
    return hasRelatedEntities ? "medium" : "low";
  }
  if (claim.claimType === "demolition" || claim.claimType === "superlative") {
    return "medium";
  }
  return isSpecific ? "medium" : "low";
}
