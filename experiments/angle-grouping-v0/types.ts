// Isolated experiment only. Not wired into any production/offline pipeline.
// Re-exports the settled production shape so this experiment's output is
// structurally identical to what a real producer would eventually return —
// without importing or modifying any production runtime/pipeline code.
export type AngleId = string;

export interface AngleGroup {
  subjectId: string;
  angleId: AngleId;
  centralQuestion: string;
  perspectiveShift: string;
  claimIds: string[];
}

export interface SubjectAngleGrouping {
  subjectId: string;
  angleGroups: AngleGroup[];
  ungroupedClaimIds: string[];
}

/** Deliberately narrow claim shape given to the blind producer — no source
 * prestige/provenance, no trust/confidence scores, no worthiness output, no
 * expected angle count, no narration text, no flattened evidence.text. */
export interface ProducerClaimInput {
  claimId: string;
  claimText: string;
  claimType: string;
}

export interface ProducerInput {
  subjectId: string;
  subjectName: string;
  claims: ProducerClaimInput[];
}
