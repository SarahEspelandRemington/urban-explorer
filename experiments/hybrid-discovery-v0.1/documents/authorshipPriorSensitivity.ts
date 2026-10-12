/**
 * Experiments-only diagnostic reporting for the authorship trust prior
 * (implementation step 3A). Answers, per claim: would the authorship/
 * capability prior alone be the deciding factor between HOLD and
 * AUTO-ADMIT?
 *
 * Deliberately NOT a second admission system: this calls the real,
 * unmodified production `decideClaim` a second time, reusing the SAME
 * checks/grounding already computed for the claim (neither depends on
 * source capability) and varying only one source's capability array to a
 * counterfactual "every claim type is low" variant — isolating the
 * authorship-capability lane as the only input that differs between the
 * two calls.
 *
 * Diagnostic only — never used to alter a real admission outcome.
 *
 * Offline/non-production, experimental.
 */
import { decideClaim } from "../../../artifacts/api-server/src/lib/localHistoryAdmission/decide";
import type {
  CheckResult,
  Claim,
  DecisionResult,
  GroundingResult,
  Source,
} from "../../../artifacts/api-server/src/lib/localHistoryAdmission/types";

export interface AuthorshipPriorSensitivityResult {
  actualDecision: DecisionResult["decision"];
  actualFactualTrust: DecisionResult["factualTrust"];
  allNonTrustChecksPassed: boolean;
  counterfactualLowCapabilityDecision: DecisionResult["decision"];
  counterfactualLowCapabilityFactualTrust: DecisionResult["factualTrust"];
  /**
   * True only when the actual decision is AUTO-ADMIT, the counterfactual
   * (authorship capability forced to "low" for every claim type) is HOLD,
   * and the factualTrust lane itself is the only thing that moved — i.e.
   * the authorship/capability prior alone was the deciding factor.
   */
  wouldFlipHoldToAutoAdmitFromTrustAlone: boolean;
}

export function assessAuthorshipPriorSensitivity(
  claim: Claim,
  checks: CheckResult[],
  grounding: GroundingResult,
  sources: Record<string, Source>,
  actualDecision: DecisionResult,
  variableSourceId: string,
): AuthorshipPriorSensitivityResult {
  const variableSource = sources[variableSourceId];
  if (!variableSource) {
    throw new Error(
      `assessAuthorshipPriorSensitivity: source "${variableSourceId}" not found in sources`,
    );
  }

  const lowCapabilitySource: Source = {
    ...variableSource,
    capabilities: variableSource.capabilities.map((c) => ({
      ...c,
      strength: "low",
    })),
  };

  const counterfactual = decideClaim(claim, checks, grounding, {
    ...sources,
    [variableSourceId]: lowCapabilitySource,
  });

  const wouldFlip =
    actualDecision.decision === "AUTO-ADMIT" &&
    counterfactual.decision === "HOLD" &&
    actualDecision.factualTrust !== "low" &&
    counterfactual.factualTrust === "low";

  return {
    actualDecision: actualDecision.decision,
    actualFactualTrust: actualDecision.factualTrust,
    allNonTrustChecksPassed: checks.every((c) => c.outcome === "pass"),
    counterfactualLowCapabilityDecision: counterfactual.decision,
    counterfactualLowCapabilityFactualTrust: counterfactual.factualTrust,
    wouldFlipHoldToAutoAdmitFromTrustAlone: wouldFlip,
  };
}
