// Isolated experiment only. Stage 2 (editorial acceptance) types. Deliberately
// separate from types.ts (Stage 1) — Stage 1 is not modified by this file.
export interface Stage2ClaimInput {
  claimId: string;
  claimText: string;
}

export interface Stage2CandidateInput {
  subjectId: string;
  subjectName: string;
  centralQuestion: string;
  perspectiveShift: string;
  claims: Stage2ClaimInput[];
}

export interface Stage2Output {
  accepted: boolean;
  reason: string;
}
