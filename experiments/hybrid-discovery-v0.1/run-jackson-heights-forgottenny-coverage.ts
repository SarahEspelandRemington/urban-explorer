/**
 * Bounded source-qualification + coverage experiment: does Forgotten New
 * York (forgotten-ny.com) operate as a scalable narrative-source lane
 * through the existing adapter -> extraction -> grounding -> admission ->
 * worthiness architecture, and how many of the 41 Jackson Heights
 * candidates still `unevaluated` after the LPC coverage experiment
 * (run-jackson-heights-lpc-coverage.ts) become positively worthiness-
 * evaluable? Offline/non-production, experimental — see README.md.
 *
 * Reuses the shared narrative extraction core (narrative/narrativeExtractor.ts,
 * already proven by Hidden City/Ephemeral) and the EXACT SAME address-only
 * grounding function Ephemeral New York uses (re-exported unchanged by
 * forgottenny/forgottenNyGrounding.ts — see that module's doc for why no new
 * grounding logic was needed) and the production admission engine
 * unchanged. Only forgottenny/forgottenNyAdapter.ts and
 * forgottenny/forgottenNyExtractor.ts are new, and both are thin,
 * architecturally parallel to the Ephemeral New York trio.
 *
 * Candidate selection: Forgotten New York's prose overwhelmingly uses
 * cross-street/intersection addressing ("82nd Street off 37th Avenue"), not
 * street-number addressing, and several tagged Jackson Heights articles are
 * multi-subject neighborhood surveys spanning dozens of buildings across a
 * wide area (see README-referenced coverage report for the full discovery
 * list of 30 tagged/searched articles). Consistent with the guardrail
 * against forcing a point match onto a non-point-shaped story, this script
 * hand-selects the subset of single-subject, address-or-cross-street-stated
 * candidates for a real grounding+admission+worthiness run (mirroring
 * run-ephemeral-production-proof.ts's hand-identified-candidate pattern) and
 * reports the remaining multi-subject survey articles as HOLD/decomposition-
 * needed rather than fabricating a single-point match for them.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  fetchForgottenNyArticle,
  type ForgottenNyArticle,
} from "./forgottenny/forgottenNyAdapter";
import {
  extractForgottenNyClaims,
  buildForgottenNySource,
} from "./forgottenny/forgottenNyExtractor";
import {
  fetchOsmBboxIndex,
  groundForgottenNyAddress,
  type ForgottenNyGroundingResult,
} from "./forgottenny/forgottenNyGrounding";
import { W38_W53_CORRIDOR_BBOX as _unused } from "./forgottenny/forgottenNyGrounding";
import type { LpcCorridorBbox } from "./lpc/lpcAdapter";
import type { Claim, Source } from "./types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

void _unused;

const JACKSON_HEIGHTS_BBOX: LpcCorridorBbox = {
  minLat: 40.74616,
  maxLat: 40.75424,
  minLon: -73.88833,
  maxLon: -73.87767,
};

interface Candidate {
  postId: number;
  placeKey: string;
  title: string;
  /** "" for a deliberately non-point-groundable candidate (cross-street-only or block-range-only prose) — never fabricated. */
  address: string;
  streetName: string;
  note: string;
}

// Hand-identified from the 30 discovered Jackson Heights-tagged/searched
// Forgotten New York articles (see coverage report) — the single-subject
// subset with either a stated street-number address or a clear
// cross-street/no-address identity anchor. Multi-subject survey articles
// (e.g. "JACKSON HEIGHTS and EAST ELMHURST, Queens", "TRAVERS PARK") are
// intentionally excluded from this run and reported separately as
// HOLD/decomposition-needed — see report's groundingFailures section.
const CANDIDATES: Candidate[] = [
  {
    postId: 114145,
    placeKey: "fny-crooked-house",
    title: "Crooked House",
    address: "80-19 31st Avenue",
    streetName: "31st Avenue",
    note: "Real street-number address stated in-text.",
  },
  {
    postId: 52279,
    placeKey: "fny-last-jahns",
    title: "Jahn's",
    address: "81-04 37th Avenue",
    streetName: "37th Avenue",
    note: "Real street-number address stated in-text.",
  },
  {
    postId: 118780,
    placeKey: "fny-leverich-cemetery",
    title: "Leverich Cemetery",
    address: "",
    streetName: "35th Avenue",
    note: "Only a cross-street given (35th Avenue at 71st Street) — deliberately empty address, identity-anchor-only extraction.",
  },
  {
    postId: 118425,
    placeKey: "fny-barneys-shoes",
    title: "Barney's Ladies' Shoes",
    address: "",
    streetName: "82nd Street",
    note: "Only a cross-street given (82nd Street off 37th Avenue); the sign itself has already been removed to a museum — no current point to ground to either way.",
  },
  {
    postId: 107781,
    placeKey: "fny-scrabble-sign",
    title: "Scrabble street sign (Alfred Butts)",
    address: "",
    streetName: "35th Avenue",
    note: "A DOT street sign at an intersection (35th Avenue and 82nd Street), not a building — deliberately empty address.",
  },
  {
    postId: 99590,
    placeKey: "fny-travers-park",
    title: "Travers Park",
    address: "",
    streetName: "34th Avenue",
    note: "Named public park given only as a block range (34th Avenue between 77th and 78th Streets), no street-number address — deliberately empty address to test named-but-addressless civic space handling.",
  },
];

const outDir = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("--- Forgotten New York bounded candidate run ---");
  const osmIndex = await fetchOsmBboxIndex(JACKSON_HEIGHTS_BBOX);
  console.log(`OSM bbox index: ${osmIndex.length} addressed elements\n`);

  const claims: Claim[] = [];
  const sources: Record<string, Source> = {};
  const groundingByPlaceKey: Record<string, ForgottenNyGroundingResult> = {};
  const articlesById: Record<number, ForgottenNyArticle> = {};

  for (const candidate of CANDIDATES) {
    if (!articlesById[candidate.postId]) {
      articlesById[candidate.postId] = await fetchForgottenNyArticle(
        candidate.postId,
      );
    }
    const article = articlesById[candidate.postId];

    const grounding = groundForgottenNyAddress(
      candidate.address || null,
      osmIndex,
    );
    groundingByPlaceKey[candidate.placeKey] = grounding;

    const candidateClaims = extractForgottenNyClaims({
      article,
      placeKey: candidate.placeKey,
      address: candidate.address,
      streetName: candidate.streetName,
      title: candidate.title,
      proposedIdentityType: grounding.proposedIdentityType,
    });
    for (const claim of candidateClaims) {
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
    console.log(
      `${candidate.placeKey}: ${candidateClaims.length} claims, grounding=${grounding.category}/${grounding.confidence}${grounding.osmElementId ? ` -> ${grounding.osmElementId}` : ""}`,
    );

    if (candidateClaims.length === 0) continue;
    const source = buildForgottenNySource(article, candidateClaims);
    sources[source.id] = source;
    claims.push(...candidateClaims);
  }
  console.log();

  const generatedAt = new Date().toISOString();
  const artifact: GeneratedEvidenceArtifact = generateArtifact(
    claims,
    sources,
    { generatedAt },
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

  for (const [placeKey, grounding] of Object.entries(groundingByPlaceKey)) {
    const subjectId = grounding.osmElementId;
    const worthiness = subjectId
      ? gated.worthinessBySubject[subjectId]
      : undefined;
    console.log(
      `${placeKey}: subjectId=${subjectId ?? "(none)"} worthiness=${worthiness ? (worthiness.projectableForDiscovery ? "positive" : "insufficient") : "n/a (no productionSubjectId)"}`,
    );
  }

  const outPath = join(
    outDir,
    "report-jackson-heights-forgottenny-coverage.json",
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        bbox: JACKSON_HEIGHTS_BBOX,
        osmIndexSize: osmIndex.length,
        candidates: CANDIDATES,
        groundingByPlaceKey,
        artifactSummary: artifact.summary,
        worthinessBySubject: gated.worthinessBySubject,
        artifact,
        projection,
        gated,
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
