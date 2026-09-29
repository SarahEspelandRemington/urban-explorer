/**
 * Orchestration for the Streetlit Hybrid Discovery v0.1 harness.
 * Offline/non-production — see README.md.
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
