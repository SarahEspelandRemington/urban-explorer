/**
 * End-to-end PAB retrieval-adapter prototype run: adapter -> automated
 * interpreter/classifier -> automated claim extraction -> existing
 * (unchanged) grounding + trust harness. Offline/non-production.
 *
 * No manual per-record approval step anywhere in this pipeline. Human
 * review is not invoked; every claim-bearing record automatically produces
 * claims, and every claim automatically flows through grounding + decide.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-pab-adapter.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { retrievePabCorridor } from "./pab/pabAdapter";
import {
  classifyPabRecord,
  type PabInterpretedRecord,
} from "./pab/pabInterpreter";
import {
  buildPabSource,
  extractClaimsFromPabRecord,
} from "./pab/pabClaimExtractor";
import type { Claim, Source } from "./types";
import { runPipeline } from "./pipeline";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// PAB record IDs confirmed present in the prior manual PAB enumeration pass
// (same corridor), used here only as a recall cross-check — not used to
// drive or filter this run's retrieval/classification in any way.
const PRIOR_PASS_KNOWN_IDS = [
  "75737",
  "143269",
  "9108",
  "4953",
  "1179391",
  "1179406",
];
const PRIOR_PASS_TOTAL_RETRIEVED = 248;
const PRIOR_PASS_CORRIDOR_COUNT = 129;

async function main() {
  const adapterResult = await retrievePabCorridor({
    street: "Spring Garden St",
    city: "Philadelphia",
    lowerBound: 1700,
    upperBound: 2299,
  });

  console.log(
    `Retrieved ${adapterResult.totalRetrieved} total PAB records for "Spring Garden St" (results page: ${adapterResult.resultsUrl})`,
  );
  console.log(
    `Corridor-filtered (1700-2299): ${adapterResult.records.length} records\n`,
  );

  console.log(
    "--- Recall cross-check against prior manual enumeration pass ---",
  );
  console.log(
    `Total retrieved matches prior pass (${PRIOR_PASS_TOTAL_RETRIEVED}): ${adapterResult.totalRetrieved === PRIOR_PASS_TOTAL_RETRIEVED}`,
  );
  console.log(
    `Corridor count matches prior pass (${PRIOR_PASS_CORRIDOR_COUNT}): ${adapterResult.records.length === PRIOR_PASS_CORRIDOR_COUNT}`,
  );
  const corridorIds = new Set(adapterResult.records.map((r) => r.pabId));
  for (const id of PRIOR_PASS_KNOWN_IDS) {
    console.log(`  known record ${id} present: ${corridorIds.has(id)}`);
  }
  console.log();

  const interpreted: PabInterpretedRecord[] = [];
  for (const record of adapterResult.records) {
    interpreted.push(await classifyPabRecord(record));
    await sleep(120); // polite pacing against PAB's server across ~129 sequential detail-page fetches
  }

  const claimBearing = interpreted.filter(
    (r) => r.classification === "claim-bearing",
  );
  const leadOnly = interpreted.filter((r) => r.classification === "lead-only");
  const noUsableEvidence = interpreted.filter(
    (r) => r.classification === "no-usable-evidence",
  );

  console.log("--- Automated classification ---");
  console.log(`claim-bearing: ${claimBearing.length}`);
  console.log(`lead-only: ${leadOnly.length}`);
  console.log(`no-usable-evidence: ${noUsableEvidence.length}\n`);

  const claims: Claim[] = [];
  const sources: Record<string, Source> = {};
  for (const interpretedRecord of claimBearing) {
    const record = adapterResult.records.find(
      (r) => r.pabId === interpretedRecord.pabId,
    )!;
    sources[`pab-${record.pabId}`] = buildPabSource(record, interpretedRecord);
    claims.push(...extractClaimsFromPabRecord(record, interpretedRecord));
  }

  console.log(
    `--- Automated claim extraction: ${claims.length} claims from ${claimBearing.length} claim-bearing records ---\n`,
  );

  const outcomes = runPipeline(claims, sources);

  const pad = (s: string, n: number) =>
    s.length >= n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
  console.log(
    pad("CLAIM ID", 32) +
      pad("PLACE", 24) +
      pad("TYPE", 16) +
      pad("DECISION", 12) +
      pad("TRUST", 8) +
      pad("IDENTITY", 10) +
      pad("TIER", 5) +
      "EDIT.",
  );
  console.log("-".repeat(130));
  for (const o of outcomes) {
    console.log(
      pad(o.claim.id, 32) +
        pad(o.claim.placeKey, 24) +
        pad(o.claim.claimType, 16) +
        pad(o.decision.decision, 12) +
        pad(o.decision.factualTrust, 8) +
        pad(o.decision.identityConfidence, 10) +
        pad(String(o.grounding.tier), 5) +
        o.decision.editorialQuality,
    );
  }

  const admit = outcomes.filter(
    (o) => o.decision.decision === "AUTO-ADMIT",
  ).length;
  const hold = outcomes.filter((o) => o.decision.decision === "HOLD").length;
  const suppress = outcomes.filter(
    (o) => o.decision.decision === "SUPPRESS",
  ).length;
  const holdFromUnresolvedGrounding = outcomes.filter(
    (o) => o.decision.decision === "HOLD" && o.grounding.tier === 0,
  ).length;
  const holdFromOtherCause = hold - holdFromUnresolvedGrounding;

  console.log("-".repeat(130));
  console.log(
    `Total claims: ${outcomes.length} | AUTO-ADMIT: ${admit} | HOLD: ${hold} | SUPPRESS: ${suppress}`,
  );
  console.log(
    `  HOLD caused by unresolved grounding (tier 0 / "unresolved" identity): ${holdFromUnresolvedGrounding}`,
  );
  console.log(
    `  HOLD caused by another check (e.g. epistemic marker, temporal conflict): ${holdFromOtherCause}`,
  );

  const outDir = dirname(fileURLToPath(import.meta.url));
  writeFileSync(
    join(outDir, "report-pab-adapter.json"),
    JSON.stringify(
      {
        totalRetrieved: adapterResult.totalRetrieved,
        corridorFiltered: adapterResult.records.length,
        classification: {
          claimBearing: claimBearing.length,
          leadOnly: leadOnly.length,
          noUsableEvidence: noUsableEvidence.length,
        },
        claimsExtracted: claims.length,
        outcomes,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nFull structured output written to ${join(outDir, "report-pab-adapter.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
