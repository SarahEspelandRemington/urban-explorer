/**
 * Source-native Forgotten New York discovery proof — Jackson Heights.
 * Offline/non-production, experimental — see README.md.
 *
 * CORRECTED FRAMING (supersedes run-jackson-heights-forgottenny-coverage.ts's
 * approach): Streetlit's settled hybrid-discovery architecture treats
 * trusted narrative/source-native discovery as introducing candidate
 * stories FIRST — OSM is then used only to ground/identify those stories,
 * not to define the universe of eligible candidates. The prior coverage
 * script instead filtered candidates by whether they matched the
 * OSM-derived 76-candidate roster, which is the wrong direction for a
 * narrative source. This script uses Forgotten New York's own 30
 * Jackson-Heights-tagged/searched articles (found live via the WP REST API
 * tag/search mechanisms — see forgottenNyAdapter.ts) as the discovery
 * universe, independent of the 76-candidate roster. That roster is
 * consulted only afterward, to report which grounded results are net-new
 * (not merely to gate which candidates were considered).
 *
 * Candidate selection: all 30 articles were fetched and read. Single- or
 * near-single-subject stories (a real address, a cross-street/no-address
 * identity anchor for a named place/sign/park, or a block-range) were
 * hand-identified per the narrative-extractor's own documented contract
 * ("callers should call this once PER subject with that subject's own name
 * as the anchor" — see forgottenNyExtractor.ts). Multi-subject
 * neighborhood-walk survey articles (confirmed via both full reads and a
 * bulk hyphenated-address scan finding zero street-number addresses in any
 * of them) and citywide infrastructure-typology pieces with only an
 * incidental Jackson Heights mention are excluded here and reported
 * separately as HOLD, per the guardrail against forcing a point match onto
 * a non-point-shaped or non-place story — see the accompanying report.
 *
 * Reuses the shared narrative extraction core, the shared (now-fixed)
 * address-only grounding function, and the production admission engine
 * unchanged. No new claim types, no new worthiness rule, no
 * Jackson-Heights-specific parsing.
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
import type { LpcCorridorBbox } from "./lpc/lpcAdapter";
import type { Claim, Source } from "./types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

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
  /** "" for a deliberately non-point-groundable candidate (cross-street-only, block-range-only, or road-only prose) — never fabricated. */
  address: string;
  streetName: string;
  note: string;
}

// Source-native candidates: every defensible single-/near-single-subject
// story found across all 30 articles, NOT filtered by the 76-candidate OSM
// roster. See module doc + report for the 30-article read-through that
// produced this list, and for the excluded multi-subject/typology articles.
const CANDIDATES: Candidate[] = [
  {
    postId: 114145,
    placeKey: "fny-crooked-house",
    title: "Crooked House",
    address: "80-19 31st Avenue",
    streetName: "31st Avenue",
    note: "Real street-number address stated in-text. (Repeat from prior proof — bbox-coverage gap expected, 31st Avenue not present in this bbox.)",
  },
  {
    postId: 52279,
    placeKey: "fny-last-jahns",
    title: "Jahn's",
    address: "81-04 37th Avenue",
    streetName: "37th Avenue",
    note: "Real street-number address stated in-text. Grounding regression case for the Part 1 fix.",
  },
  {
    postId: 103425,
    placeKey: "fny-andrew-jackson-apts",
    title: "Andrew Jackson",
    address: "35-20 Leverich Street",
    streetName: "Leverich Street",
    note: "Real street-number address stated in-text — apartment building erroneously named for President Andrew Jackson, embedded in a genuine correction of the neighborhood-name-origin myth (real namesake: John C. Jackson's 1857 turnpike). Net-new: not in the 76-candidate roster.",
  },
  {
    postId: 52283,
    placeKey: "fny-jh-post-office",
    title: "Jackson Heights Post Office",
    address: "78-02 37th Avenue",
    streetName: "37th Avenue",
    note: "Real street-number address stated in-text — Georgian-style post office with a named 1940 WPA-era interior mural (Peppino Mangravite, 'Development of Jackson Heights'). Confirmed live (Turn 11 diagnostic) as a distinct OSM node (node/2846354501) from the already-rostered 'Jackson Heights Station Flushing Post Office' way — an OSM entity-fragmentation case, not a duplicate.",
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
    note: "Named park given only as a cross-street (Astoria Boulevard and 90th Street) — deliberately empty address. Net-new: not in the 76-candidate roster.",
  },
  {
    postId: 114091,
    placeKey: "fny-mount-everest-way",
    title: "Mount Everest Way",
    address: "",
    streetName: "31st Avenue",
    note: "Co-named street sign at an intersection (75th Street and 31st Avenue), not a building — deliberately empty address. Net-new: not in the 76-candidate roster.",
  },
  {
    postId: 53214,
    placeKey: "fny-last-lamp-mohican",
    title: "Last Lamp Mohican",
    address: "",
    streetName: "Roosevelt Avenue",
    note: "A specific surviving lamppost at an intersection (Roosevelt Avenue and 86th Street), not a building — deliberately empty address. Net-new: not in the 76-candidate roster.",
  },
  {
    postId: 111082,
    placeKey: "fny-earle-theatre",
    title: "Earle Theatre",
    address: "",
    streetName: "Broadway",
    note: "Former movie theater (now a restaurant), identified only by nearby intersection (Broadway/Roosevelt/73rd Street) — near the JH/Elmhurst border, likely just outside this bbox. Deliberately empty address. Net-new: not in the 76-candidate roster.",
  },
];

const outDir = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("--- Forgotten New York source-native candidate run ---");
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
      // Every candidate in this batch genuinely sits within Jackson Heights —
      // real, not fabricated, and not specific to any one candidate. Prevents
      // pivotsAwayFromTarget from treating a sentence that merely names this
      // real containing neighborhood as introducing a different subject. See
      // narrativeExtractor.ts's ownContextNames doc for the false positive
      // this fixes.
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

  const outPath = join(
    outDir,
    "report-jackson-heights-forgottenny-source-native.json",
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
