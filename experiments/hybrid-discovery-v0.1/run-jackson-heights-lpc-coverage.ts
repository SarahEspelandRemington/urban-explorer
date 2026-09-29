/**
 * Bounded coverage experiment: how many of the 76 currently `unevaluated`
 * Jackson Heights, Queens candidates (from the offline worthiness-contract
 * coverage audit) become positively worthiness-evaluable once the EXISTING
 * LPC structured-source lane (retrieveLpcCorridor / lpcClaimExtractor /
 * groundLpcRecord, proven in run-lpc-production-proof.ts) is pointed at a
 * new bbox. Offline/non-production, experimental — see README.md.
 *
 * Reuses every LPC module UNCHANGED — only the bbox parameter differs from
 * run-lpc-production-proof.ts. No Jackson-Heights-specific extraction path,
 * no new claim types, no new worthiness rule, no grounding-heuristic change.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-jackson-heights-lpc-coverage.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  retrieveLpcCorridor,
  type LpcCorridorBbox,
  type LpcRetrievalRecord,
} from "./lpc/lpcAdapter";
import {
  interpretLpcRecord,
  extractClaimsFromLpcRecord,
  buildLpcSource,
  type LpcInterpretedRecord,
} from "./lpc/lpcClaimExtractor";
import {
  fetchOsmBboxIndex,
  groundLpcRecord,
  type LpcGroundingResult,
} from "./lpc/lpcGrounding";
import type { Claim, Source } from "./types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

// Jackson Heights corridor bbox, derived from the same center/radius
// (40.7502, -73.8830, 450m) already used to build the 77-candidate sample
// in the prior coverage audit — not re-picked for this run.
const JACKSON_HEIGHTS_BBOX: LpcCorridorBbox = {
  minLat: 40.74616,
  maxLat: 40.75424,
  minLon: -73.88833,
  maxLon: -73.87767,
};

const outDir = dirname(fileURLToPath(import.meta.url));

// The 77 real named Jackson Heights candidates and their osmIds, captured
// live in the prior turn's coverage audit (jh_candidates.json). Loaded here
// only to classify LPC's grounding hits against that already-established
// unevaluated/insufficient roster — not re-fetched from Overpass.
interface JhCandidate {
  type: string;
  id: number;
  tags: Record<string, string>;
}

async function main() {
  const jhCandidates = JSON.parse(
    readFileSync("/tmp/jh_candidates.json", "utf-8"),
  ).elements as JhCandidate[];
  const jhOsmIds = new Set(jhCandidates.map((c) => `${c.type}/${c.id}`));
  // The one candidate already independently evaluated (wikipedia-a3,
  // insufficient) in the prior audit — excluded from the "unevaluated" base.
  const ALREADY_EVALUATED_OSM_ID = "node/2014077576"; // 82nd Street-Jackson Heights station
  const unevaluatedOsmIds = new Set(
    [...jhOsmIds].filter((id) => id !== ALREADY_EVALUATED_OSM_ID),
  );
  console.log(
    `Jackson Heights candidates: ${jhOsmIds.size} total, ${unevaluatedOsmIds.size} previously unevaluated.\n`,
  );

  console.log("--- LPC Retrieval (existing adapter, new bbox) ---");
  const adapterResult = await retrieveLpcCorridor(JACKSON_HEIGHTS_BBOX);
  console.log(
    `Field discovery: geometry field = ${adapterResult.fieldMap.geometryField}`,
  );
  console.log(`Query URL: ${adapterResult.queryUrl}`);
  console.log(
    `Retrieved ${adapterResult.totalRetrieved} LPC records in the Jackson Heights bbox.\n`,
  );

  const interpretedByRowId: Record<string, LpcInterpretedRecord> = {};
  const classificationCounts: Record<string, number> = {};
  for (const record of adapterResult.records) {
    const interpreted = interpretLpcRecord(
      record,
      adapterResult.fieldMap.fields,
    );
    interpretedByRowId[record.lpcRowId] = interpreted;
    classificationCounts[interpreted.classification] =
      (classificationCounts[interpreted.classification] ?? 0) + 1;
  }
  console.log("--- Classification tally ---");
  for (const [classification, count] of Object.entries(classificationCounts)) {
    console.log(`  ${classification}: ${count}`);
  }
  console.log();

  console.log("Fetching OSM bbox index (Overpass) for Jackson Heights...");
  const osmIndex = await fetchOsmBboxIndex(JACKSON_HEIGHTS_BBOX);
  console.log(`OSM bbox index: ${osmIndex.length} addressed elements\n`);

  const claims: Claim[] = [];
  const sources: Record<string, Source> = {};
  const groundingByRowId: Record<string, LpcGroundingResult> = {};
  const recordsByRowId: Record<string, LpcRetrievalRecord> = {};

  for (const record of adapterResult.records) {
    recordsByRowId[record.lpcRowId] = record;
    const interpreted = interpretedByRowId[record.lpcRowId];
    if (interpreted.classification !== "claim-bearing") continue;

    const grounding = groundLpcRecord(record, interpreted, osmIndex);
    groundingByRowId[record.lpcRowId] = grounding;

    const recordClaims = extractClaimsFromLpcRecord(record, interpreted);
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
      if (grounding.osmElementId) {
        claim.productionSubjectId = grounding.osmElementId;
      }
    }
    if (recordClaims.length === 0) continue;

    const source = buildLpcSource(record, interpreted);
    sources[source.id] = source;
    claims.push(...recordClaims);
  }

  const generatedAt = new Date().toISOString();
  const artifact: GeneratedEvidenceArtifact = generateArtifact(
    claims,
    sources,
    {
      generatedAt,
    },
  );
  const projection = projectRuntimeCompat(artifact);
  const gated = applyDiscoveryWorthinessGate(projection, artifact);

  console.log("--- Artifact decision totals ---");
  console.log(
    `  total claims: ${artifact.summary.totalClaims} | AUTO-ADMIT: ${artifact.summary.byDecision["AUTO-ADMIT"]} | HOLD: ${artifact.summary.byDecision.HOLD} | SUPPRESS: ${artifact.summary.byDecision.SUPPRESS}`,
  );
  console.log(
    `  distinct subjectIds (defined): ${artifact.summary.subjectCount}`,
  );
  console.log(
    `  integrityViolations: ${artifact.summary.integrityViolations.length}\n`,
  );

  // --- Cross-reference against the 76 previously-unevaluated candidates ---
  const groundedOsmIds = new Set(
    Object.values(groundingByRowId)
      .map((g) => g.osmElementId)
      .filter((id): id is string => !!id),
  );
  const matchedUnevaluated = [...unevaluatedOsmIds].filter((id) =>
    groundedOsmIds.has(id),
  );
  const positiveUnevaluated = matchedUnevaluated.filter(
    (id) => id in gated.entries,
  );
  const insufficientUnevaluated = matchedUnevaluated.filter(
    (id) => !(id in gated.entries) && id in gated.worthinessBySubject,
  );

  console.log(
    "--- Coverage vs. the 76 previously-unevaluated Jackson Heights candidates ---",
  );
  console.log(
    `  matched by LPC (grounded to one of the 76): ${matchedUnevaluated.length}`,
  );
  console.log(
    `  of those, worthinessStatus positive: ${positiveUnevaluated.length}`,
  );
  console.log(
    `  of those, worthinessStatus insufficient (evaluated, no qualifying material): ${insufficientUnevaluated.length}`,
  );
  console.log();

  for (const osmId of matchedUnevaluated) {
    const candidate = jhCandidates.find((c) => `${c.type}/${c.id}` === osmId);
    const worthiness = gated.worthinessBySubject[osmId];
    console.log(
      `  ${osmId} (${candidate?.tags.name ?? "unnamed"}): worthiness=${worthiness?.projectableForDiscovery ? "positive" : "insufficient"} — ${worthiness?.worthinessReasons.join(" ")}`,
    );
  }
  console.log();

  const outPath = join(outDir, "report-jackson-heights-lpc-coverage.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        bbox: JACKSON_HEIGHTS_BBOX,
        queryUrl: adapterResult.queryUrl,
        totalRetrieved: adapterResult.totalRetrieved,
        classificationCounts,
        osmIndexSize: osmIndex.length,
        groundingByRowId,
        artifactSummary: artifact.summary,
        jhCandidateCount: jhOsmIds.size,
        unevaluatedCount: unevaluatedOsmIds.size,
        matchedUnevaluated,
        positiveUnevaluated,
        insufficientUnevaluated,
        worthinessBySubject: gated.worthinessBySubject,
        artifact,
        projection,
        gated,
      },
      null,
      2,
    ),
  );
  console.log(`Full structured output written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
