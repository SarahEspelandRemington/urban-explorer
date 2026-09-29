/**
 * Stage 2 (editorial acceptance) plumbing for the Streetlit local-history
 * admission engine.
 *
 * Pure type-level and pure-function support only, for this slice: it
 * distinguishes grounded candidate angles produced by Stage 1
 * (CandidateAngle) from accepted AngleGroup objects that have passed Stage 2
 * editorial acceptance, and from rejected candidates retained for audit.
 *
 * This module performs no model invocation itself — `judge` is injected by
 * the caller — and changes no runtime narration, projector, or existing
 * flattened-fallback migration behavior (see angleGrouping.ts, which this
 * file imports AngleGroup/AngleId from but does not modify).
 */
import type { AngleGroup, AngleId } from "./angleGrouping";
import type { GeneratedEvidenceArtifact } from "./artifact";

/**
 * A grounded, coherent cluster of admitted claims proposed by Stage 1 — not
 * yet accepted. Deliberately not aliased to AngleGroup, and deliberately has
 * `candidateId` rather than `angleId`: a CandidateAngle must never be
 * structurally usable wherever an accepted AngleGroup is expected without an
 * explicit, visible promotion step (see applyEditorialAcceptance below).
 */
export interface CandidateAngle {
  subjectId: string;
  candidateId: string;
  centralQuestion: string;
  perspectiveShift: string;
  claimIds: string[];
}

export interface SubjectCandidateGrouping {
  subjectId: string;
  candidates: CandidateAngle[];
  /** Eligible admitted claimIds for this subject that Stage 1 did not assign to any candidate. */
  ungroupedClaimIds: string[];
}

/** Minimal Stage 2 acceptance judgment. No scores, tiers, confidence, or reason-code ontology. */
export interface Stage2Result {
  accepted: boolean;
  reason: string;
}

/** A candidate Stage 2 declined to promote. The original CandidateAngle is preserved unchanged for audit. */
export interface RejectedCandidate {
  candidate: CandidateAngle;
  rejectionReason: string;
}

export interface SubjectAngleEvaluation {
  subjectId: string;
  /** Zero is a valid, real result — never synthesized to avoid emptiness. */
  acceptedAngles: AngleGroup[];
  rejectedCandidates: RejectedCandidate[];
  /**
   * Passed through unchanged from the input SubjectCandidateGrouping. A
   * rejected candidate's claimIds are never folded in here — they remain
   * attached to their RejectedCandidate instead, since "Stage 1 found no
   * coherent story" and "Stage 1 found one but Stage 2 rejected it" are
   * semantically different outcomes.
   */
  ungroupedClaimIds: string[];
}

/** Exact assigned claim text for one of a candidate's claimIds, resolved from the canonical artifact. */
export interface Stage2AssignedClaim {
  claimId: string;
  claimText: string;
}

export interface Stage2Input {
  subjectId: string;
  subjectName: string;
  candidate: CandidateAngle;
  assignedClaims: Stage2AssignedClaim[];
}

/**
 * Resolves each candidate's exact assigned claims from the canonical
 * artifact, judges each candidate exactly once via the injected `judge`, and
 * partitions the result into accepted AngleGroups (with an explicit
 * candidateId -> angleId promotion) and RejectedCandidates (original
 * CandidateAngle preserved unchanged, paired with Stage 2's reason).
 *
 * Does not mutate its inputs. Does not read worthiness/gate output, the
 * projector, or curatedLocalHistory.ts — Stage 2 acceptance is judged solely
 * from the candidate and its own assigned claim text.
 */
export function applyEditorialAcceptance(
  grouping: SubjectCandidateGrouping,
  artifact: GeneratedEvidenceArtifact,
  subjectName: string,
  judge: (input: Stage2Input) => Stage2Result,
): SubjectAngleEvaluation {
  const claimTextByClaimId = new Map(
    artifact.claims.map((record) => [record.claimId, record.claim.claimText]),
  );

  const acceptedAngles: AngleGroup[] = [];
  const rejectedCandidates: RejectedCandidate[] = [];

  for (const candidate of grouping.candidates) {
    const assignedClaims: Stage2AssignedClaim[] = candidate.claimIds.map(
      (claimId) => {
        const claimText = claimTextByClaimId.get(claimId);
        if (claimText === undefined) {
          throw new Error(
            `applyEditorialAcceptance: candidate "${candidate.candidateId}" (subjectId "${grouping.subjectId}") references claimId "${claimId}", which was not found in artifact.claims.`,
          );
        }
        return { claimId, claimText };
      },
    );

    const result = judge({
      subjectId: grouping.subjectId,
      subjectName,
      candidate,
      assignedClaims,
    });

    if (result.accepted) {
      const angleId: AngleId = candidate.candidateId;
      acceptedAngles.push({
        subjectId: candidate.subjectId,
        angleId,
        centralQuestion: candidate.centralQuestion,
        perspectiveShift: candidate.perspectiveShift,
        claimIds: candidate.claimIds,
      });
    } else {
      rejectedCandidates.push({ candidate, rejectionReason: result.reason });
    }
  }

  return {
    subjectId: grouping.subjectId,
    acceptedAngles,
    rejectedCandidates,
    ungroupedClaimIds: [...grouping.ungroupedClaimIds],
  };
}
