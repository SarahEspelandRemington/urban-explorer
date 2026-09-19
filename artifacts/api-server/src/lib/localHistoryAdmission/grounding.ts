/**
 * Deterministic place-grounding for the Streetlit local-history admission
 * engine.
 *
 * Promoted (faithful port) from experiments/hybrid-discovery-v0.1/grounding.ts
 * for production offline batch-tool use.
 *
 * This deliberately does NOT do live OSM/Wikidata/StreetlitPlace lookups.
 * It scores the grounding evidence a claim itself carries (proposedIdentityType
 * + presence of an exact address) against the fixed five-tier priority order.
 * Grounding is evaluated independently of factual trust: a claim can be
 * factually well-corroborated and still fail to ground strongly enough for
 * AUTO-ADMIT ("fuzzy identity alone is insufficient").
 */
import type { Claim, GroundingResult } from "./types";

export function groundClaim(claim: Claim): GroundingResult {
  const hasExactAddress = !!claim.address && claim.address.trim().length > 0;

  switch (claim.proposedIdentityType) {
    case "current-osm-entity":
      return hasExactAddress
        ? {
            tier: 5,
            confidence: "high",
            matchedIdentity: claim.address,
            reason:
              "Exact address/coordinate evidence matched to a current OSM entity.",
          }
        : {
            tier: 4,
            confidence: "high",
            matchedIdentity: claim.locationHints,
            reason:
              "Strong OSM/Wikidata identity match without a confirmed exact address.",
          };
    case "unnamed-current-building":
      return hasExactAddress
        ? {
            tier: 3,
            confidence: "medium",
            matchedIdentity: claim.address,
            reason:
              "Unnamed current building matched by exact address/geometry.",
          }
        : {
            tier: 3,
            confidence: "low",
            matchedIdentity: claim.locationHints,
            reason:
              "Unnamed current building match via location hints only, no confirmed address.",
          };
    case "current-building-former-use":
      return {
        tier: 2,
        confidence: hasExactAddress ? "medium" : "low",
        matchedIdentity: claim.address ?? claim.locationHints,
        reason: "Current-building-former-use StreetlitPlace grounding.",
      };
    case "former-site":
      return {
        tier: 1,
        confidence: hasExactAddress ? "medium" : "low",
        matchedIdentity: claim.address ?? claim.locationHints,
        reason:
          "Former-site StreetlitPlace grounding (no surviving current entity).",
      };
    case "unresolved":
    default:
      return {
        tier: 0,
        confidence: "none",
        reason:
          "No deterministic identity match; fuzzy identity alone is insufficient for grounding.",
      };
  }
}
