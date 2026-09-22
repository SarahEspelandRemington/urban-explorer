/**
 * Discovery-worthiness gate for the Streetlit local-history admission
 * engine.
 *
 * Evidentiary admission (checks.ts/grounding.ts/decide.ts) answers "is this
 * claim trustworthy enough to state as fact?" This module answers a
 * categorically different question, applied AFTER admission: "even though
 * this claim set is fully admitted, does it materially change a reader's
 * understanding of the place — per Streetlit's editorial framework (hidden/
 * human/community history, former use, visible remnants, change over time,
 * larger historical/cultural/social/economic patterns, adaptive reuse,
 * meaningful architecture) — or is it just generic identity/register
 * metadata?"
 *
 * This module never reads or alters factualTrust, identityConfidence,
 * grounding, or editorialQuality — those remain exactly as decide.ts
 * computed them. It is a bounded, deterministic rule set over the distinct
 * claimTypes admitted for one subjectId, not an opaque score — every
 * decision is traceable via worthinessReasons.
 *
 * Applied between the canonical evidence artifact (artifact.ts) and the
 * runtime projection (projector.ts) via applyDiscoveryWorthinessGate below —
 * it does not modify projectRuntimeCompat's own output or tests.
 */
import type { CuratedEntry } from "../curatedLocalHistory";
import type { GeneratedEvidenceArtifact } from "./artifact";
import type { GeneratedRuntimeProjection } from "./projector";
import type { ClaimType } from "./types";

export interface WorthinessResult {
  projectableForDiscovery: boolean;
  worthinessReasons: string[];
}

// Inherently narrative on their own: former use, notable event/change,
// institutional founding, demolition/loss, legend, superlative, statistic,
// or biographical detail. Presence of any ONE of these is sufficient.
const STORY_CLAIM_TYPES: ReadonlySet<ClaimType> = new Set([
  "use-history",
  "biographical",
  "institutional-founding",
  "event",
  "superlative",
  "legend-tradition",
  "statistic",
  "demolition",
]);

// Real facts, but thin in isolation (a bare name or date with no further
// context). Meaningful only in combination — two or more together (e.g. who
// designed it AND when it was built, or who designed it for whom) form a
// capsule design/ownership history that does change understanding.
const SUPPORTING_CLAIM_TYPES: ReadonlySet<ClaimType> = new Set([
  "construction-date",
  "architect",
  "relationship",
]);

// Every other claimType (identity, register-status) is pure identity/
// register metadata — never sufficient on its own, regardless of count.

export function evaluateDiscoveryWorthiness(
  claimTypes: ClaimType[],
): WorthinessResult {
  const distinctTypes = [...new Set(claimTypes)];
  const storyTypes = distinctTypes.filter((t) => STORY_CLAIM_TYPES.has(t));
  const supportingTypes = distinctTypes.filter((t) =>
    SUPPORTING_CLAIM_TYPES.has(t),
  );

  if (storyTypes.length > 0) {
    return {
      projectableForDiscovery: true,
      worthinessReasons: [
        `Contains story-bearing claim type(s) — ${storyTypes.join(", ")} — reflecting former use, change over time, an event, an institution, or a larger pattern, not mere identity/register metadata.`,
      ],
    };
  }

  if (supportingTypes.length >= 2) {
    return {
      projectableForDiscovery: true,
      worthinessReasons: [
        `Combines ${supportingTypes.length} supporting claim types (${supportingTypes.join(", ")}) into a capsule design/ownership history — more than bare identity/register metadata even without a dedicated story claim type.`,
      ],
    };
  }

  const reasons = [
    `Claim types present: ${distinctTypes.length > 0 ? distinctTypes.join(", ") : "(none)"}.`,
  ];
  if (supportingTypes.length === 1) {
    reasons.push(
      `Only one supporting fact (${supportingTypes[0]}) beyond identity/register metadata — not enough on its own to materially change understanding.`,
    );
  } else {
    reasons.push(
      "Limited to identity/register metadata — no story-bearing or combined supporting claim types present.",
    );
  }
  return { projectableForDiscovery: false, worthinessReasons: reasons };
}

export interface DiscoveryWorthinessGateResult {
  version: 1;
  generatedAt: string;
  /** Subset of the input projection's entries that passed the gate. */
  entries: Record<string, CuratedEntry>;
  compositionMap: Record<string, string[]>;
  /** Carried over unchanged from the input projection. */
  nonProjectableClaimIds: string[];
  /** Gate result for every subjectId the input projection had structurally projected (pass or fail), for full auditability. */
  worthinessBySubject: Record<string, WorthinessResult>;
  /** subjectIds that were structurally projectable but rejected by this gate. */
  rejectedForWorthiness: string[];
}

/**
 * Applies the discovery-worthiness gate to an already-built runtime
 * projection, using the canonical artifact only to look up each composed
 * claim's claimType. Does not mutate its inputs.
 */
export function applyDiscoveryWorthinessGate(
  projection: GeneratedRuntimeProjection,
  artifact: GeneratedEvidenceArtifact,
): DiscoveryWorthinessGateResult {
  const claimTypeByClaimId = new Map(
    artifact.claims.map((record) => [record.claimId, record.claim.claimType]),
  );

  const entries: Record<string, CuratedEntry> = {};
  const compositionMap: Record<string, string[]> = {};
  const worthinessBySubject: Record<string, WorthinessResult> = {};
  const rejectedForWorthiness: string[] = [];

  for (const [subjectId, claimIds] of Object.entries(
    projection.compositionMap,
  )) {
    const claimTypes = claimIds.map((claimId) => {
      const claimType = claimTypeByClaimId.get(claimId);
      if (!claimType) {
        throw new Error(
          `applyDiscoveryWorthinessGate: composed claimId "${claimId}" (subjectId "${subjectId}") not found in artifact.claims.`,
        );
      }
      return claimType;
    });
    const worthiness = evaluateDiscoveryWorthiness(claimTypes);
    worthinessBySubject[subjectId] = worthiness;
    if (worthiness.projectableForDiscovery) {
      const projected = projection.entries[subjectId];
      entries[subjectId] = {
        ...projected,
        evidence: {
          ...projected.evidence,
          // Mechanically carry the pipeline's own story-bearing
          // determination forward — see the hasStoryBearingClaim doc
          // comment in curatedLocalHistory.ts. Always true here by
          // construction (only worthy subjects reach this branch), but
          // computed via the same evaluateDiscoveryWorthiness call rather
          // than hardcoded, so the signal stays source-agnostic and
          // correct if the gate's own criteria ever change.
          hasStoryBearingClaim: worthiness.projectableForDiscovery,
        },
      };
      compositionMap[subjectId] = claimIds;
    } else {
      rejectedForWorthiness.push(subjectId);
    }
  }

  return {
    version: projection.version,
    generatedAt: projection.generatedAt,
    entries,
    compositionMap,
    nonProjectableClaimIds: projection.nonProjectableClaimIds,
    worthinessBySubject,
    rejectedForWorthiness,
  };
}
