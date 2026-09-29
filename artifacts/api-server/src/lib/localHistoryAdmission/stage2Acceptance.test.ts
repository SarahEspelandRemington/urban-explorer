import { describe, expect, it, vi } from "vitest";
import {
  applyEditorialAcceptance,
  type CandidateAngle,
  type Stage2Input,
  type Stage2Result,
  type SubjectCandidateGrouping,
} from "./stage2Acceptance";
import type { AngleGroup } from "./angleGrouping";
import { generateArtifact } from "./artifact";
import { projectRuntimeCompat } from "./projector";
import { applyDiscoveryWorthinessGate } from "./worthiness";
import type { Claim, Source } from "./types";

// Structural safety (compile-time): CandidateAngle must not be silently
// usable wherever an accepted AngleGroup is expected, or vice versa --
// CandidateAngle has `candidateId`, AngleGroup has `angleId`, and neither
// aliases the other. If either type were ever accidentally made assignable
// to the other, these two const declarations would fail to typecheck.
type CandidateNotAssignableToAngleGroup = CandidateAngle extends AngleGroup
  ? "FAIL: CandidateAngle assignable to AngleGroup"
  : "ok";
type AngleGroupNotAssignableToCandidate = AngleGroup extends CandidateAngle
  ? "FAIL: AngleGroup assignable to CandidateAngle"
  : "ok";
const _structuralSafetyCheck1: CandidateNotAssignableToAngleGroup = "ok";
const _structuralSafetyCheck2: AngleGroupNotAssignableToCandidate = "ok";
void _structuralSafetyCheck1;
void _structuralSafetyCheck2;

function makeSource(overrides: Partial<Source> & { id: string }): Source {
  return {
    title: overrides.id,
    sourceClass: "local-public-history-narrative",
    capabilities: [],
    ...overrides,
  };
}
function makeClaim(
  overrides: Partial<Claim> & {
    id: string;
    placeKey: string;
    sourceIds: string[];
  },
): Claim {
  return {
    proposedIdentityType: "current-osm-entity",
    address: "123 Main St",
    supportingSpan: "quoted span",
    claimType: "use-history",
    claimText:
      "A generic, sufficiently long claim text for editorial specificity checks.",
    productionSubjectId: `prod-${overrides.placeKey}`,
    ...overrides,
  };
}
function buildPipeline(claims: Claim[], sources: Record<string, Source>) {
  const artifact = generateArtifact(claims, sources, {
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  const projection = projectRuntimeCompat(artifact);
  const gated = applyDiscoveryWorthinessGate(projection, artifact);
  return { artifact, projection, gated };
}

// Real admitted claims for 1924 Spring Garden Street (way/349397298), the
// same fixture used in angleGrouping.test.ts — reused here to ground the
// "hasStoryBearingClaim: true + zero accepted angles" independence proof in
// real data rather than a synthetic stand-in.
function buildSpringGardenPipeline() {
  const subjectId = "way/349397298";
  const sources: Record<string, Source> = {
    "pab-75672": makeSource({
      id: "pab-75672",
      title:
        "Philadelphia Architects and Buildings — 1924 Spring Garden Street (1924 SPRING GARDEN ST)",
      sourceClass: "built-environment-cultural-database",
      capabilities: [
        { claimType: "identity", strength: "high" },
        { claimType: "register-status", strength: "high" },
      ],
    }),
    "bp-unions-in-the-neighborhood-pab-record-75672": makeSource({
      id: "bp-unions-in-the-neighborhood-pab-record-75672",
      title: 'Baldwin Park — "Unions in the Neighborhood"',
      sourceClass: "local-public-history-narrative",
      capabilities: [
        { claimType: "construction-date", strength: "high" },
        { claimType: "institutional-founding", strength: "high" },
      ],
    }),
  };
  const claims: Claim[] = [
    makeClaim({
      id: "pab-75672-identity",
      placeKey: "pab-record-75672",
      sourceIds: ["pab-75672"],
      claimType: "identity",
      claimText:
        'PAB\'s own record for 1924 SPRING GARDEN ST identifies this as "1924 Spring Garden Street."',
      productionSubjectId: subjectId,
    }),
    makeClaim({
      id: "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
      placeKey: "pab-record-75672",
      sourceIds: ["bp-unions-in-the-neighborhood-pab-record-75672"],
      claimType: "construction-date",
      claimText:
        'Baldwin Park\'s page "Unions in the Neighborhood" states about 1924 SPRING GARDEN ST: "The squat new building at 1924 Spring Garden Street in 1971, built for the Ironworkers Union."',
      productionSubjectId: subjectId,
    }),
    makeClaim({
      id: "pab-75672-register-status",
      placeKey: "pab-record-75672",
      sourceIds: ["pab-75672"],
      claimType: "register-status",
      claimText:
        "PAB's record shows a historic-register listing entry for 1924 SPRING GARDEN ST, dated 10/11/2000.",
      productionSubjectId: subjectId,
    }),
    makeClaim({
      id: "bp-unions-in-the-neighborhood-pab-record-75672-p76s0-institutional-founding",
      placeKey: "pab-record-75672",
      sourceIds: ["bp-unions-in-the-neighborhood-pab-record-75672"],
      claimType: "institutional-founding",
      claimText:
        'Baldwin Park\'s page "Unions in the Neighborhood" states about 1924 SPRING GARDEN ST: "The International Association of Bridge, Structural, & Ornamental Iron Workers Union Local 401 (founded 1901), which had been at 1924 Spring Garden Street for at least four decades, sold the site to PSSU in 1993."',
      productionSubjectId: subjectId,
    }),
  ];
  return { subjectId, ...buildPipeline(claims, sources) };
}

describe("applyEditorialAcceptance", () => {
  it("promotes an accepted candidate to an AngleGroup, explicitly mapping candidateId to angleId", () => {
    const { subjectId, artifact } = buildSpringGardenPipeline();
    const candidate: CandidateAngle = {
      subjectId,
      candidateId: "way/349397298-ironworkers-union-building",
      centralQuestion: "What institutional role did this building serve?",
      perspectiveShift: "It was built for the Ironworkers Union.",
      claimIds: [
        "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
      ],
    };
    const grouping: SubjectCandidateGrouping = {
      subjectId,
      candidates: [candidate],
      ungroupedClaimIds: [],
    };
    const judge = vi.fn(
      (): Stage2Result => ({ accepted: true, reason: "Clears the bar." }),
    );

    const evaluation = applyEditorialAcceptance(
      grouping,
      artifact,
      "1924 Spring Garden Street",
      judge,
    );

    expect(evaluation.acceptedAngles).toHaveLength(1);
    expect(evaluation.acceptedAngles[0]).toEqual({
      subjectId,
      angleId: "way/349397298-ironworkers-union-building",
      centralQuestion: candidate.centralQuestion,
      perspectiveShift: candidate.perspectiveShift,
      claimIds: candidate.claimIds,
    });
    expect(evaluation.acceptedAngles[0]).not.toHaveProperty("candidateId");
    expect(evaluation.rejectedCandidates).toEqual([]);
  });

  it("preserves a rejected candidate unchanged, with acceptedAngles staying empty (zero accepted is a valid result)", () => {
    const { subjectId, artifact } = buildSpringGardenPipeline();
    const candidate: CandidateAngle = {
      subjectId,
      candidateId: "way/349397298-ironworkers-union-building",
      centralQuestion: "What institutional role did this building serve?",
      perspectiveShift: "It was built for the Ironworkers Union.",
      claimIds: [
        "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
      ],
    };
    const grouping: SubjectCandidateGrouping = {
      subjectId,
      candidates: [candidate],
      ungroupedClaimIds: ["pab-75672-identity"],
    };
    const judge = (): Stage2Result => ({
      accepted: false,
      reason: "Mainly adds a date and confirms tenancy.",
    });

    const evaluation = applyEditorialAcceptance(
      grouping,
      artifact,
      "1924 Spring Garden Street",
      judge,
    );

    expect(evaluation.acceptedAngles).toEqual([]);
    expect(evaluation.rejectedCandidates).toHaveLength(1);
    expect(evaluation.rejectedCandidates[0]).toEqual({
      candidate,
      rejectionReason: "Mainly adds a date and confirms tenancy.",
    });
    // Rejected candidate's claimIds are not folded into ungroupedClaimIds --
    // only the original, unrelated ungrouped claim remains there.
    expect(evaluation.ungroupedClaimIds).toEqual(["pab-75672-identity"]);
  });

  it("mixed candidates: one accepted and one rejected stay in separate buckets, and a claimId shared across both candidates causes no error or global dedup", () => {
    const { subjectId, artifact } = buildSpringGardenPipeline();
    const sharedClaimId = "pab-75672-identity";
    const acceptedCandidate: CandidateAngle = {
      subjectId,
      candidateId: "candidate-a",
      centralQuestion: "qa",
      perspectiveShift: "pa",
      claimIds: [sharedClaimId, "pab-75672-register-status"],
    };
    const rejectedCandidate: CandidateAngle = {
      subjectId,
      candidateId: "candidate-b",
      centralQuestion: "qb",
      perspectiveShift: "pb",
      claimIds: [
        sharedClaimId,
        "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
      ],
    };
    const grouping: SubjectCandidateGrouping = {
      subjectId,
      candidates: [acceptedCandidate, rejectedCandidate],
      ungroupedClaimIds: [
        "bp-unions-in-the-neighborhood-pab-record-75672-p76s0-institutional-founding",
      ],
    };
    const judge = (input: Stage2Input): Stage2Result =>
      input.candidate.candidateId === "candidate-a"
        ? { accepted: true, reason: "Clears the bar." }
        : { accepted: false, reason: "Does not clear the bar." };

    const evaluation = applyEditorialAcceptance(
      grouping,
      artifact,
      "1924 Spring Garden Street",
      judge,
    );

    expect(evaluation.acceptedAngles).toHaveLength(1);
    expect(evaluation.acceptedAngles[0].angleId).toBe("candidate-a");
    expect(evaluation.acceptedAngles[0].claimIds).toEqual([
      sharedClaimId,
      "pab-75672-register-status",
    ]);
    expect(evaluation.rejectedCandidates).toHaveLength(1);
    expect(evaluation.rejectedCandidates[0].candidate.candidateId).toBe(
      "candidate-b",
    );
    expect(evaluation.rejectedCandidates[0].candidate.claimIds).toEqual([
      sharedClaimId,
      "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
    ]);
    // The claimId shared across both candidates appears in both buckets --
    // no error, no global dedup across candidates.
    expect(evaluation.acceptedAngles[0].claimIds).toContain(sharedClaimId);
    expect(evaluation.rejectedCandidates[0].candidate.claimIds).toContain(
      sharedClaimId,
    );
    expect(evaluation.ungroupedClaimIds).toEqual([
      "bp-unions-in-the-neighborhood-pab-record-75672-p76s0-institutional-founding",
    ]);
  });

  it("passes ungroupedClaimIds through unchanged when there are no candidates at all", () => {
    const { subjectId, artifact } = buildSpringGardenPipeline();
    const grouping: SubjectCandidateGrouping = {
      subjectId,
      candidates: [],
      ungroupedClaimIds: [
        "pab-75672-identity",
        "pab-75672-register-status",
        "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
        "bp-unions-in-the-neighborhood-pab-record-75672-p76s0-institutional-founding",
      ],
    };
    const judge = vi.fn();

    const evaluation = applyEditorialAcceptance(
      grouping,
      artifact,
      "1924 Spring Garden Street",
      judge,
    );

    expect(evaluation.acceptedAngles).toEqual([]);
    expect(evaluation.rejectedCandidates).toEqual([]);
    expect(evaluation.ungroupedClaimIds).toEqual(grouping.ungroupedClaimIds);
    expect(judge).not.toHaveBeenCalled();
  });

  it("resolves exact assigned claim text from the canonical artifact and passes it to judge", () => {
    const { subjectId, artifact } = buildSpringGardenPipeline();
    const candidate: CandidateAngle = {
      subjectId,
      candidateId: "way/349397298-ironworkers-union-building",
      centralQuestion: "What institutional role did this building serve?",
      perspectiveShift: "It was built for the Ironworkers Union.",
      claimIds: [
        "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
        "bp-unions-in-the-neighborhood-pab-record-75672-p76s0-institutional-founding",
      ],
    };
    const grouping: SubjectCandidateGrouping = {
      subjectId,
      candidates: [candidate],
      ungroupedClaimIds: [],
    };
    let capturedInput: Stage2Input | undefined;
    const judge = (input: Stage2Input): Stage2Result => {
      capturedInput = input;
      return { accepted: true, reason: "ok" };
    };

    applyEditorialAcceptance(
      grouping,
      artifact,
      "1924 Spring Garden Street",
      judge,
    );

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.subjectId).toBe(subjectId);
    expect(capturedInput!.subjectName).toBe("1924 Spring Garden Street");
    expect(capturedInput!.candidate).toEqual(candidate);
    // Candidate records never carry claim text themselves -- it exists only
    // in the resolved assignedClaims Stage 2 input, never on the candidate.
    expect(capturedInput!.candidate).not.toHaveProperty("claimText");
    expect(capturedInput!.assignedClaims).toEqual([
      {
        claimId:
          "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
        claimText:
          'Baldwin Park\'s page "Unions in the Neighborhood" states about 1924 SPRING GARDEN ST: "The squat new building at 1924 Spring Garden Street in 1971, built for the Ironworkers Union."',
      },
      {
        claimId:
          "bp-unions-in-the-neighborhood-pab-record-75672-p76s0-institutional-founding",
        claimText:
          'Baldwin Park\'s page "Unions in the Neighborhood" states about 1924 SPRING GARDEN ST: "The International Association of Bridge, Structural, & Ornamental Iron Workers Union Local 401 (founded 1901), which had been at 1924 Spring Garden Street for at least four decades, sold the site to PSSU in 1993."',
      },
    ]);
  });

  it("throws if a candidate references a claimId absent from the artifact", () => {
    const { subjectId, artifact } = buildSpringGardenPipeline();
    const candidate: CandidateAngle = {
      subjectId,
      candidateId: "bad-candidate",
      centralQuestion: "q",
      perspectiveShift: "p",
      claimIds: ["nonexistent-claim"],
    };
    const grouping: SubjectCandidateGrouping = {
      subjectId,
      candidates: [candidate],
      ungroupedClaimIds: [],
    };

    expect(() =>
      applyEditorialAcceptance(
        grouping,
        artifact,
        "1924 Spring Garden Street",
        vi.fn(),
      ),
    ).toThrow(/not found in artifact\.claims/);
  });

  it("does not mutate its grouping or artifact inputs", () => {
    const { subjectId, artifact } = buildSpringGardenPipeline();
    const candidate: CandidateAngle = {
      subjectId,
      candidateId: "way/349397298-ironworkers-union-building",
      centralQuestion: "q",
      perspectiveShift: "p",
      claimIds: [
        "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
      ],
    };
    const grouping: SubjectCandidateGrouping = {
      subjectId,
      candidates: [candidate],
      ungroupedClaimIds: ["pab-75672-identity"],
    };
    const groupingSnapshot = JSON.parse(JSON.stringify(grouping));
    const artifactSnapshot = JSON.parse(JSON.stringify(artifact));

    applyEditorialAcceptance(
      grouping,
      artifact,
      "1924 Spring Garden Street",
      () => ({
        accepted: true,
        reason: "ok",
      }),
    );

    expect(grouping).toEqual(groupingSnapshot);
    expect(artifact).toEqual(artifactSnapshot);
  });

  it("is deterministic: identical inputs and judge produce identical evaluation output", () => {
    const { subjectId, artifact } = buildSpringGardenPipeline();
    const candidate: CandidateAngle = {
      subjectId,
      candidateId: "way/349397298-ironworkers-union-building",
      centralQuestion: "q",
      perspectiveShift: "p",
      claimIds: ["pab-75672-identity"],
    };
    const grouping: SubjectCandidateGrouping = {
      subjectId,
      candidates: [candidate],
      ungroupedClaimIds: [],
    };
    const judge = (): Stage2Result => ({ accepted: true, reason: "ok" });

    const first = applyEditorialAcceptance(
      grouping,
      artifact,
      "1924 Spring Garden Street",
      judge,
    );
    const second = applyEditorialAcceptance(
      grouping,
      artifact,
      "1924 Spring Garden Street",
      judge,
    );

    expect(first).toEqual(second);
  });

  it("real Spring Garden shape: hasStoryBearingClaim: true at the worthiness-gate level coexists with zero Stage 2 accepted angles, and applyEditorialAcceptance never reads or is affected by the gate/worthiness result", () => {
    const { subjectId, artifact, gated } = buildSpringGardenPipeline();
    // Confirm the real, independent worthiness-gate signal this test is
    // supposed to coexist with.
    expect(gated.entries[subjectId].evidence.hasStoryBearingClaim).toBe(true);

    const candidate: CandidateAngle = {
      subjectId,
      candidateId: "way/349397298-ironworkers-union-building",
      centralQuestion: "What institutional role did this building serve?",
      perspectiveShift:
        "It was built for the Ironworkers Union and later sold to PSSU.",
      claimIds: [
        "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
        "bp-unions-in-the-neighborhood-pab-record-75672-p76s0-institutional-founding",
      ],
    };
    const grouping: SubjectCandidateGrouping = {
      subjectId,
      candidates: [candidate],
      ungroupedClaimIds: ["pab-75672-identity", "pab-75672-register-status"],
    };
    // Stage 2 rejects the only candidate, exactly as in the blind experiment.
    const judge = (): Stage2Result => ({
      accepted: false,
      reason: "Mainly a chain of dates and an occupancy duration.",
    });

    const evaluation = applyEditorialAcceptance(
      grouping,
      artifact,
      "1924 Spring Garden Street",
      judge,
    );

    expect(evaluation.acceptedAngles).toEqual([]);
    expect(evaluation.rejectedCandidates).toHaveLength(1);
    // The gate/worthiness result is completely unaffected by this call --
    // applyEditorialAcceptance never took `gated` as a parameter at all, and
    // the pre-existing entry object is untouched.
    expect(gated.entries[subjectId].evidence.hasStoryBearingClaim).toBe(true);
  });
});
