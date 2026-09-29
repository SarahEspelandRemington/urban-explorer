// Isolated experiment only. Broader offline two-stage evaluation: assembles
// the 3 anchor subjects (carried over UNCHANGED from report-e2e.json, the
// earlier checkpoint run -- not re-run) with 10 additional real subjects
// (frozen in manifest-broader-eval.json) through the same mechanical
// validators (validator.ts / stage2-validator.ts) and the actual production
// Stage 2 contract (applyEditorialAcceptance). Stage 1/Stage 2 raw outputs
// for the 10 additional subjects were produced by fresh, isolated, blind
// Agent-tool judgments outside this file (see results/broader-*.raw.json)
// and are only assembled/validated here. No prompt or validator changes were
// made after the manifest was frozen.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateSubjectAngleGrouping } from "./validator";
import { validateStage2Output } from "./stage2-validator";
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

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

// --- Anchors: carried over unchanged from the checkpoint run. ---
const anchorReport = readJson(join(__dirname, "report-e2e.json")) as {
  subjects: unknown[];
};

// --- 10 additional real subjects, frozen in the evaluation manifest. ---
const manifest = readJson(join(__dirname, "manifest-broader-eval.json")) as {
  additionalSubjects: Array<{
    subjectId: string;
    subjectName: string;
    source: string;
    claims: Array<{ claimId: string; claimType: string; claimText: string }>;
  }>;
};

function shortId(subjectId: string): string {
  return subjectId.replace("way/", "");
}

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

const sources: Record<string, Source> = {};
const claims: Claim[] = [];
for (const subject of manifest.additionalSubjects) {
  const sourceId = `broader-eval-${shortId(subject.subjectId)}`;
  sources[sourceId] = makeSource({
    id: sourceId,
    title: `${subject.source} — ${subject.subjectName}`,
    sourceClass:
      subject.source === "NYC LPC"
        ? "built-environment-cultural-database"
        : "local-public-history-narrative",
    capabilities: subject.claims.map((c) => ({
      claimType: c.claimType,
      strength: "high" as const,
    })),
  });
  for (const c of subject.claims) {
    claims.push(
      makeClaim({
        id: c.claimId,
        placeKey: shortId(subject.subjectId),
        sourceIds: [sourceId],
        claimType: c.claimType as Claim["claimType"],
        claimText: c.claimText,
        productionSubjectId: subject.subjectId,
      }),
    );
  }
}

const artifact = generateArtifact(claims, sources, {
  generatedAt: "2026-09-29T00:00:00.000Z",
});
const claimTextById = new Map(claims.map((c) => [c.id, c.claimText]));

type SubjectRecord = {
  subjectId: string;
  subjectName: string;
  source: string;
  admittedClaims: ProducerInput["claims"];
  stage1RawOutput: unknown;
  stage1ParsedGrouping: SubjectCandidateGrouping;
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
  finalEvaluation: ReturnType<typeof applyEditorialAcceptance>;
};

const additionalRecords: SubjectRecord[] = [];

for (const subject of manifest.additionalSubjects) {
  const input: ProducerInput = {
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    claims: subject.claims.map((c) => ({
      claimId: c.claimId,
      claimType: c.claimType,
      claimText: c.claimText,
    })),
  };

  const raw = readJson(
    join(resultsDir, `broader-${shortId(subject.subjectId)}.raw.json`),
  );
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
      const stage2RawPath = join(
        resultsDir,
        `broader-stage2-${shortId(subject.subjectId)}.raw.json`,
      );
      const stage2Output = readJson(stage2RawPath) as Stage2Result;
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

  const judge = (input: { candidate: CandidateAngle }): Stage2Result => {
    const match = candidateRecords.find(
      (c) => c.candidateId === input.candidate.candidateId,
    );
    if (!match) {
      throw new Error(
        `No Stage 2 output found for candidate "${input.candidate.candidateId}".`,
      );
    }
    return match.stage2Output;
  };
  const finalEvaluation = applyEditorialAcceptance(
    grouping,
    artifact,
    input.subjectName,
    judge,
  );

  additionalRecords.push({
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    source: subject.source,
    admittedClaims: input.claims,
    stage1RawOutput: raw,
    stage1ParsedGrouping: grouping,
    stage1Validation,
    candidates: candidateRecords,
    finalEvaluation,
  });
}

const report = {
  generatedAt: "2026-09-29T00:00:00.000Z",
  note: "3 anchor subjects (way/265322610, way/265320377, way/349397298) below are carried over unchanged from report-e2e.json, not re-run. 10 additional subjects were newly, blindly evaluated per manifest-broader-eval.json.",
  anchorSubjects: anchorReport.subjects,
  additionalSubjects: additionalRecords,
};

writeFileSync(
  join(__dirname, "report-broader-eval.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      additionalSubjectsSummary: additionalRecords.map((r) => ({
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        stage1Valid: r.stage1Validation.valid,
        stage1Reasons: r.stage1Validation.reasons,
        candidateCount: r.candidates.length,
        stage2ValidAll: r.candidates.every((c) => c.stage2Validation.valid),
        accepted: r.finalEvaluation.acceptedAngles.map((a) => a.angleId),
        rejected: r.finalEvaluation.rejectedCandidates.map(
          (c) => c.candidate.candidateId,
        ),
      })),
    },
    null,
    2,
  ),
);
