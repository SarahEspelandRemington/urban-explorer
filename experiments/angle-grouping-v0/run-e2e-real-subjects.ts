// Isolated experiment only. Minimum glue to run a genuinely fresh two-stage
// (Stage 1 candidate formation -> Stage 2 editorial acceptance) offline
// evaluation against real admitted claims for 3 real subjects, through the
// actual production Stage 2 contract (applyEditorialAcceptance). Not wired
// into any runtime/offline pipeline, projector, worthiness, or fallback
// behavior. Stage 1's raw model outputs and Stage 2's raw model outputs were
// produced by fresh, isolated Agent-tool judgments outside this file (see
// results/e2e-*.raw.json) and are only assembled/validated here.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateSubjectAngleGrouping } from "./validator";
import { validateStage2Output } from "./stage2-validator";
import { ACTORS_TEMPLE, CLINTON_COURT, SPRING_GARDEN_1924 } from "./subjects";
import type { ProducerInput } from "./types";
import type { Stage2CandidateInput } from "./stage2-types";
import {
  applyEditorialAcceptance,
  type CandidateAngle,
  type Stage2Result,
  type SubjectCandidateGrouping,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/stage2Acceptance";
import { generateArtifact } from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import type {
  Claim,
  Source,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, "results");

function readRaw(fileName: string): unknown {
  return JSON.parse(readFileSync(join(resultsDir, fileName), "utf-8"));
}

// Real Source/Claim records mirroring subjects.ts's admitted claims exactly
// (same claimId/claimText/claimType), extended only with the minimum fields
// generateArtifact()/decide.ts require to reach AUTO-ADMIT, matching the
// precedent already used in angleGrouping.test.ts / stage2Acceptance.test.ts.
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
    claimText: "generic",
    ...overrides,
  };
}

const sources: Record<string, Source> = {
  "eny-actors-temple": makeSource({
    id: "eny-actors-temple",
    title:
      "Ephemeral New York — The little Hell's Kitchen synagogue where old Broadway stars once worshipped",
    capabilities: [{ claimType: "use-history", strength: "high" }],
  }),
  "eny-clinton-court": makeSource({
    id: "eny-clinton-court",
    title:
      "Ephemeral New York — A secret alley behind a street in Hell's Kitchen",
    capabilities: [{ claimType: "use-history", strength: "high" }],
  }),
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
    capabilities: [
      { claimType: "construction-date", strength: "high" },
      { claimType: "institutional-founding", strength: "high" },
    ],
  }),
};

const claims: Claim[] = [
  makeClaim({
    id: ACTORS_TEMPLE.claims[0].claimId,
    placeKey: "actors-temple",
    sourceIds: ["eny-actors-temple"],
    claimType: "use-history",
    claimText: ACTORS_TEMPLE.claims[0].claimText,
    productionSubjectId: ACTORS_TEMPLE.subjectId,
  }),
  makeClaim({
    id: CLINTON_COURT.claims[0].claimId,
    placeKey: "clinton-court",
    sourceIds: ["eny-clinton-court"],
    claimType: "use-history",
    claimText: CLINTON_COURT.claims[0].claimText,
    productionSubjectId: CLINTON_COURT.subjectId,
  }),
  ...SPRING_GARDEN_1924.claims.map((c) =>
    makeClaim({
      id: c.claimId,
      placeKey: "pab-record-75672",
      sourceIds:
        c.claimType === "identity" || c.claimType === "register-status"
          ? ["pab-75672"]
          : ["bp-unions-in-the-neighborhood-pab-record-75672"],
      claimType: c.claimType as Claim["claimType"],
      claimText: c.claimText,
      productionSubjectId: SPRING_GARDEN_1924.subjectId,
    }),
  ),
];

const artifact = generateArtifact(claims, sources, {
  generatedAt: "2026-01-01T00:00:00.000Z",
});

// Fresh Stage 1 raw outputs (produced by 3 isolated, blind Agent-tool
// judgments; see report-e2e.json for the exact wrapper/prompt used).
const stage1Raw: Record<string, unknown> = {
  "way/265322610": readRaw("e2e-actors-temple.raw.json"),
  "way/265320377": readRaw("e2e-clinton-court.raw.json"),
  "way/349397298": readRaw("e2e-spring-garden-1924.raw.json"),
};
const stage1Inputs: Record<string, ProducerInput> = {
  "way/265322610": ACTORS_TEMPLE,
  "way/265320377": CLINTON_COURT,
  "way/349397298": SPRING_GARDEN_1924,
};

// Fresh Stage 2 raw outputs (3 more isolated, blind Agent-tool judgments, one
// per Stage 1 candidate produced above).
const stage2Raw: Record<string, unknown> = {
  "way/265322610-broadway-stars-worship": readRaw(
    "e2e-stage2-actors-temple.raw.json",
  ),
  "way/265320377-consolidation-1958": readRaw(
    "e2e-stage2-clinton-court.raw.json",
  ),
  "way/349397298-ironworkers-union-tenure": readRaw(
    "e2e-stage2-spring-garden-1924.raw.json",
  ),
};

type SubjectRecord = {
  subjectId: string;
  subjectName: string;
  stage1Validation: ReturnType<typeof validateSubjectAngleGrouping>;
  candidates: Array<{
    candidateId: string;
    centralQuestion: string;
    perspectiveShift: string;
    claimIds: string[];
    stage2Input: Stage2CandidateInput;
    stage2Output: Stage2Result;
    stage2Validation: ReturnType<typeof validateStage2Output>;
  }>;
  grouping: SubjectCandidateGrouping;
};

const claimTextById = new Map(claims.map((c) => [c.id, c.claimText]));
const subjectRecords: SubjectRecord[] = [];

for (const input of [ACTORS_TEMPLE, CLINTON_COURT, SPRING_GARDEN_1924]) {
  const raw = stage1Raw[input.subjectId];
  const stage1Validation = validateSubjectAngleGrouping(input, raw);
  const rawTyped = raw as {
    angleGroups: Array<{
      angleId: string;
      centralQuestion: string;
      perspectiveShift: string;
      claimIds: string[];
    }>;
    ungroupedClaimIds: string[];
  };

  const candidates: CandidateAngle[] = rawTyped.angleGroups.map((g) => ({
    subjectId: input.subjectId,
    candidateId: g.angleId,
    centralQuestion: g.centralQuestion,
    perspectiveShift: g.perspectiveShift,
    claimIds: g.claimIds,
  }));
  const grouping: SubjectCandidateGrouping = {
    subjectId: input.subjectId,
    candidates,
    ungroupedClaimIds: rawTyped.ungroupedClaimIds,
  };

  const candidateRecords: SubjectRecord["candidates"] = candidates.map(
    (candidate) => {
      const stage2Input: Stage2CandidateInput = {
        subjectId: input.subjectId,
        subjectName: input.subjectName,
        centralQuestion: candidate.centralQuestion,
        perspectiveShift: candidate.perspectiveShift,
        claims: candidate.claimIds.map((claimId) => ({
          claimId,
          claimText: claimTextById.get(claimId)!,
        })),
      };
      const stage2Output = stage2Raw[candidate.candidateId] as Stage2Result;
      const stage2Validation = validateStage2Output(stage2Input, stage2Output);
      return {
        candidateId: candidate.candidateId,
        centralQuestion: candidate.centralQuestion,
        perspectiveShift: candidate.perspectiveShift,
        claimIds: candidate.claimIds,
        stage2Input,
        stage2Output,
        stage2Validation,
      };
    },
  );

  subjectRecords.push({
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    stage1Validation,
    candidates: candidateRecords,
    grouping,
  });
}

// Run the actual production Stage 2 contract (applyEditorialAcceptance),
// injecting a lookup judge fed by the real, pre-collected blind Stage 2
// results above rather than calling a live model from inside the pure
// function.
const finalEvaluations = subjectRecords.map((record) => {
  const judge = (input: { candidate: CandidateAngle }): Stage2Result =>
    stage2Raw[input.candidate.candidateId] as Stage2Result;
  return applyEditorialAcceptance(
    record.grouping,
    artifact,
    record.subjectName,
    judge,
  );
});

const report = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  subjects: subjectRecords.map((record, i) => ({
    subjectId: record.subjectId,
    subjectName: record.subjectName,
    admittedClaims: stage1Inputs[record.subjectId].claims,
    stage1RawOutput: stage1Raw[record.subjectId],
    stage1ParsedGrouping: record.grouping,
    stage1Validation: record.stage1Validation,
    candidates: record.candidates,
    finalEvaluation: finalEvaluations[i],
  })),
};

writeFileSync(
  join(__dirname, "report-e2e.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
