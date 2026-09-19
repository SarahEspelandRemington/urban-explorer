/**
 * Claim-level decision model for the Streetlit local-history admission
 * engine.
 *
 * Promoted (faithful port) from experiments/hybrid-discovery-v0.1/decide.ts
 * for production offline batch-tool use.
 *
 * Combines check outcomes, deterministic grounding, and per-claim-type
 * source capability into AUTO-ADMIT / HOLD / SUPPRESS, while keeping
 * factualTrust, identityConfidence, and editorialQuality independently
 * reported. Editorial quality never gates the decision — human review is
 * never required for a claim to be AUTO-ADMIT-eligible; HOLD just means the
 * automatic system declines to use the claim until it is resolved.
 */
import type {
  Claim,
  CheckResult,
  GroundingResult,
  Source,
  Decision,
  DecisionResult,
  EditorialQuality,
} from "./types";
import { assessEditorialQuality } from "./editorial";

/** Best (highest-strength) capability any cited source has for this claim's own claim type. */
function factualTrustFor(
  claim: Claim,
  sources: Record<string, Source>,
): "high" | "medium" | "low" {
  const strengths = claim.sourceIds
    .map((id) => sources[id])
    .filter((s): s is Source => !!s)
    .map(
      (s) =>
        s.capabilities.find((c) => c.claimType === claim.claimType)?.strength ??
        "none",
    );

  if (strengths.includes("high")) return "high";
  if (strengths.includes("medium")) return "medium";
  return "low"; // covers "low" and "none" — no source with real capability for this claim type
}

export function decideClaim(
  claim: Claim,
  checks: CheckResult[],
  grounding: GroundingResult,
  sources: Record<string, Source>,
): DecisionResult {
  const reasons: string[] = [];
  const factualTrust = factualTrustFor(claim, sources);
  const identityConfidence = grounding.confidence;
  const editorialQuality: EditorialQuality = assessEditorialQuality(claim);

  const failed = checks.filter((c) => c.outcome === "fail");
  const blocked = checks.filter((c) => c.outcome === "block-auto-admit");

  let decision: Decision;

  if (failed.length > 0) {
    decision = "SUPPRESS";
    reasons.push(...failed.map((c) => `[${c.checkId}] ${c.reason}`));
  } else if (blocked.length > 0) {
    decision = "HOLD";
    reasons.push(...blocked.map((c) => `[${c.checkId}] ${c.reason}`));
  } else if (grounding.tier === 0 || grounding.confidence === "none") {
    decision = "HOLD";
    reasons.push(
      `[grounding] ${grounding.reason} Fuzzy identity alone is insufficient for AUTO-ADMIT.`,
    );
  } else if (factualTrust === "low") {
    decision = "HOLD";
    reasons.push(
      `[factual-trust] No cited source has meaningful capability for claim type "${claim.claimType}".`,
    );
  } else {
    decision = "AUTO-ADMIT";
    reasons.push("All checks passed; grounding and factual trust sufficient.");
  }

  return {
    decision,
    factualTrust,
    identityConfidence,
    editorialQuality,
    reasons,
  };
}

export { factualTrustFor };
