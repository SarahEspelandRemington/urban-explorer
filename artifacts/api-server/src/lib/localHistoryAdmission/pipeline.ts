/**
 * Orchestration for the Streetlit local-history admission engine.
 *
 * Promoted (faithful port) from experiments/hybrid-discovery-v0.1/pipeline.ts
 * for production offline batch-tool use.
 */
import type { Claim, ClaimOutcome, Source } from "./types";
import { runChecks } from "./checks";
import { groundClaim } from "./grounding";
import { decideClaim } from "./decide";

export function runPipeline(
  claims: Claim[],
  sources: Record<string, Source>,
): ClaimOutcome[] {
  return claims.map((claim) => {
    const checks = runChecks({ claim, allClaims: claims, sources });
    const grounding = groundClaim(claim);
    const decision = decideClaim(claim, checks, grounding, sources);
    return { claim, checks, grounding, decision };
  });
}
