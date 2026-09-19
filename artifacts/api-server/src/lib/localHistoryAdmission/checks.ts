/**
 * Provenance-aware claim integrity checks for the Streetlit local-history
 * admission engine.
 *
 * Promoted (faithful port) from experiments/hybrid-discovery-v0.1/checks.ts
 * for production offline batch-tool use.
 *
 * Each check is a pure function (CheckContext) -> CheckResult. The check list
 * is a plain array so future failure shapes can add a check without touching
 * the extractor, grounding, or decision code.
 */
import type {
  CheckContext,
  CheckResult,
  ClaimCheck,
  ClaimType,
  EpistemicMarker,
  Source,
} from "./types";

/**
 * Walks underlyingProvenanceOf chains to the root source(s) a claim actually
 * rests on. Two sources in the same chain are the same underlying evidence,
 * not independent corroboration — this is the direct fix for the 1822
 * Spring Garden failure shape (two pages, one ecosystem).
 */
function resolveRootProvenance(
  sourceId: string,
  sources: Record<string, Source>,
  seen = new Set<string>(),
): Set<string> {
  if (seen.has(sourceId)) return seen;
  seen.add(sourceId);
  const source = sources[sourceId];
  if (!source) return seen;
  // If this source declares no underlying provenance of its own, it IS a
  // root. If it does, recurse into each declared upstream source instead of
  // counting this source as an independent root.
  if (
    !source.underlyingProvenanceOf ||
    source.underlyingProvenanceOf.length === 0
  ) {
    return seen;
  }
  for (const upstreamId of source.underlyingProvenanceOf) {
    resolveRootProvenance(upstreamId, sources, seen);
  }
  return seen;
}

/** Root provenance + source-class set for one claim, used for corroboration counting. */
function claimProvenanceProfile(
  sourceIds: string[],
  sources: Record<string, Source>,
) {
  const roots = new Set<string>();
  const classes = new Set<string>();
  for (const id of sourceIds) {
    const source = sources[id];
    if (!source) continue;
    classes.add(source.sourceClass);
    for (const root of resolveRootProvenance(id, sources)) roots.add(root);
  }
  return { roots, classes };
}

const admissibleSourceClass: ClaimCheck = ({ claim, sources }) => {
  const inadmissible = claim.sourceIds.filter(
    (id) => sources[id]?.sourceClass === "inadmissible-generic-web",
  );
  if (
    inadmissible.length === claim.sourceIds.length &&
    inadmissible.length > 0
  ) {
    return {
      checkId: "admissible-source-class",
      outcome: "fail",
      reason: `All cited sources (${inadmissible.join(", ")}) resolve to an inadmissible source class. Not one of the seven approved families.`,
    };
  }
  return {
    checkId: "admissible-source-class",
    outcome: "pass",
    reason: "At least one cited source belongs to an approved source class.",
  };
};

const synthesizedSearchRejection: ClaimCheck = ({ claim, sources }) => {
  const synthesized = claim.sourceIds.filter(
    (id) => sources[id]?.isSynthesizedSearchOutput,
  );
  if (synthesized.length > 0) {
    return {
      checkId: "synthesized-search-rejection",
      outcome: "fail",
      reason: `Claim resolves to a synthesized AI/search-engine output (${synthesized.join(", ")}) rather than an admissible underlying source. Search summaries may only surface a lead for discovery, never serve as the resolved evidentiary source.`,
    };
  }
  return {
    checkId: "synthesized-search-rejection",
    outcome: "pass",
    reason: "No cited source is a synthesized search output.",
  };
};

const provenanceTracing: ClaimCheck = ({ claim, sources }) => {
  const unverified = claim.sourceIds
    .map((id) => sources[id])
    .filter(
      (source): source is Source =>
        !!source && source.provenanceVerified === false,
    );
  if (unverified.length > 0) {
    const notes = unverified
      .map(
        (s) =>
          s.provenanceVerificationNote ?? "underlying citation not verified",
      )
      .join(" | ");
    return {
      checkId: "provenance-tracing",
      outcome: "fail",
      reason: `Underlying citation was traced and did not support the claim: ${notes}`,
    };
  }
  return {
    checkId: "provenance-tracing",
    outcome: "pass",
    reason: "No cited source has a failed provenance-verification note.",
  };
};

// Claim types that describe a single fixed fact about a place (a building
// has exactly one construction date) — for these, any other precise date of
// the same claimType at the same place is automatically a real conflict.
// All other claim types (e.g. "event") can legitimately have many distinct,
// non-conflicting instances at the same place over time (a split, then a
// later transition; a sale, then a later purchase) — for those, a
// same-claimType/different-date pair is only a genuine conflict when both
// claims explicitly assert the SAME underlying fact via a shared
// corroborationKey (e.g. two sources disagreeing on the date of the same
// named sale), not merely because they share a claimType.
const SINGULAR_FACT_CLAIM_TYPES: ClaimType[] = ["construction-date"];

const temporalConsistency: ClaimCheck = ({ claim, allClaims }) => {
  if (!claim.dateRange)
    return {
      checkId: "temporal-consistency",
      outcome: "pass",
      reason: "No date range asserted; nothing to check.",
    };
  const isSingularFact = SINGULAR_FACT_CLAIM_TYPES.includes(claim.claimType);
  const conflicts = allClaims.filter(
    (other) =>
      other.id !== claim.id &&
      other.placeKey === claim.placeKey &&
      other.claimType === claim.claimType &&
      other.dateRange &&
      other.dateRange.precise &&
      claim.dateRange!.precise &&
      other.dateRange.start &&
      claim.dateRange!.start &&
      other.dateRange.start !== claim.dateRange!.start &&
      (isSingularFact ||
        (!!claim.corroborationKey &&
          claim.corroborationKey === other.corroborationKey)),
  );
  if (conflicts.length > 0) {
    return {
      checkId: "temporal-consistency",
      outcome: "block-auto-admit",
      reason: `Conflicts with another precise ${claim.claimType} date for the same underlying fact at the same place (${conflicts.map((c) => c.id).join(", ")}). Needs human resolution.`,
    };
  }
  return {
    checkId: "temporal-consistency",
    outcome: "pass",
    reason:
      "No conflicting precise date found for the same underlying fact at this place/claim type.",
  };
};

const superlativeCorroboration: ClaimCheck = ({
  claim,
  allClaims,
  sources,
}) => {
  if (
    claim.claimType !== "superlative" &&
    !claim.epistemicMarkers?.includes("superlative")
  ) {
    return {
      checkId: "superlative-exclusivity-corroboration",
      outcome: "pass",
      reason: "Not a superlative/exclusivity claim.",
    };
  }
  const profile = claimProvenanceProfile(claim.sourceIds, sources);
  const corroborators = claim.corroborationKey
    ? allClaims.filter(
        (other) =>
          other.id !== claim.id &&
          other.corroborationKey === claim.corroborationKey &&
          claimProvenanceProfile(other.sourceIds, sources).classes.size > 0 &&
          [...claimProvenanceProfile(other.sourceIds, sources).classes].some(
            (c) => !profile.classes.has(c),
          ),
      )
    : [];
  if (corroborators.length === 0) {
    return {
      checkId: "superlative-exclusivity-corroboration",
      outcome: "block-auto-admit",
      reason:
        "Superlative/exclusivity claim has no independent-source-class corroboration; treat as uncorroborated boast, not fact.",
    };
  }
  return {
    checkId: "superlative-exclusivity-corroboration",
    outcome: "pass",
    reason: `Corroborated by an independent source class via ${corroborators.map((c) => c.id).join(", ")}.`,
  };
};

const epistemicMarkerPreservation: ClaimCheck = ({ claim }) => {
  if (claim.sourceRefutesThisClaim) {
    return {
      checkId: "epistemic-marker-preservation",
      outcome: "fail",
      reason:
        "Source explicitly states this claim (rumor/allegation) is false. Recorded for the record, never admitted as fact.",
    };
  }
  const blockingMarkers: EpistemicMarker[] = [
    "legend-or-tradition",
    "unresolved-cross-source-conflict",
    "author-uncertainty",
    "disputed-across-sources",
  ];
  if (claim.epistemicMarkers?.some((m) => blockingMarkers.includes(m))) {
    return {
      checkId: "epistemic-marker-preservation",
      outcome: "block-auto-admit",
      reason: `Claim carries an epistemic marker (${claim.epistemicMarkers.join(", ")}) that must not be silently dropped or presented as settled fact.`,
    };
  }
  return {
    checkId: "epistemic-marker-preservation",
    outcome: "pass",
    reason: "No blocking epistemic marker present.",
  };
};

// Pass 1: checks that can independently SUPPRESS a claim on their own merits
// (source admissibility, synthesized-search rejection, provenance failure,
// explicit source-refutation). These never look at other claims.
const INDEPENDENT_CHECKS: ClaimCheck[] = [
  admissibleSourceClass,
  synthesizedSearchRejection,
  provenanceTracing,
  epistemicMarkerPreservation,
];

// Pass 2: relational/cross-claim checks (temporal consistency, corroboration).
// A claim that Pass 1 would independently SUPPRESS must not be allowed to
// contaminate another claim's Pass 2 result — e.g. a synthesized-search date
// claim that is itself correctly SUPPRESSED should not collateral-HOLD a
// separate, independently trustworthy claim via a manufactured date conflict.
const RELATIONAL_CHECKS: ClaimCheck[] = [
  temporalConsistency,
  superlativeCorroboration,
];

function isIndependentlyDisqualified(
  claim: CheckContext["claim"],
  sources: CheckContext["sources"],
): boolean {
  return INDEPENDENT_CHECKS.some(
    (check) => check({ claim, allClaims: [], sources }).outcome === "fail",
  );
}

export const CHECKS: ClaimCheck[] = [
  admissibleSourceClass,
  synthesizedSearchRejection,
  provenanceTracing,
  temporalConsistency,
  superlativeCorroboration,
  epistemicMarkerPreservation,
];

export function runChecks(ctx: CheckContext): CheckResult[] {
  // Only claims that survive Pass 1 on their own merits may be used as the
  // "other claim" side of a Pass 2 relational comparison.
  const eligibleClaims = ctx.allClaims.filter(
    (c) => !isIndependentlyDisqualified(c, ctx.sources),
  );
  const relationalCtx: CheckContext = { ...ctx, allClaims: eligibleClaims };

  return CHECKS.map((check) =>
    RELATIONAL_CHECKS.includes(check) ? check(relationalCtx) : check(ctx),
  );
}

export { resolveRootProvenance, claimProvenanceProfile };
