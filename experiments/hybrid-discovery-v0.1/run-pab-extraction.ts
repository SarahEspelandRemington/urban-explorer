/**
 * Task E — richer PAB historical claim extraction. Offline/non-production,
 * experimental — see README.md.
 *
 * FROZEN retrieval adapter -> EXPANDED interpreter (Overview + Chronology
 * sub-page) -> EXPANDED claim extractor (construction-date, demolition,
 * event, chronology-sourced architect, relationship) -> FROZEN OSM grounding
 * -> FROZEN trust harness (checks.ts, grounding.ts, decide.ts, editorial.ts).
 * No change to pabAdapter.ts, pabGrounding.ts, checks.ts, grounding.ts,
 * decide.ts, or editorial.ts.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-pab-extraction.ts
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

// Baseline totals from the frozen Task D report (pre-Task-E interpreter/
// extractor), used only for the old-vs-new comparison in this report.
const OLD_TOTALS = {
  claimBearingRecords: 120,
  totalClaims: 237,
  autoAdmit: 216,
  hold: 21,
  suppress: 0,
};

const RICHER_CLAIM_TYPES = new Set([
  "construction-date",
  "demolition",
  "event",
  "architect",
  "relationship",
]);

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
  const claimsByPabId: Record<string, Claim[]> = {};

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
      // Deterministic production identity — see PabGroundingResult.osmElementId's
      // doc comment in pab/pabGrounding.ts. Set only when grounding matched a
      // real, current OSM element; never derived from placeKey, address text,
      // or any fuzzy signal. Absence leaves the claim non-projectable.
      if (grounding.osmElementId) {
        claim.productionSubjectId = grounding.osmElementId;
      }
    }
    claimsByPabId[record.pabId] = recordClaims;
    claims.push(...recordClaims);
  }

  const outcomes = runPipeline(claims, sources);

  // --- Report point 1: old vs new total extracted claims ---
  console.log("--- 1. Old vs new total extracted claims ---");
  console.log(
    `  OLD: ${OLD_TOTALS.totalClaims} claims from ${OLD_TOTALS.claimBearingRecords} claim-bearing records`,
  );
  console.log(
    `  NEW: ${claims.length} claims from ${claimBearing.length} claim-bearing records\n`,
  );

  // --- Report point 2: claim counts by claim type ---
  const byType: Record<string, number> = {};
  for (const c of claims) byType[c.claimType] = (byType[c.claimType] ?? 0) + 1;
  console.log("--- 2. Claim counts by claim type ---");
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1]))
    console.log(`  ${t}: ${n}`);
  console.log();

  // --- Report point 3: records producing at least one richer historical claim ---
  const recordsWithRicherClaim = Object.entries(claimsByPabId).filter(
    ([, cs]) => cs.some((c) => RICHER_CLAIM_TYPES.has(c.claimType)),
  );
  console.log(
    `--- 3. Records producing >=1 richer historical claim (beyond identity/register-status): ${recordsWithRicherClaim.length} of ${claimBearing.length} ---\n`,
  );

  // --- Report point 4: downstream AUTO-ADMIT/HOLD/SUPPRESS totals ---
  const admit = outcomes.filter(
    (o) => o.decision.decision === "AUTO-ADMIT",
  ).length;
  const hold = outcomes.filter((o) => o.decision.decision === "HOLD").length;
  const suppress = outcomes.filter(
    (o) => o.decision.decision === "SUPPRESS",
  ).length;
  console.log("--- 4. Downstream totals ---");
  console.log(
    `  AUTO-ADMIT: ${admit} | HOLD: ${hold} | SUPPRESS: ${suppress} (total ${outcomes.length})\n`,
  );

  // --- Report point 5: AUTO-ADMIT claims by editorial quality ---
  const admitted = outcomes.filter((o) => o.decision.decision === "AUTO-ADMIT");
  const admittedHigh = admitted.filter(
    (o) => o.decision.editorialQuality === "high",
  ).length;
  const admittedMedium = admitted.filter(
    (o) => o.decision.editorialQuality === "medium",
  ).length;
  const admittedLow = admitted.filter(
    (o) => o.decision.editorialQuality === "low",
  ).length;
  console.log("--- 5. AUTO-ADMIT claims by editorial quality ---");
  console.log(
    `  high: ${admittedHigh} | medium: ${admittedMedium} | low: ${admittedLow}\n`,
  );

  // --- Report point 6: strongest examples ---
  const strongExamples = admitted
    .filter(
      (o) =>
        (o.decision.editorialQuality === "high" ||
          o.decision.editorialQuality === "medium") &&
        RICHER_CLAIM_TYPES.has(o.claim.claimType),
    )
    .slice(0, 25);
  console.log(
    `--- 6. Strongest automatically extracted Streetlit-worthy material (${strongExamples.length} shown, medium/high editorial, richer claim types) ---`,
  );
  for (const o of strongExamples) {
    console.log(
      `  [${o.claim.claimType}/${o.decision.editorialQuality}] ${o.claim.placeKey} (${o.claim.address}): ${o.claim.claimText}`,
    );
  }
  console.log();

  // --- Report point 8 helper: most-important-metric ---
  const storyPlaceKeys = new Set(
    outcomes
      .filter(
        (o) =>
          o.decision.decision === "AUTO-ADMIT" &&
          (o.decision.editorialQuality === "high" ||
            o.decision.editorialQuality === "medium") &&
          RICHER_CLAIM_TYPES.has(o.claim.claimType),
      )
      .map((o) => o.claim.placeKey),
  );
  console.log(
    `--- MOST IMPORTANT METRIC: distinct places with >=1 safely-supported medium/high-value historical claim (excludes register-status/bare-identity/generic metadata): ${storyPlaceKeys.size} ---\n`,
  );

  const outDir = dirname(fileURLToPath(import.meta.url));
  writeFileSync(
    join(outDir, "report-pab-extraction.json"),
    JSON.stringify(
      {
        oldTotals: OLD_TOTALS,
        newTotals: {
          claimBearingRecords: claimBearing.length,
          totalClaims: claims.length,
          autoAdmit: admit,
          hold,
          suppress,
        },
        claimCountsByType: byType,
        recordsWithRicherClaim: recordsWithRicherClaim.map(([id]) => id),
        recordsWithRicherClaimCount: recordsWithRicherClaim.length,
        admitByEditorialQuality: {
          high: admittedHigh,
          medium: admittedMedium,
          low: admittedLow,
        },
        storyPlaceKeyCount: storyPlaceKeys.size,
        storyPlaceKeys: [...storyPlaceKeys],
        groundingByPabId,
        outcomes,
      },
      null,
      2,
    ),
  );
  console.log(
    `Full structured output written to ${join(outDir, "report-pab-extraction.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
