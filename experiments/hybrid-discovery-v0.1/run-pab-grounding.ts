/**
 * End-to-end PAB grounding prototype run: FROZEN retrieval adapter ->
 * FROZEN interpreter -> FROZEN claim extractor -> NEW automated OSM
 * grounding (minimal handoff: overrides proposedIdentityType/locationHints
 * on each generated claim) -> FROZEN grounding tier map + FROZEN trust
 * harness. Offline/non-production.
 *
 * No manual per-record approval step anywhere in this pipeline, and no
 * change to pabAdapter.ts, pabInterpreter.ts, pabClaimExtractor.ts,
 * checks.ts, grounding.ts, decide.ts, or editorial.ts.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-pab-grounding.ts
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
import {
  fetchOsmStreetIndex,
  groundPabRecord,
  type PabGroundingResult,
} from "./pab/pabGrounding";
import type { Claim, Source } from "./types";
import { runPipeline } from "./pipeline";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Addresses chosen during design-phase spot-checking of the live OSM data as
// representative validation lanes (not used to drive grounding itself —
// purely a post-hoc reconciliation printout).
const VALIDATION_LANE_ADDRESSES = [
  "1801",
  "1822",
  "1818",
  "1820",
  "1717",
  "2043",
  "1901",
  "1707",
];

async function main() {
  const adapterResult = await retrievePabCorridor({
    street: "Spring Garden St",
    city: "Philadelphia",
    lowerBound: 1700,
    upperBound: 2299,
  });

  console.log(
    `Retrieved ${adapterResult.totalRetrieved} total PAB records; ${adapterResult.records.length} corridor-filtered (1700-2299)\n`,
  );

  const interpreted: PabInterpretedRecord[] = [];
  for (const record of adapterResult.records) {
    interpreted.push(await classifyPabRecord(record));
    await sleep(120);
  }

  const claimBearing = interpreted.filter(
    (r) => r.classification === "claim-bearing",
  );
  console.log(`claim-bearing records: ${claimBearing.length}\n`);

  console.log(
    "Fetching OSM street index for Spring Garden St, Philadelphia (Overpass)...",
  );
  const osmIndex = await fetchOsmStreetIndex("Spring Garden", "Philadelphia");
  console.log(`OSM street index: ${osmIndex.length} elements\n`);

  const claims: Claim[] = [];
  const sources: Record<string, Source> = {};
  const groundingByPabId: Record<string, PabGroundingResult> = {};

  for (const interpretedRecord of claimBearing) {
    const record = adapterResult.records.find(
      (r) => r.pabId === interpretedRecord.pabId,
    )!;
    const grounding = groundPabRecord(record, interpretedRecord, osmIndex);
    groundingByPabId[record.pabId] = grounding;

    sources[`pab-${record.pabId}`] = buildPabSource(record, interpretedRecord);
    const recordClaims = extractClaimsFromPabRecord(record, interpretedRecord);
    for (const claim of recordClaims) {
      claim.proposedIdentityType = grounding.proposedIdentityType;
      if (grounding.matchedIdentifier || grounding.matchingSignal) {
        claim.locationHints = [
          grounding.matchedIdentifier,
          grounding.matchingSignal,
        ]
          .filter(Boolean)
          .join(" — ");
      }
    }
    claims.push(...recordClaims);
  }

  const categoryCounts: Record<string, number> = {};
  for (const g of Object.values(groundingByPabId)) {
    categoryCounts[g.category] = (categoryCounts[g.category] ?? 0) + 1;
  }
  console.log(
    "--- Automated grounding, by category (per claim-bearing PAB record) ---",
  );
  for (const [cat, count] of Object.entries(categoryCounts)) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log();

  console.log(
    "--- Validation-lane spot check (design-phase candidate addresses) ---",
  );
  for (const addr of VALIDATION_LANE_ADDRESSES) {
    const rec = claimBearing
      .map((ir) => adapterResult.records.find((r) => r.pabId === ir.pabId)!)
      .find((r) => r.addressBlock.some((a) => a.startsWith(addr + " ")));
    if (!rec) {
      console.log(`  ${addr}: no claim-bearing PAB record at this address`);
      continue;
    }
    const g = groundingByPabId[rec.pabId];
    console.log(
      `  ${addr} (PAB ${rec.pabId}, "${rec.title}"): ${g.category} | ${g.matchedIdentifier ?? "-"} | ${g.matchingSignal ?? g.conflictingEvidence ?? "-"}`,
    );
  }
  console.log();

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

  const admittedHighEditorial = outcomes.filter(
    (o) =>
      o.decision.decision === "AUTO-ADMIT" &&
      (o.decision.editorialQuality === "high" ||
        o.decision.editorialQuality === "medium"),
  ).length;
  const admittedLowValueRegister = outcomes.filter(
    (o) =>
      o.decision.decision === "AUTO-ADMIT" &&
      o.claim.claimType === "register-status" &&
      o.decision.editorialQuality === "low",
  ).length;

  console.log("-".repeat(130));
  console.log(
    `Total claims: ${outcomes.length} | AUTO-ADMIT: ${admit} | HOLD: ${hold} | SUPPRESS: ${suppress}`,
  );
  console.log(
    `  HOLD from unresolved grounding (tier 0): ${holdFromUnresolvedGrounding}`,
  );
  console.log(
    `  AUTO-ADMIT with medium/high editorial quality (usable, story-relevant): ${admittedHighEditorial}`,
  );
  console.log(
    `  AUTO-ADMIT that are low-value register-status metadata: ${admittedLowValueRegister}`,
  );

  const outDir = dirname(fileURLToPath(import.meta.url));
  writeFileSync(
    join(outDir, "report-pab-grounding.json"),
    JSON.stringify(
      {
        totalRetrieved: adapterResult.totalRetrieved,
        corridorFiltered: adapterResult.records.length,
        claimBearingRecords: claimBearing.length,
        osmIndexSize: osmIndex.length,
        groundingByPabId,
        categoryCounts,
        claimsExtracted: claims.length,
        outcomes,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nFull structured output written to ${join(outDir, "report-pab-grounding.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
