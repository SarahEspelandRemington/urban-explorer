/**
 * Forgotten New York source-native discovery — Jackson Heights production
 * generator. Offline batch tool, not part of the API server runtime (not
 * imported by any route). Run manually via tsx to (re)produce the canonical
 * evidence artifact + runtime projection + discovery-worthiness gate result
 * for this corridor, for hand-review before copying eligible entries into
 * ../../../curatedLocalHistory.ts's GENERATED_LOCAL_HISTORY.
 *
 * Promoted (faithful port) from
 * experiments/hybrid-discovery-v0.1/run-jackson-heights-forgottenny-source-native.ts,
 * now importing exclusively from production paths (../../narrativeExtractor,
 * ../../narrativeAddressGrounding, ../../nycAddress, ../../artifact,
 * ../../projector, ../../worthiness, ./forgottenNyAdapter/Extractor/Grounding)
 * rather than the experimental harness. Candidate list, bbox, and
 * ownContextNames are unchanged from the proven experiment run.
 *
 * Per the Production Promotion A scope: source-native discovery introduces
 * candidates FIRST — OSM is used only to ground them, not to define the
 * candidate universe. This script's CANDIDATES list is Forgotten New York's
 * own hand-identified single-/near-single-subject Jackson Heights articles,
 * not filtered by any pre-existing OSM roster.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  fetchForgottenNyArticle,
  type ForgottenNyArticle,
} from "./forgottenNyAdapter";
import {
  extractForgottenNyClaims,
  buildForgottenNySource,
} from "./forgottenNyExtractor";
import {
  fetchOsmBboxIndex,
  groundForgottenNyAddress,
  type NarrativeBbox,
  type NarrativeGroundingResult,
} from "./forgottenNyGrounding";
import type { Claim, Source } from "../../types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifact";
import { projectRuntimeCompat } from "../../projector";
import { applyDiscoveryWorthinessGate } from "../../worthiness";

const JACKSON_HEIGHTS_BBOX: NarrativeBbox = {
  minLat: 40.74616,
  maxLat: 40.75424,
  minLon: -73.88833,
  maxLon: -73.87767,
};

interface Candidate {
  postId: number;
  placeKey: string;
  title: string;
  /** "" for a deliberately non-point-groundable candidate (cross-street-only, block-range-only, or road-only prose) — never fabricated. */
  address: string;
  streetName: string;
  note: string;
}

// Source-native candidates: every defensible single-/near-single-subject
// story found across all 30 Jackson-Heights-tagged/searched Forgotten New
// York articles, NOT filtered by any pre-existing OSM roster. Unchanged from
// the proven experiment run — see its module doc for the full 30-article
// read-through methodology.
const CANDIDATES: Candidate[] = [
  {
    postId: 114145,
    placeKey: "fny-crooked-house",
    title: "Crooked House",
    address: "80-19 31st Avenue",
    streetName: "31st Avenue",
    note: "Real street-number address stated in-text. Known bbox-coverage gap — 31st Avenue is not present in this bbox.",
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
    postId: 103425,
    placeKey: "fny-andrew-jackson-apts",
    title: "Andrew Jackson",
    address: "35-20 Leverich Street",
    streetName: "Leverich Street",
    note: "Real street-number address stated in-text — apartment building erroneously named for President Andrew Jackson, embedded in a genuine correction of the neighborhood-name-origin myth (real namesake: John C. Jackson's 1857 turnpike).",
  },
  {
    postId: 52283,
    placeKey: "fny-jh-post-office",
    title: "Jackson Heights Post Office",
    address: "78-02 37th Avenue",
    streetName: "37th Avenue",
    note: "Real street-number address stated in-text — Georgian-style post office with a named 1940 WPA-era interior mural (Peppino Mangravite, 'Development of Jackson Heights').",
  },
  {
    postId: 52283,
    placeKey: "fny-robert-morris-apts",
    title: "Robert Morris Apartments",
    address: "",
    streetName: "37th Avenue",
    note: "Only a block range given (south side of 37th Avenue between 79th and 80th Street), no street-number address — deliberately empty address.",
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
    note: "Named public park given only as a block range (34th Avenue between 77th and 78th Streets), no street-number address.",
  },
  {
    postId: 83690,
    placeKey: "fny-one-room-schoolhouse-park",
    title: "One Room Schoolhouse Park",
    address: "",
    streetName: "Astoria Boulevard",
    note: "Named park given only as a cross-street (Astoria Boulevard and 90th Street) — deliberately empty address.",
  },
  {
    postId: 114091,
    placeKey: "fny-mount-everest-way",
    title: "Mount Everest Way",
    address: "",
    streetName: "31st Avenue",
    note: "Co-named street sign at an intersection (75th Street and 31st Avenue), not a building — deliberately empty address.",
  },
  {
    postId: 53214,
    placeKey: "fny-last-lamp-mohican",
    title: "Last Lamp Mohican",
    address: "",
    streetName: "Roosevelt Avenue",
    note: "A specific surviving lamppost at an intersection (Roosevelt Avenue and 86th Street), not a building — deliberately empty address.",
  },
  {
    postId: 111082,
    placeKey: "fny-earle-theatre",
    title: "Earle Theatre",
    address: "",
    streetName: "Broadway",
    note: "Former movie theater (now a restaurant), identified only by nearby intersection (Broadway/Roosevelt/73rd Street) — near the JH/Elmhurst border, likely just outside this bbox. Deliberately empty address.",
  },
];

const outDir = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log(
    "--- Forgotten New York source-native candidate run (production) ---",
  );
  const osmIndex = await fetchOsmBboxIndex(JACKSON_HEIGHTS_BBOX);
  console.log(`OSM bbox index: ${osmIndex.length} addressed elements\n`);

  const claims: Claim[] = [];
  const sources: Record<string, Source> = {};
  const groundingByPlaceKey: Record<string, NarrativeGroundingResult> = {};
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
      // Every candidate in this batch genuinely sits within Jackson Heights —
      // real, not fabricated, and not specific to any one candidate. See
      // narrativeExtractor.ts's ownContextNames doc for the false positive
      // this prevents.
      ownContextNames: ["Jackson Heights"],
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
    const sourceKey = `${article.id}-${candidate.placeKey}`;
    const source = buildForgottenNySource(article, candidateClaims);
    sources[sourceKey] = { ...source, id: sourceKey };
    for (const claim of candidateClaims) claim.sourceIds = [sourceKey];
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
      `${placeKey}: subjectId=${subjectId ?? "(none)"} grounding=${grounding.category} worthiness=${worthiness ? (worthiness.projectableForDiscovery ? "positive" : "insufficient") : "n/a (no productionSubjectId)"}`,
    );
  }

  const outPath = join(outDir, "report-jackson-heights-production.json");
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
