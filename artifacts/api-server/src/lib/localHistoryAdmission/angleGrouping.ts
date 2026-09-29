/**
 * First-slice angle-grouping plumbing for the Streetlit local-history
 * admission engine.
 *
 * Adds a structural layer between the canonical admitted-claim artifact
 * (artifact.ts) and runtime projection (projector.ts) that can represent
 * MULTIPLE independently-worthwhile story angles per subject — e.g. a
 * building's physical/architectural story and a separate former-use/event
 * story — without changing trust/admission, without touching canonical
 * claim records, and without introducing a composite subjectId+angleId
 * lookup key anywhere downstream.
 *
 * This module is deliberately a NO-OP in this first slice: it proves the
 * data shape and plumbing only. It does not infer, rank, or choose angles.
 * Every eligible claim starts out ungrouped; real grouping logic is a later
 * slice.
 *
 * groupClaimsIntoAngles() consumes the admitted-claim artifact directly
 * (artifact.claims is the source of truth for which claims exist and are
 * admitted). projection.compositionMap is used only as the current
 * eligibility lookup — which claimIds belong to which subject — exactly the
 * same lookup projectRuntimeCompat itself already performs. This function
 * never reads projection.entries (the flattened CuratedEntry output) and
 * must not start doing so in later slices either: angle grouping sits
 * upstream of the flattened compatibility projection, not downstream of it.
 */
import type { CuratedEntry } from "../curatedLocalHistory";
import type { GeneratedEvidenceArtifact } from "./artifact";
import type { GeneratedRuntimeProjection } from "./projector";
import type { DiscoveryWorthinessGateResult } from "./worthiness";

/** Opaque per-subject slug/free-text label. Not a lookup key on its own — always paired with subjectId. */
export type AngleId = string;

export interface AngleGroup {
  subjectId: string;
  angleId: AngleId;
  /** The specific question this angle answers, distinct from other angles on the same subject. */
  centralQuestion: string;
  /** Why this angle is independently worth telling, not a redundant restatement of another angle. */
  perspectiveShift: string;
  /**
   * Admitted claimIds composing this angle. A claimId MAY appear in more
   * than one AngleGroup for the same subject when it genuinely supports
   * more than one angle — this is intentional, not a defect to dedupe.
   */
  claimIds: string[];
}

export interface SubjectAngleGrouping {
  subjectId: string;
  /** Zero, one, or several groups. Empty is a valid, real result — never synthesized to avoid emptiness. */
  angleGroups: AngleGroup[];
  /** Eligible admitted claimIds for this subject not currently assigned to any angle group. */
  ungroupedClaimIds: string[];
}

export interface AngleGroupingResult {
  version: 1;
  generatedAt: string;
  bySubject: Record<string, SubjectAngleGrouping>;
}

/**
 * Deliberately no-op for this first slice: assigns zero angle groups to
 * every projection-eligible subject and places all of that subject's
 * eligible claimIds into ungroupedClaimIds. Deterministic (mirrors the
 * already-deterministic iteration order of projection.compositionMap) and
 * does not mutate either input.
 */
export function groupClaimsIntoAngles(
  artifact: GeneratedEvidenceArtifact,
  projection: GeneratedRuntimeProjection,
): AngleGroupingResult {
  const knownClaimIds = new Set(
    artifact.claims.map((record) => record.claimId),
  );

  const bySubject: Record<string, SubjectAngleGrouping> = {};
  for (const [subjectId, claimIds] of Object.entries(
    projection.compositionMap,
  )) {
    for (const claimId of claimIds) {
      if (!knownClaimIds.has(claimId)) {
        throw new Error(
          `groupClaimsIntoAngles: composed claimId "${claimId}" (subjectId "${subjectId}") not found in artifact.claims.`,
        );
      }
    }
    bySubject[subjectId] = {
      subjectId,
      angleGroups: [],
      ungroupedClaimIds: [...claimIds],
    };
  }

  return {
    version: 1,
    generatedAt: artifact.generatedAt,
    bySubject,
  };
}

/**
 * Migration-only wrapper. Structurally separate from AngleGroup — a
 * flattenedFallback is never a stand-in for a real angle and must never be
 * synthesized as one. Consumed only during the migration window while angle
 * grouping is unvalidated; not a permanent parallel data model.
 */
export interface SubjectDiscoveryProjection {
  subjectId: string;
  angleGroups: AngleGroup[];
  /**
   * MIGRATION-ONLY. Populated only when this subject currently has zero
   * angle groups AND it passed today's existing flattened discovery-
   * worthiness gate (worthiness.ts). Never populated to paper over a
   * subject that angle grouping has genuinely found nothing for once angle
   * grouping is calibrated/validated — see angleGrouping.ts module doc.
   */
  flattenedFallback?: CuratedEntry;
}

/**
 * Resolves the migration-only SubjectDiscoveryProjection wrapper from this
 * slice's (no-op) angle-grouping result and the existing worthiness gate
 * result. Does not mutate either input.
 */
export function resolveSubjectDiscoveryProjections(
  grouping: AngleGroupingResult,
  gated: DiscoveryWorthinessGateResult,
): Record<string, SubjectDiscoveryProjection> {
  const result: Record<string, SubjectDiscoveryProjection> = {};
  for (const [subjectId, subjectGrouping] of Object.entries(
    grouping.bySubject,
  )) {
    result[subjectId] = {
      subjectId,
      angleGroups: subjectGrouping.angleGroups,
      flattenedFallback:
        subjectGrouping.angleGroups.length === 0
          ? gated.entries[subjectId]
          : undefined,
    };
  }
  return result;
}
