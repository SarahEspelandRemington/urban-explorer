// Isolated experiment only. Bounded Stage 2 repeatability check: re-judges
// the same 8 already-frozen Stage 1 candidates from the broader offline
// evaluation (report-e2e.json's 3 anchors + report-broader-eval.json's 5
// additional accepted/rejected candidates) with one fresh, independent
// Stage 2 pass (results/run2-stage2-*.raw.json), using the exact same
// centralQuestion/perspectiveShift/claimIds/claim text as Run 1. Does not
// rerun Stage 1, does not change the Stage 2 prompt/contract. Only compares.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateStage2Output } from "./stage2-validator";
import type { Stage2CandidateInput } from "./stage2-types";
import type { Stage2Result } from "../../artifacts/api-server/src/lib/localHistoryAdmission/stage2Acceptance";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, "results");

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

const anchorReport = readJson(join(__dirname, "report-e2e.json")) as {
  subjects: Array<{
    subjectId: string;
    candidates: Array<{
      candidateId: string;
      stage2Input: Stage2CandidateInput;
      stage2Output: Stage2Result;
      stage2Validation: { valid: boolean; reasons: string[] };
    }>;
  }>;
};

const broaderReport = readJson(join(__dirname, "report-broader-eval.json")) as {
  additionalSubjects: Array<{
    subjectId: string;
    stage1Validation: { valid: boolean; reasons: string[] };
    candidates: Array<{
      candidateId: string;
      stage2Input: Stage2CandidateInput;
      stage2Output: Stage2Result;
      stage2Validation: { valid: boolean; reasons: string[] };
    }>;
  }>;
};

interface Run1Record {
  label: string;
  candidateId: string;
  stage1Valid: boolean;
  stage1KnownFinding?: string;
  stage2Input: Stage2CandidateInput;
  run1: Stage2Result;
  run1Validation: { valid: boolean; reasons: string[] };
}

const run1Records: Run1Record[] = [];

for (const subject of anchorReport.subjects) {
  for (const c of subject.candidates) {
    run1Records.push({
      label: subject.subjectId,
      candidateId: c.candidateId,
      stage1Valid: true, // anchors' stage1Validation checked separately; not gating here
      stage2Input: c.stage2Input,
      run1: c.stage2Output,
      run1Validation: c.stage2Validation,
    });
  }
}

const additionalCandidateIds = new Set([
  "way/251417983-carson-baldwin-connection",
  "way/1314403623-george-society-relocation",
  "way/266149338-times-building-phased-construction",
  "way/266143344-marquee-alterations",
  "way/265319542-bricklayer-greek-church-origin",
]);

for (const subject of broaderReport.additionalSubjects) {
  for (const c of subject.candidates) {
    if (!additionalCandidateIds.has(c.candidateId)) continue;
    run1Records.push({
      label: subject.subjectId,
      candidateId: c.candidateId,
      stage1Valid: subject.stage1Validation.valid,
      stage1KnownFinding: subject.stage1Validation.valid
        ? undefined
        : subject.stage1Validation.reasons.join(" "),
      stage2Input: c.stage2Input,
      run1: c.stage2Output,
      run1Validation: c.stage2Validation,
    });
  }
}

function shortId(subjectId: string): string {
  return subjectId.replace("way/", "");
}

const comparisons = run1Records.map((record) => {
  const run2RawPath = join(
    resultsDir,
    `run2-stage2-${shortId(record.label)}.raw.json`,
  );
  const run2 = readJson(run2RawPath) as Stage2Result;
  const run2Validation = validateStage2Output(record.stage2Input, run2);
  const flipped = record.run1.accepted !== run2.accepted;
  return {
    subjectId: record.label,
    candidateId: record.candidateId,
    stage1Valid: record.stage1Valid,
    stage1KnownFinding: record.stage1KnownFinding,
    run1Accepted: record.run1.accepted,
    run1Reason: record.run1.reason,
    run1Valid: record.run1Validation.valid,
    run2Accepted: run2.accepted,
    run2Reason: run2.reason,
    run2Valid: run2Validation.valid,
    run2ValidationReasons: run2Validation.reasons,
    stable: !flipped,
    flipped,
  };
});

console.log(JSON.stringify(comparisons, null, 2));

const stableCount = comparisons.filter((c) => c.stable).length;
console.log(`\nStable: ${stableCount}/${comparisons.length}`);
console.log(
  `Flipped: ${
    comparisons
      .filter((c) => c.flipped)
      .map((c) => c.candidateId)
      .join(", ") || "none"
  }`,
);
