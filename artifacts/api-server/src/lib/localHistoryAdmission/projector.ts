/**
 * AUTO-ADMIT-only compatibility projector for the Streetlit local-history
 * admission engine.
 *
 * Mechanically (non-LLM, non-manual) derives a runtime-compatible
 * projection — structurally identical to curatedLocalHistory.ts's
 * `CuratedEntry` shape — from a canonical generated-evidence artifact
 * (see artifact.ts). This module does NOT merge anything into
 * curatedLocalHistory.ts; it only produces the projection data. Wiring the
 * output into the actual curated registry is a separate, later step.
 *
 * Trust-mapping rules (as corrected/approved):
 *   - `verificationConfidence` = conservative (weakest-link) aggregation of
 *     grounding/identity confidence across the composed AUTO-ADMIT claims.
 *   - `curatedTrust` = conservative (weakest-link) aggregation of factual/
 *     evidentiary trust across the composed AUTO-ADMIT claims.
 *   - `editorialQuality` is NOT used in either computation. It remains
 *     preserved per-claim in the canonical artifact only.
 *
 * Only AUTO-ADMIT claims (with grounding confidence other than "none",
 * checked defensively even though decide.ts's own gating should guarantee
 * this) ever contribute to a projected entry — HOLD and SUPPRESS claims are
 * excluded categorically, never partially blended in.
 */
import type {
  CuratedEntry,
  CuratedSource,
  TrustSignal,
  VerificationStatus,
} from "../curatedLocalHistory";
import type {
  GeneratedClaimRecord,
  GeneratedEvidenceArtifact,
} from "./artifact";
import type { Source } from "./types";

const TRUST_RANK: Record<TrustSignal, number> = { low: 0, medium: 1, high: 2 };
const IDENTITY_RANK: Record<"none" | "low" | "medium" | "high", number> = {
  none: -1,
  low: 0,
  medium: 1,
  high: 2,
};
const RANK_TO_TRUST_SIGNAL: TrustSignal[] = ["low", "medium", "high"];

// Human-readable label for each approved SourceClass, used only to build the
// free-text CuratedSource.sourceType disclosure string — reusing the exact
// same free-text convention already used by hand-written multi-source
// entries (e.g. the Polonia/Reyburn Mansion entries), per inspection of
// CuratedSource and its single (diagnostic-only) sourceType consumer. No new
// semantic sourceType is introduced.
const SOURCE_CLASS_LABEL: Record<Source["sourceClass"], string> = {
  "government-preservation-record": "government preservation record",
  "built-environment-cultural-database":
    "built-environment/cultural database entry",
  "local-public-history-narrative": "local public-history narrative source",
  "institutional-history-archive": "institutional history archive",
  "marker-plaque-structured-dataset":
    "historical marker/plaque structured dataset",
  "wikipedia-wikidata": "Wikipedia/Wikidata reference",
  osm: "OpenStreetMap tag data",
  "inadmissible-generic-web": "inadmissible generic web source",
};

export interface GeneratedRuntimeProjection {
  version: 1;
  generatedAt: string;
  /** subjectId -> composed CuratedEntry, structurally compatible with curatedLocalHistory.ts. */
  entries: Record<string, CuratedEntry>;
  /** subjectId -> ordered claimIds composed into that entry, for audit/traceability back to the artifact. */
  compositionMap: Record<string, string[]>;
  /**
   * claimIds that are otherwise AUTO-ADMIT-eligible but carry no
   * deterministic subjectId (claim.productionSubjectId), and so cannot
   * project to any runtime entry. Fail-closed, not an error — see
   * artifact.ts's summary.nonProjectableClaimIds.
   */
  nonProjectableClaimIds: string[];
}

function isProjectionEligible(record: GeneratedClaimRecord): boolean {
  return (
    record.decision.decision === "AUTO-ADMIT" &&
    record.grounding.confidence !== "none" &&
    record.decision.identityConfidence !== "none" &&
    !!record.subjectId
  );
}

function aggregateConservative<T extends string>(
  values: T[],
  rank: Record<T, number>,
): number {
  return values.reduce((min, v) => Math.min(min, rank[v]), Infinity);
}

function buildCompositeSource(group: GeneratedClaimRecord[]): CuratedSource {
  const admissibleSnapshots = group
    .flatMap((r) => r.sourceCapabilitySnapshots)
    .filter((s) => s.sourceClass !== "inadmissible-generic-web");

  const bySourceId = new Map<string, (typeof admissibleSnapshots)[number]>();
  for (const snapshot of admissibleSnapshots) {
    if (!bySourceId.has(snapshot.sourceId))
      bySourceId.set(snapshot.sourceId, snapshot);
  }
  const distinctSnapshots = [...bySourceId.values()];

  const claimIds = group.map((r) => r.claimId);
  const usageNote = `Mechanically composed by the local-history admission pipeline from ${group.length} independently AUTO-ADMIT claim(s) (${claimIds.join(", ")}), drawing on: ${distinctSnapshots.map((s) => s.title).join("; ")}. See the canonical generated-evidence artifact for full per-claim provenance, checks, and grounding. Not yet subject to any additional human editorial review beyond the automated admission checks.`;

  if (distinctSnapshots.length === 1) {
    const only = distinctSnapshots[0];
    return {
      title: only.title,
      url: only.url,
      sourceType: SOURCE_CLASS_LABEL[only.sourceClass],
      usageNote,
      publicationDate: only.publicationDate,
    };
  }

  return {
    title: distinctSnapshots.map((s) => s.title).join(" / "),
    url: distinctSnapshots.find((s) => s.url)?.url,
    sourceType: `multi-source automated composite (${distinctSnapshots.length} sources): ${distinctSnapshots.map((s) => SOURCE_CLASS_LABEL[s.sourceClass]).join(", ")}`,
    usageNote,
    // Publication dates would be ambiguous/misleading to pick arbitrarily across multiple distinct sources — omit.
  };
}

function buildClaimScope(group: GeneratedClaimRecord[]): string {
  const distinctClaimTypes = [...new Set(group.map((r) => r.claim.claimType))];
  return `Mechanically composed from ${group.length} admitted claim(s) covering: ${distinctClaimTypes.join(", ")}. Each claim's own supportingSpan is the evidentiary basis for its portion of the text below — see the canonical generated-evidence artifact (claim ids: ${group.map((r) => r.claimId).join(", ")}) for full per-claim provenance.`;
}

export function projectRuntimeCompat(
  artifact: GeneratedEvidenceArtifact,
): GeneratedRuntimeProjection {
  const eligible = artifact.claims.filter(isProjectionEligible);
  const nonProjectableClaimIds = artifact.claims
    .filter(
      (record) =>
        record.decision.decision === "AUTO-ADMIT" &&
        record.grounding.confidence !== "none" &&
        record.decision.identityConfidence !== "none" &&
        !record.subjectId,
    )
    .map((record) => record.claimId);

  // artifact.claims is already deterministically sorted by (subjectId, claimType, claimId);
  // grouping via a Map preserves that order, so iteration below is itself deterministic.
  const groups = new Map<string, GeneratedClaimRecord[]>();
  for (const record of eligible) {
    // isProjectionEligible already guarantees record.subjectId is defined.
    const subjectId = record.subjectId!;
    const group = groups.get(subjectId);
    if (group) group.push(record);
    else groups.set(subjectId, [record]);
  }

  const entries: Record<string, CuratedEntry> = {};
  const compositionMap: Record<string, string[]> = {};
  const lastVerifiedDate = artifact.generatedAt.slice(0, 10);
  const verificationStatus: VerificationStatus = "approved";

  for (const [subjectId, group] of groups) {
    const curatedTrustRank = aggregateConservative(
      group.map((r) => r.decision.factualTrust),
      TRUST_RANK,
    );
    const verificationConfidenceRank = aggregateConservative(
      group.map((r) => r.decision.identityConfidence),
      IDENTITY_RANK,
    );

    entries[subjectId] = {
      source: buildCompositeSource(group),
      evidence: {
        subjectId,
        text: group.map((r) => r.claim.claimText.trim()).join(" "),
        claimScope: buildClaimScope(group),
        verificationStatus,
        verificationConfidence:
          RANK_TO_TRUST_SIGNAL[verificationConfidenceRank],
        curatedTrust: RANK_TO_TRUST_SIGNAL[curatedTrustRank],
        lastVerifiedDate,
        // explicitDiscoveryTier intentionally left unset — this is an editorial call
        // this mechanical pipeline does not make; falls through to the ordinary classifier.
        admissionMethod: "automated",
      },
    };
    compositionMap[subjectId] = group.map((r) => r.claimId);
  }

  return {
    version: 1,
    generatedAt: artifact.generatedAt,
    entries,
    compositionMap,
    nonProjectableClaimIds,
  };
}
