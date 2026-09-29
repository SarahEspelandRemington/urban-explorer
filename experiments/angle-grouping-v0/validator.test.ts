/**
 * Focused regression coverage for the possessive-suffix fix to
 * validateSubjectAngleGrouping's mechanical entity/proper-noun grounding
 * check (2026-09-29). Before the fix, a trailing possessive ('s) on an
 * otherwise-grounded multi-word entity (e.g. "Spring Garden Street's") was
 * treated as a distinct, ungrounded entity because the check required an
 * exact substring match against the assigned claim text / subject name.
 *
 * NOTE ON TEST-RUNNER SCOPE: this file lives under experiments/
 * angle-grouping-v0/ and is not currently scanned by the committed CI test
 * path (artifacts/api-server/src only) — same disclosed limitation as
 * experiments/hybrid-discovery-v0.1's *.test.ts files.
 */
import { describe, expect, it } from "vitest";
import { validateSubjectAngleGrouping } from "./validator";
import type { ProducerInput } from "./types";

const SPRING_GARDEN: ProducerInput = {
  subjectId: "way/349397298",
  subjectName: "1924 Spring Garden Street",
  claims: [
    {
      claimId: "claim-1",
      claimType: "construction-date",
      claimText:
        'Baldwin Park\'s page states: "The squat new building at 1924 Spring Garden Street in 1971, built for the Ironworkers Union."',
    },
  ],
};

describe("validateSubjectAngleGrouping — possessive-suffix grounding fix", () => {
  it("does not flag a grounded multi-word entity referenced with a trailing possessive ('s)", () => {
    const result = validateSubjectAngleGrouping(SPRING_GARDEN, {
      subjectId: SPRING_GARDEN.subjectId,
      angleGroups: [
        {
          subjectId: SPRING_GARDEN.subjectId,
          angleId: "a1",
          centralQuestion:
            "What was 1924 Spring Garden Street's role in labor/union history?",
          perspectiveShift: "It housed the Ironworkers Union for decades.",
          claimIds: ["claim-1"],
        },
      ],
      ungroupedClaimIds: [],
    });

    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("still flags a genuinely ungrounded entity, possessive or not", () => {
    const result = validateSubjectAngleGrouping(SPRING_GARDEN, {
      subjectId: SPRING_GARDEN.subjectId,
      angleGroups: [
        {
          subjectId: SPRING_GARDEN.subjectId,
          angleId: "a1",
          centralQuestion: "What was Fictional Avenue's role in this story?",
          perspectiveShift: "It housed the Ironworkers Union for decades.",
          claimIds: ["claim-1"],
        },
      ],
      ungroupedClaimIds: [],
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual([
      'AngleGroup "a1" field "centralQuestion" contains an entity/proper noun ("Fictional Avenue\'s") not present in its assigned claim text or subject name.',
    ]);
  });
});
