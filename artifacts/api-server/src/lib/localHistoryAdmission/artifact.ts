/**
 * Canonical generated-evidence artifact for the Streetlit local-history
 * admission engine.
 *
 * This is the full, audit-grade record of every claim's admission outcome
 * (AUTO-ADMIT, HOLD, and SUPPRESS are all retained here) together with the
 * per-source capability snapshot each decision rested on. It is NOT imported
 * by runtime code and is NOT itself the compatibility-shaped data merged
 * into curatedLocalHistory.ts — see projector.ts for the AUTO-ADMIT-only
 * runtime projection derived from this artifact.
 *
 * Design note (subjectId / placeKey / productionSubjectId): `claim.placeKey`
 * is the internal claim/cross-source join key only — it is NOT a production
 * runtime identity and must never be treated as one. This artifact's
 * `subjectId` is instead derived exclusively from `claim.productionSubjectId`
 * (an OSM element id or an explicitly registered StreetlitPlace id), which is
 * only ever set by deterministic grounding or an explicit human-established
 * link — never guessed from placeKey, address similarity, place name, or
 * fuzzy proximity. A claim with no `productionSubjectId` gets `subjectId:
 * undefined` here and is recorded as non-projectable in the summary rather
 * than silently falling back to placeKey.
 */
import type {
  Claim,
  ClaimOutcome,
  ClaimType,
  Source,
  SourceCapability,
} from "./types";
import { runPipeline } from "./pipeline";

/** Snapshot of one cited source's capability for this specific claim's claimType, at generation time. */
export interface SourceCapabilitySnapshot {
  sourceId: string;
  title: string;
  url?: string;
  sourceClass: Source["sourceClass"];
  publicationDate?: string;
  /** This source's declared capability for the claim's own claimType, if any. */
  capabilityForClaimType?: SourceCapability;
  isSynthesizedSearchOutput?: boolean;
  provenanceVerified?: boolean;
  provenanceVerificationNote?: string;
}

export interface GeneratedClaimRecord {
  claimId: string;
  /**
   * The claim's deterministic production identity (claim.productionSubjectId)
   * — see design note above. `undefined` when the claim has no deterministic
   * production identity; such a claim is non-projectable regardless of its
   * decision, and is listed in summary.nonProjectableClaimIds.
   */
  subjectId: string | undefined;
  claim: Claim;
  sourceCapabilitySnapshots: SourceCapabilitySnapshot[];
  checks: ClaimOutcome["checks"];
  grounding: ClaimOutcome["grounding"];
  decision: ClaimOutcome["decision"];
}

export interface GeneratedEvidenceArtifactSummary {
  totalClaims: number;
  byDecision: { "AUTO-ADMIT": number; HOLD: number; SUPPRESS: number };
  /** Distinct (defined) subjectIds present in this artifact. */
  subjectCount: number;
  /**
   * Defensive record of invariant violations found while generating this
   * artifact (e.g. a claim citing an unknown source, or an AUTO-ADMIT claim
   * with grounding confidence "none" — the latter should never happen given
   * decide.ts's own gating, but is recorded rather than silently trusted).
   * A non-empty list does not itself change any claim's decision.
   */
  integrityViolations: string[];
  /**
   * claimIds with no deterministic productionSubjectId — expected, not an
   * integrity violation. A claim can be a factually well-corroborated
   * AUTO-ADMIT and still legitimately lack a production identity (e.g. an
   * "unresolved" or "former-site" grounding with no explicit StreetlitPlace
   * link); such claims cannot project to any runtime surface until a
   * deterministic identity is established for them.
   */
  nonProjectableClaimIds: string[];
}

export interface GeneratedEvidenceArtifact {
  version: 1;
  generatedAt: string;
  claims: GeneratedClaimRecord[];
  summary: GeneratedEvidenceArtifactSummary;
}

// Canonical ordering of claim types, used only to make artifact output
// deterministic — not a statement about relative importance.
const CLAIM_TYPE_ORDER: ClaimType[] = [
  "identity",
  "construction-date",
  "architect",
  "register-status",
  "use-history",
  "biographical",
  "institutional-founding",
  "event",
  "superlative",
  "legend-tradition",
  "statistic",
  "demolition",
  "relationship",
];

function claimTypeRank(claimType: ClaimType): number {
  const idx = CLAIM_TYPE_ORDER.indexOf(claimType);
  return idx === -1 ? CLAIM_TYPE_ORDER.length : idx;
}

// Sentinel used only to give undefined subjectIds a stable, last position in
// sort order — never written to any record's actual subjectId.
const UNDEFINED_SUBJECT_SORT_KEY = "\uFFFF";

function compareRecords(
  a: GeneratedClaimRecord,
  b: GeneratedClaimRecord,
): number {
  const aKey = a.subjectId ?? UNDEFINED_SUBJECT_SORT_KEY;
  const bKey = b.subjectId ?? UNDEFINED_SUBJECT_SORT_KEY;
  if (aKey !== bKey) return aKey < bKey ? -1 : 1;
  const rankDiff =
    claimTypeRank(a.claim.claimType) - claimTypeRank(b.claim.claimType);
  if (rankDiff !== 0) return rankDiff;
  if (a.claimId !== b.claimId) return a.claimId < b.claimId ? -1 : 1;
  return 0;
}

function buildSourceCapabilitySnapshot(
  sourceId: string,
  claimType: ClaimType,
  sources: Record<string, Source>,
): SourceCapabilitySnapshot | undefined {
  const source = sources[sourceId];
  if (!source) return undefined;
  return {
    sourceId: source.id,
    title: source.title,
    url: source.url,
    sourceClass: source.sourceClass,
    publicationDate: source.publicationDate,
    capabilityForClaimType: source.capabilities.find(
      (c) => c.claimType === claimType,
    ),
    isSynthesizedSearchOutput: source.isSynthesizedSearchOutput,
    provenanceVerified: source.provenanceVerified,
    provenanceVerificationNote: source.provenanceVerificationNote,
  };
}

export interface GenerateArtifactOptions {
  /** Overrides the wall-clock generatedAt timestamp — used for deterministic tests/regeneration diffing. */
  generatedAt?: string;
}

export function generateArtifact(
  claims: Claim[],
  sources: Record<string, Source>,
  options: GenerateArtifactOptions = {},
): GeneratedEvidenceArtifact {
  const outcomes = runPipeline(claims, sources);
  const integrityViolations: string[] = [];

  const records: GeneratedClaimRecord[] = outcomes.map((outcome) => {
    const snapshots: SourceCapabilitySnapshot[] = [];
    for (const sourceId of outcome.claim.sourceIds) {
      const snapshot = buildSourceCapabilitySnapshot(
        sourceId,
        outcome.claim.claimType,
        sources,
      );
      if (!snapshot) {
        integrityViolations.push(
          `Claim "${outcome.claim.id}" cites unknown source id "${sourceId}".`,
        );
        continue;
      }
      snapshots.push(snapshot);
    }

    if (
      outcome.decision.decision === "AUTO-ADMIT" &&
      outcome.grounding.confidence === "none"
    ) {
      integrityViolations.push(
        `Claim "${outcome.claim.id}" is AUTO-ADMIT but grounding confidence is "none" — this should never happen given decide.ts's own gating.`,
      );
    }

    return {
      claimId: outcome.claim.id,
      subjectId: outcome.claim.productionSubjectId,
      claim: outcome.claim,
      sourceCapabilitySnapshots: snapshots,
      checks: outcome.checks,
      grounding: outcome.grounding,
      decision: outcome.decision,
    };
  });

  records.sort(compareRecords);

  const byDecision = { "AUTO-ADMIT": 0, HOLD: 0, SUPPRESS: 0 };
  const subjectIds = new Set<string>();
  const nonProjectableClaimIds: string[] = [];
  for (const record of records) {
    byDecision[record.decision.decision]++;
    if (record.subjectId) subjectIds.add(record.subjectId);
    else nonProjectableClaimIds.push(record.claimId);
  }

  return {
    version: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    claims: records,
    summary: {
      totalClaims: records.length,
      byDecision,
      subjectCount: subjectIds.size,
      integrityViolations,
      nonProjectableClaimIds,
    },
  };
}
