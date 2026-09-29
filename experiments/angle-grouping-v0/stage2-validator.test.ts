/**
 * Focused regression coverage for the possessive-suffix fix to
 * validateStage2Output's mechanical entity/proper-noun grounding check
 * (2026-09-29). Same false-positive class already fixed in validator.ts
 * (Stage 1) on 2026-09-29: a trailing possessive ('s or the typographic
 * variant 's) on an otherwise-grounded multi-word entity was treated as a
 * distinct, ungrounded entity because the check required an exact substring
 * match against the candidate/assigned claim text.
 *
 * NOTE ON TEST-RUNNER SCOPE: this file lives under experiments/
 * angle-grouping-v0/ and is not currently scanned by the committed CI test
 * path (artifacts/api-server/src only) — same disclosed limitation as
 * validator.test.ts and experiments/hybrid-discovery-v0.1's *.test.ts files.
 */
import { describe, expect, it } from "vitest";
import { validateStage2Output } from "./stage2-validator";
import type { Stage2CandidateInput } from "./stage2-types";

const CANDIDATE: Stage2CandidateInput = {
  subjectId: "way/349397298",
  subjectName: "1924 Spring Garden Street",
  centralQuestion:
    "What was 1924 Spring Garden Street's role in labor/union history?",
  perspectiveShift: "It housed the Ironworkers Union for decades.",
  claims: [
    {
      claimId: "claim-1",
      claimText:
        'Baldwin Park\'s page states: "The squat new building at 1924 Spring Garden Street in 1971, built for the Ironworkers Union."',
    },
  ],
};

describe("validateStage2Output — possessive-suffix grounding fix", () => {
  it("does not flag a grounded multi-word entity referenced with a trailing straight possessive ('s)", () => {
    const result = validateStage2Output(CANDIDATE, {
      accepted: false,
      reason:
        "This mainly documents Spring Garden Street's long union tenure as occupancy metadata.",
    });

    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("does not flag a grounded multi-word entity referenced with a trailing typographic possessive (\u2019s)", () => {
    const result = validateStage2Output(CANDIDATE, {
      accepted: false,
      reason:
        "This mainly documents Spring Garden Street\u2019s long union tenure as occupancy metadata.",
    });

    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("still flags a genuinely ungrounded entity, possessive or not", () => {
    const result = validateStage2Output(CANDIDATE, {
      accepted: false,
      reason: "This mainly documents Fictional Avenue's long union tenure.",
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual([
      'Field "reason" contains an entity/proper noun ("Fictional Avenue\'s") not present in the candidate or assigned claim text.',
    ]);
  });
});
