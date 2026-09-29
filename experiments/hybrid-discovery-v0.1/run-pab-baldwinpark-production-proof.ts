/**
 * Hybrid Discovery v1 — PAB + Baldwin Park combined production-admission
 * proof. Offline/non-production, experimental — see README.md.
 *
 * FROZEN PAB retrieval/interpretation/grounding/claim-extraction (identical
 * to run-pab-production-proof.ts) -> validated Baldwin Park place-driven
 * page matching/claim extraction (baldwinpark/baldwinParkMatcher.ts,
 * baldwinpark/baldwinParkExtractor.ts, unchanged) -> validated cross-source
 * join (crossSourceJoin.ts, unchanged) -> PROMOTED admission engine
 * (artifacts/api-server/src/lib/localHistoryAdmission/artifact.ts,
 * projector.ts, worthiness.ts, unchanged/not tuned further).
 *
 * This script computes TWO runs from the same live PAB retrieval so the
 * comparison is apples-to-apples:
 *   1. PAB-only baseline (pristine claims, no Baldwin Park, no join) — the
 *      same shape as run-pab-production-proof.ts's own output.
 *   2. Combined PAB + Baldwin Park (deep-cloned PAB claims + newly extracted
 *      Baldwin Park claims, joined, then run through the same promoted
 *      engine).
 * Baseline claims are cloned (via structuredClone) before being combined
 * with Baldwin Park claims, specifically so crossSourceJoin.ts's in-place
 * mutation of epistemicMarkers/corroborationKey on the combined set can
 * never retroactively contaminate the already-computed PAB-only baseline
 * artifact (which holds direct references to the pristine claim objects).
 *
 * Baldwin Park pages are loaded from the existing cached corpus
 * (baldwinpark-pages.json, produced by fetch-baldwinpark-pages.ts) rather
 * than re-fetched live, following the established precedent in
 * run-cross-source-enrichment.ts.
 *
 * productionSubjectId is carried from the PAB grounding path only: a place's
 * Baldwin Park claims get the exact same productionSubjectId as that
 * place's PAB claims (grounding.osmElementId), and only when grounding
 * produced one. A Baldwin Park claim for a place whose grounding did not
 * resolve to a deterministic OSM identity remains non-projectable, same as
 * a PAB claim would.
 *
 * This script does NOT merge its output into curatedLocalHistory.ts and does
 * NOT deploy/push/change API/client/cache behavior — it only produces a
 * checked report + projection data for inspection.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-pab-baldwinpark-production-proof.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { retrievePabCorridor, type PabRetrievalRecord } from "./pab/pabAdapter";
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
import type { BaldwinParkPage } from "./baldwinpark/baldwinParkAdapter";
import { joinPabAndBaldwinParkClaims } from "./crossSourceJoin";
import { combinePabAndBaldwinParkClaims } from "./combinePabAndBaldwinPark";
import type { Claim, Source } from "./types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import {
  projectRuntimeCompat,
  type GeneratedRuntimeProjection,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import {
  applyDiscoveryWorthinessGate,
  type DiscoveryWorthinessGateResult,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function primaryAddress(record: PabRetrievalRecord): string {
  return record.matchedCorridorAddresses[0] ?? record.addressBlock[0] ?? "";
}

interface PabPlace {
  placeKey: string;
  address: string;
  title: string;
  grounding: PabGroundingResult;
  pabClaims: Claim[];
  pabSource: Source;
}

function isPabSourceId(id: string): boolean {
  return id.startsWith("pab-");
}
function isBpSourceId(id: string): boolean {
  return id.startsWith("bp-");
}
function claimIsFromPab(c: Claim): boolean {
  return c.sourceIds.some(isPabSourceId);
}
function claimIsFromBp(c: Claim): boolean {
  return c.sourceIds.some(isBpSourceId);
}

function admitCounts(artifact: GeneratedEvidenceArtifact) {
  const admitted = artifact.claims.filter(
    (r) => r.decision.decision === "AUTO-ADMIT",
  );
  return {
    pab: admitted.filter((r) => claimIsFromPab(r.claim)).length,
    bp: admitted.filter((r) => claimIsFromBp(r.claim)).length,
    total: admitted.length,
  };
}

function groupTypeSummary(
  claimIds: string[],
  artifact: GeneratedEvidenceArtifact,
) {
  const group = claimIds.map(
    (id) => artifact.claims.find((r) => r.claimId === id)!,
  );
  return {
    claimCount: group.length,
    claimTypes: [...new Set(group.map((r) => r.claim.claimType))],
  };
}

async function main() {
  const outDir = dirname(fileURLToPath(import.meta.url));

  // --- Frozen PAB retrieval/interpretation/grounding/extraction (identical to run-pab-production-proof.ts) ---
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

  const places: PabPlace[] = [];
  const pabSources: Record<string, Source> = {};
  for (const interpretedRecord of claimBearing) {
    const record = adapterResult.records.find(
      (r) => r.pabId === interpretedRecord.pabId,
    )!;
    const grounding = groundPabRecord(record, interpretedRecord, osmIndex);
    const placeKey = `pab-record-${record.pabId}`;
    const address = primaryAddress(record);

    const pabSource = buildPabSource(record, interpretedRecord);
    const pabClaims = extractClaimsFromPabRecord(record, interpretedRecord);
    for (const claim of pabClaims) {
      claim.proposedIdentityType = grounding.proposedIdentityType;
      if (grounding.matchedIdentifier || grounding.matchingSignal) {
        claim.locationHints = [
          grounding.matchedIdentifier,
          grounding.matchingSignal,
        ]
          .filter(Boolean)
          .join(" — ");
      }
      if (grounding.osmElementId) {
        claim.productionSubjectId = grounding.osmElementId;
      }
    }
    pabSources[pabSource.id] = pabSource;
    places.push({
      placeKey,
      address,
      title: interpretedRecord.title,
      grounding,
      pabClaims,
      pabSource,
    });
  }

  const pabOnlyClaims = places.flatMap((p) => p.pabClaims);
  const generatedAt = new Date().toISOString();

  // --- Run 1: PAB-only baseline, computed BEFORE any Baldwin Park claims exist or any join mutation occurs ---
  const pabOnlyArtifact = generateArtifact(pabOnlyClaims, pabSources, {
    generatedAt,
  });
  const pabOnlyProjection = projectRuntimeCompat(pabOnlyArtifact);
  const pabOnlyGated = applyDiscoveryWorthinessGate(
    pabOnlyProjection,
    pabOnlyArtifact,
  );

  // --- Baldwin Park stages (validated adapter/matcher/extractor, unchanged) ---
  const bpPages: BaldwinParkPage[] = JSON.parse(
    readFileSync(join(outDir, "baldwinpark-pages.json"), "utf8"),
  );
  console.log(`Loaded ${bpPages.length} cached Baldwin Park pages\n`);

  // Deep-clones PAB claims for the combined run (so crossSourceJoin.ts's
  // in-place mutation can never retroactively affect pabOnlyArtifact above,
  // which holds direct references to the pristine originals), reattributes
  // sibling-placeKey claims to a shared canonical placeKey, and finds/
  // extracts/dedupes Baldwin Park claims per place — see
  // combinePabAndBaldwinPark.ts for the full bug-fix rationale.
  const {
    combinedPabClaims,
    combinedSources,
    bpClaimsBySlug,
    bpClaimsWithoutProductionSubjectId,
    skippedNonDominantByPlace,
    pagesMatchedByMultiplePlaces,
  } = combinePabAndBaldwinParkClaims(
    places,
    pabOnlyClaims,
    pabSources,
    bpPages,
  );

  const allBpClaims = Object.values(bpClaimsBySlug).flat();
  const bleedPagesAcrossPlaces = [...pagesMatchedByMultiplePlaces.entries()]
    .filter(([, placeKeys]) => placeKeys.size > 1)
    .map(([slug, placeKeys]) => ({ slug, placeKeys: [...placeKeys] }));

  const joinResult = joinPabAndBaldwinParkClaims(combinedPabClaims);

  // --- Run 2: combined PAB + Baldwin Park through the promoted engine ---
  const combinedArtifact = generateArtifact(
    combinedPabClaims,
    combinedSources,
    { generatedAt },
  );
  const combinedProjection: GeneratedRuntimeProjection =
    projectRuntimeCompat(combinedArtifact);
  const combinedGated: DiscoveryWorthinessGateResult =
    applyDiscoveryWorthinessGate(combinedProjection, combinedArtifact);

  // ============================== REPORT ==============================
  console.log("--- 1. Total admitted claims by source ---");
  const baselineAdmit = admitCounts(pabOnlyArtifact);
  const combinedAdmit = admitCounts(combinedArtifact);
  console.log(
    `  PAB-only:            PAB=${baselineAdmit.pab} | total=${baselineAdmit.total}`,
  );
  console.log(
    `  PAB + Baldwin Park:  PAB=${combinedAdmit.pab} | BP=${combinedAdmit.bp} | total=${combinedAdmit.total}\n`,
  );

  console.log("--- 2. Structurally projectable subjects ---");
  const baselineProjected = Object.keys(pabOnlyProjection.entries);
  const combinedProjected = Object.keys(combinedProjection.entries);
  console.log(
    `  PAB-only: ${baselineProjected.length} | PAB + Baldwin Park: ${combinedProjected.length}\n`,
  );

  console.log("--- 3. Subjects passing the discovery-worthiness gate ---");
  const baselinePassed = new Set(Object.keys(pabOnlyGated.entries));
  const combinedPassed = new Set(Object.keys(combinedGated.entries));
  console.log(
    `  PAB-only: ${baselinePassed.size} | PAB + Baldwin Park: ${combinedPassed.size}\n`,
  );

  const additionalWorthySubjects = [...combinedPassed].filter(
    (id) => !baselinePassed.has(id),
  );
  console.log("--- 4. Additional worthwhile subjects Baldwin Park adds ---");
  console.log(`  ${additionalWorthySubjects.length}`);
  for (const id of additionalWorthySubjects) {
    const s = groupTypeSummary(
      combinedGated.compositionMap[id],
      combinedArtifact,
    );
    console.log(
      `    ${id} (${s.claimCount} claims, types: ${s.claimTypes.join(", ")})`,
    );
  }
  console.log();

  console.log(
    "--- 5. Already-passing subjects that become richer with Baldwin Park added ---",
  );
  const richerSubjects: {
    subjectId: string;
    before: ReturnType<typeof groupTypeSummary>;
    after: ReturnType<typeof groupTypeSummary>;
  }[] = [];
  for (const id of baselinePassed) {
    if (!combinedPassed.has(id)) continue;
    const before = groupTypeSummary(
      pabOnlyGated.compositionMap[id],
      pabOnlyArtifact,
    );
    const after = groupTypeSummary(
      combinedGated.compositionMap[id],
      combinedArtifact,
    );
    if (
      after.claimCount > before.claimCount ||
      after.claimTypes.length > before.claimTypes.length
    ) {
      richerSubjects.push({ subjectId: id, before, after });
    }
  }
  console.log(`  ${richerSubjects.length}`);
  for (const r of richerSubjects) {
    console.log(
      `    ${r.subjectId}: ${r.before.claimCount} claims (${r.before.claimTypes.join(", ")}) -> ${r.after.claimCount} claims (${r.after.claimTypes.join(", ")})`,
    );
  }
  console.log();

  console.log("--- 6. Cross-source corroborations/conflicts ---");
  console.log(
    `  corroborated (genuinely cross-class) claims: ${joinResult.corroboratedClaimIds.length}`,
  );
  console.log(`  conflicts: ${joinResult.conflicts.length}`);
  for (const c of joinResult.conflicts) {
    console.log(
      `    ${c.claimIdA} vs ${c.claimIdB} [${c.claimType}]: ${c.reason}`,
    );
  }
  console.log();

  console.log("--- 7. Strongest newly enriched examples ---");
  const newlyWorthySummaries = additionalWorthySubjects.map((id) => ({
    subjectId: id,
    address: combinedArtifact.claims.find(
      (r) => r.subjectId === id && r.claim.address,
    )?.claim.address,
    claims: combinedGated.compositionMap[id].map((cid) => {
      const r = combinedArtifact.claims.find((rr) => rr.claimId === cid)!;
      return {
        claimType: r.claim.claimType,
        claimText: r.claim.claimText,
        fromBp: claimIsFromBp(r.claim),
      };
    }),
  }));
  const richerSummaries = richerSubjects.map((r) => ({
    subjectId: r.subjectId,
    address: combinedArtifact.claims.find(
      (rec) => rec.subjectId === r.subjectId && rec.claim.address,
    )?.claim.address,
    claims: combinedGated.compositionMap[r.subjectId].map((cid) => {
      const rec = combinedArtifact.claims.find((rr) => rr.claimId === cid)!;
      return {
        claimType: rec.claim.claimType,
        claimText: rec.claim.claimText,
        fromBp: claimIsFromBp(rec.claim),
      };
    }),
  }));
  for (const s of [...newlyWorthySummaries, ...richerSummaries].slice(0, 10)) {
    console.log(`  [${s.address}] ${s.subjectId}`);
    for (const c of s.claims) {
      console.log(
        `    (${c.claimType}${c.fromBp ? "/BP" : "/PAB"}) ${c.claimText}`,
      );
    }
  }
  console.log();

  console.log(
    "--- 8. Wrong-place/context-bleed/identity issues (structural checks) ---",
  );
  console.log(
    `  Baldwin Park pages matched as dominant subject for >1 distinct PAB place: ${bleedPagesAcrossPlaces.length}`,
  );
  for (const b of bleedPagesAcrossPlaces) {
    console.log(`    !! ${b.slug} -> ${b.placeKeys.join(", ")}`);
  }
  console.log(
    `  non-dominant page matches deliberately skipped (bleed avoided by matcher): ${skippedNonDominantByPlace.length}`,
  );
  console.log();

  console.log(
    "--- 9. Baldwin Park claims lacking a deterministic production identity ---",
  );
  console.log(
    `  ${bpClaimsWithoutProductionSubjectId.length} of ${allBpClaims.length} total Baldwin Park claims`,
  );
  const byIdentityType: Record<string, number> = {};
  for (const c of bpClaimsWithoutProductionSubjectId) {
    byIdentityType[c.proposedIdentityType] =
      (byIdentityType[c.proposedIdentityType] ?? 0) + 1;
  }
  for (const [t, n] of Object.entries(byIdentityType)) {
    console.log(`    ${t}: ${n}`);
  }
  console.log();

  console.log(
    `--- MOST IMPORTANT METRIC: worthiness-gate-passing subjects, PAB-only vs PAB + Baldwin Park: ${baselinePassed.size} -> ${combinedPassed.size} ---\n`,
  );

  writeFileSync(
    join(outDir, "report-pab-baldwinpark-production-proof.json"),
    JSON.stringify(
      {
        baseline: {
          admitted: baselineAdmit,
          projectedSubjects: baselineProjected.length,
          passedWorthinessGate: baselinePassed.size,
          passedSubjectIds: [...baselinePassed],
        },
        combined: {
          admitted: combinedAdmit,
          projectedSubjects: combinedProjected.length,
          passedWorthinessGate: combinedPassed.size,
          passedSubjectIds: [...combinedPassed],
        },
        additionalWorthySubjects: newlyWorthySummaries,
        richerSubjects: richerSummaries,
        crossSourceJoin: joinResult,
        bleedPagesAcrossPlaces,
        skippedNonDominantByPlace,
        bpClaimsWithoutProductionSubjectId,
        allBpClaimCount: allBpClaims.length,
        pabOnlyArtifact,
        combinedArtifact,
        combinedProjection,
        combinedGated,
      },
      null,
      2,
    ),
  );
  console.log(
    `Full structured output written to ${join(outDir, "report-pab-baldwinpark-production-proof.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
