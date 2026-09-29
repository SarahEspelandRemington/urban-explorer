// Isolated experiment only. Task C Step 1: real canonical evidence
// acquisition for the bounded multi-angle proof (Library Hotel, Film Center
// Building). Runs ONLY the minimum existing offline evidence/admission
// machinery (production Forgotten New York adapter/extractor/grounding +
// production generateArtifact/projectRuntimeCompat/applyDiscoveryWorthinessGate)
// against real, already-published source content. Does not hand-author
// claims, does not backfill from editorial calibration, does not use
// synthetic fixtures.
//
// Library Hotel: confirmed via live query against the real LPC Socrata
// dataset (gpmc-yuvp) and the real Forgotten New York search API that no
// existing source pipeline in this repo has coverage of this subject (see
// findings printed below) -- reported as an upstream evidence-coverage
// failure, not run through extraction.
//
// Film Center Building: one real Forgotten New York article
// (postId 107376, "44th STREET, Part 1: Hell's Kitchen, Theater District")
// contains one substantive paragraph naming the subject directly with real,
// specific facts. Run through the production extraction/admission pipeline
// below, unmodified.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchForgottenNyArticle } from "../../artifacts/api-server/src/lib/localHistoryAdmission/sources/forgottenNy/forgottenNyAdapter";
import {
  extractForgottenNyClaims,
  buildForgottenNySource,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/sources/forgottenNy/forgottenNyExtractor";
import {
  fetchOsmBboxIndex,
  groundForgottenNyAddress,
  type NarrativeBbox,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/sources/forgottenNy/forgottenNyGrounding";
import type {
  Claim,
  Source,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/types";
import { generateArtifact } from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

// Small bbox around 630 Ninth Avenue (between West 44th and West 45th
// Streets, Manhattan) -- Film Center Building's real address.
const FILM_CENTER_BBOX: NarrativeBbox = {
  minLat: 40.7595,
  maxLat: 40.7625,
  minLon: -73.995,
  maxLon: -73.991,
};

const outDir = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("--- Task C Step 1: real evidence acquisition ---\n");

  console.log("Library Hotel (299 Madison Avenue):");
  console.log(
    "  LPC Socrata dataset (gpmc-yuvp) live query: no Madison Avenue row in the 200-350 block range exists in the dataset at all (all Madison Avenue rows are Upper East Side, 690-1367 block range). Subject is not in an LPC historic district or individually landmarked in this dataset.",
  );
  console.log(
    '  Forgotten New York live search API: search("Library Hotel") returned no on-topic result (top hits: Hotel Longacre, unrelated walking-tour pieces); search("Dewey Decimal") returned zero results.',
  );
  console.log(
    "  CONCLUSION: no existing source pipeline in this repo has real coverage of this subject. Reporting as an upstream evidence-coverage finding, not running extraction.\n",
  );

  console.log("Film Center Building (630 Ninth Avenue):");
  const article = await fetchForgottenNyArticle(107376);
  console.log(`  Fetched real article: "${article.title}" (${article.url})`);

  const osmIndex = await fetchOsmBboxIndex(FILM_CENTER_BBOX);
  console.log(`  OSM bbox index: ${osmIndex.length} addressed elements`);

  const grounding = groundForgottenNyAddress("630 Ninth Avenue", osmIndex);
  console.log(
    `  Grounding: category=${grounding.category} confidence=${grounding.confidence}${grounding.osmElementId ? ` -> ${grounding.osmElementId}` : " (no OSM match)"}`,
  );

  const claims: Claim[] = extractForgottenNyClaims({
    article,
    placeKey: "fny-film-center-building",
    address: "630 Ninth Avenue",
    streetName: "Ninth Avenue",
    title: "Film Center Building",
    proposedIdentityType: grounding.proposedIdentityType,
    ownContextNames: ["Hell's Kitchen"],
  });
  console.log(`  Extracted claims: ${claims.length}`);
  for (const c of claims) {
    console.log(`    [${c.claimType}] ${c.claimText}`);
  }

  if (claims.length === 0) {
    console.log(
      "\n  CONCLUSION: extraction produced zero claims from the one available real article paragraph.",
    );
    return;
  }

  const source: Source = buildForgottenNySource(article, claims);
  const sourceKey = source.id;
  for (const claim of claims) claim.sourceIds = [sourceKey];
  if (grounding.matchedIdentifier || grounding.matchingSignal) {
    for (const claim of claims) {
      claim.locationHints = [
        grounding.matchedIdentifier,
        grounding.matchingSignal,
      ]
        .filter(Boolean)
        .join(" — ");
    }
  }
  if (grounding.osmElementId) {
    for (const claim of claims)
      claim.productionSubjectId = grounding.osmElementId;
  }

  const generatedAt = new Date().toISOString();
  const artifact = generateArtifact(
    claims,
    { [sourceKey]: source },
    { generatedAt },
  );
  const projection = projectRuntimeCompat(artifact);
  const gated = applyDiscoveryWorthinessGate(projection, artifact);

  console.log("\n  --- Artifact decision totals ---");
  console.log(
    `  total claims: ${artifact.summary.totalClaims} | AUTO-ADMIT: ${artifact.summary.byDecision["AUTO-ADMIT"]} | HOLD: ${artifact.summary.byDecision.HOLD} | SUPPRESS: ${artifact.summary.byDecision.SUPPRESS}`,
  );
  console.log(
    `  integrityViolations: ${artifact.summary.integrityViolations.length}`,
  );

  const subjectId = grounding.osmElementId;
  const worthiness = subjectId
    ? gated.worthinessBySubject[subjectId]
    : undefined;
  console.log(
    `  subjectId=${subjectId ?? "(none)"} worthiness=${worthiness ? (worthiness.projectableForDiscovery ? "positive" : "insufficient") : "n/a"}`,
  );

  const outPath = join(outDir, "report-multiangle-evidence.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        libraryHotel: {
          subjectId: "library-hotel-299-madison-ave",
          evidenceCoverage: "none",
          findings: [
            "LPC Socrata dataset (gpmc-yuvp): no Madison Avenue row in the 299/41st-St block range exists in the dataset.",
            'Forgotten New York search API: search("Library Hotel") -> no on-topic result.',
            'Forgotten New York search API: search("Dewey Decimal") -> zero results.',
          ],
        },
        filmCenterBuilding: {
          subjectId,
          article: { id: article.id, title: article.title, url: article.url },
          osmIndexSize: osmIndex.length,
          grounding,
          claims,
          source,
          artifactSummary: artifact.summary,
          worthiness,
          artifact,
          projection,
          gated,
        },
      },
      null,
      2,
    ),
  );
  console.log(`\nFull structured output written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
