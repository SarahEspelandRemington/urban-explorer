/**
 * Hybrid Discovery — NYC portability Phase 3: bounded production-promotion
 * proof combining LPC (structured) + Ephemeral New York (narrative) evidence
 * for the SAME small set of corridor subjects. Offline/non-production,
 * experimental — see README.md.
 *
 * Does NOT merge into curatedLocalHistory.ts and does NOT deploy/push/change
 * API/client/cache behavior. Reuses:
 *  - LPC's already-computed raw claims for 3 corridor rows, lifted verbatim
 *    from report-lpc-production-proof.json (Phase 1's own artifact output —
 *    no re-fetch of Socrata; same claims, same productionSubjectIds already
 *    proven in Phase 1).
 *  - Fresh Ephemeral extraction (ephemeral/ephemeralExtractor.ts) for 3 new
 *    articles about the SAME 3 physical buildings, using the same shared
 *    narrative core and address-based grounding already proven in Phase 2.
 *
 * For each subject, both sources' raw claims are combined into ONE
 * generateArtifact() call so that cross-source checks (duplicate/conflict
 * detection, etc.) see all claims for that subjectId jointly — the same
 * requirement identified by the Baldwin Park claimId-collision bug from the
 * Spring Garden v1 audit (see memory: hybrid-discovery-v1.md).
 *
 * LPC and Ephemeral claim ids each embed their own source-native placeKey
 * (lpc-record-row-N / eny-<slug>). Because checks.ts's temporalConsistency
 * groups conflict candidates strictly by claim.placeKey equality, two
 * different sources' claims about the SAME productionSubjectId would never
 * be compared unless their placeKeys are first canonicalized to one shared
 * key. This run reuses the exact source-agnostic sibling-placeKey
 * canonicalization already proven in combinePabAndBaldwinPark.ts (Hybrid
 * Discovery v1) — computePlaceKeysBySubjectId/canonicalPlaceKeyForSubject —
 * applied here across LPC+Ephemeral rather than PAB+Baldwin-Park siblings, to
 * make same-fact cross-source claims (e.g. two different construction-date
 * assertions for one building) visible to that existing check. checks.ts
 * itself is not modified.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-nyc-phase3-proof.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  fetchEphemeralArticle,
  type EphemeralArticle,
} from "./ephemeral/ephemeralAdapter";
import {
  extractEphemeralClaims,
  buildEphemeralSource,
} from "./ephemeral/ephemeralExtractor";
import {
  fetchOsmBboxIndex,
  groundEphemeralAddress,
  W38_W53_CORRIDOR_BBOX,
  type EphemeralGroundingResult,
} from "./ephemeral/ephemeralGrounding";
import {
  computePlaceKeysBySubjectId,
  canonicalPlaceKeyForSubject,
} from "./combinePabAndBaldwinPark";
import type { Claim, ProposedIdentityType, Source } from "./types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

const outDir = dirname(fileURLToPath(import.meta.url));

// --- Load Phase 1's already-computed LPC artifact for 3 chosen rows ---
const lpcReport = JSON.parse(
  readFileSync(join(outDir, "report-lpc-production-proof.json"), "utf-8"),
);

interface Subject {
  productionSubjectId: string;
  displayName: string;
  lpcPlaceKey: string;
  ephemeral: {
    placeKey: string;
    url: string;
    address: string;
    streetName: string;
    title: string;
    note: string;
  };
}

const SUBJECTS: Subject[] = [
  {
    productionSubjectId: "way/266143344",
    displayName: "New Amsterdam Theatre (214 West 42nd Street)",
    lpcPlaceKey: "lpc-record-row-10",
    ephemeral: {
      placeKey: "eny-new-amsterdam-theatre",
      url: "https://ephemeralnewyork.wordpress.com/2009/05/04/the-most-beautiful-girl-in-new-york-city/",
      address: "214 West 42nd Street",
      streetName: "West 42nd Street",
      title: "New Amsterdam Theatre",
      note: 'Article names the theatre by identity anchor twice ("42nd Street\'s New Amsterdam Theatre", "the New Amsterdam Theater") but never a house number — address supplied externally from LPC\'s own matched Des_Address for the same building, same role as Actors\' Temple in Phase 2. Exercises identity-anchor-only relevance path.',
    },
  },
  {
    productionSubjectId: "way/266149338",
    displayName: "New York Times Building (217-247 West 43rd Street)",
    lpcPlaceKey: "lpc-record-row-8",
    ephemeral: {
      placeKey: "eny-nyt-building",
      url: "https://ephemeralnewyork.wordpress.com/2022/11/14/when-longacre-square-became-times-square/",
      address: "217 West 43rd Street",
      streetName: "West 43rd Street",
      title: "New York Times Building",
      note: "Article's real subject is a 1905 Times Square postcard depicting multiple buildings (also the Hotel Astor, a DIFFERENT building) — a multi-building survey image, unlike Phase 2's single-subject-profile candidates. address is the first housenumber of LPC's own range Des_Address (217-247) — a legitimate entry-point address for the same building, not guessed. Relevance scoping must isolate only the Times-headquarters-naming claim and NOT pull in Hotel Astor content — checked explicitly below.",
    },
  },
  {
    productionSubjectId: "way/265301770",
    displayName: "Fashion Tower (135 West 36th Street)",
    lpcPlaceKey: "lpc-record-row-12",
    ephemeral: {
      placeKey: "eny-fashion-tower",
      url: "https://ephemeralnewyork.wordpress.com/2023/02/06/the-pretty-peacocks-holding-court-in-the-garment-district/",
      address: "135 West 36th Street",
      streetName: "West 36th Street",
      title: "Fashion Tower",
      note: 'Article states the exact address ("135 West 36th Street") and building name ("Fashion Tower") directly in its own body text — exercises the shared extractor\'s address-based relevance path, same as Clinton Court in Phase 2.',
    },
  },
];

function lpcRawClaimsForPlaceKey(placeKey: string): {
  claims: Claim[];
  sourceIds: Set<string>;
} {
  const claims: Claim[] = [];
  const sourceIds = new Set<string>();
  for (const record of lpcReport.artifact.claims) {
    if (record.claim.placeKey === placeKey) {
      claims.push(record.claim as Claim);
      for (const sid of record.claim.sourceIds as string[]) sourceIds.add(sid);
    }
  }
  return { claims, sourceIds };
}

function lpcSourcesForIds(ids: Set<string>): Record<string, Source> {
  // Reconstruct a full Source object per sourceId by unioning every
  // capabilityForClaimType snapshot recorded against that sourceId anywhere
  // in the Phase 1 artifact (mirrors buildEphemeralSource's own pattern of
  // deriving capabilities from claim types actually observed for a source).
  const out: Record<string, Source> = {};
  for (const record of lpcReport.artifact.claims) {
    for (const snap of record.sourceCapabilitySnapshots) {
      if (!ids.has(snap.sourceId)) continue;
      if (!out[snap.sourceId]) {
        out[snap.sourceId] = {
          id: snap.sourceId,
          title: snap.title,
          url: snap.url,
          sourceClass: snap.sourceClass,
          publicationDate: snap.publicationDate,
          capabilities: [],
        };
      }
      if (
        snap.capabilityForClaimType &&
        !out[snap.sourceId].capabilities.some(
          (c) => c.claimType === snap.capabilityForClaimType!.claimType,
        )
      ) {
        out[snap.sourceId].capabilities.push(snap.capabilityForClaimType);
      }
    }
  }
  return out;
}

async function main() {
  console.log(
    "--- Phase 3: bounded NYC production promotion (LPC + Ephemeral combined) ---\n",
  );

  console.log("Fetching OSM bbox index (Overpass) for the corridor...");
  const osmIndex = await fetchOsmBboxIndex(W38_W53_CORRIDOR_BBOX);
  console.log(`OSM bbox index: ${osmIndex.length} addressed elements\n`);

  const allClaims: Claim[] = [];
  const allSources: Record<string, Source> = {};
  const bySubject: Record<
    string,
    {
      lpcClaimIds: string[];
      ephemeralClaimIds: string[];
      ephemeralGrounding: EphemeralGroundingResult;
      ephemeralGroundingAgreesWithLpc: boolean;
      article: EphemeralArticle;
    }
  > = {};

  for (const subject of SUBJECTS) {
    console.log(
      `=== ${subject.displayName} (${subject.productionSubjectId}) ===`,
    );

    // --- LPC side: reuse Phase 1's raw claims verbatim ---
    const { claims: lpcClaims, sourceIds: lpcSourceIds } =
      lpcRawClaimsForPlaceKey(subject.lpcPlaceKey);
    console.log(
      `  LPC claims reused: ${lpcClaims.length} (${lpcClaims.map((c) => c.claimType).join(", ")})`,
    );
    allClaims.push(...lpcClaims);
    Object.assign(allSources, lpcSourcesForIds(lpcSourceIds));

    // --- Ephemeral side: fresh extraction ---
    const ec = subject.ephemeral;
    console.log(`  Fetching Ephemeral article: ${ec.url}`);
    const article = await fetchEphemeralArticle(ec.url);
    console.log(
      `    title: "${article.title}" | publishedAt: ${article.publishedAt}`,
    );

    const grounding = groundEphemeralAddress(ec.address, osmIndex);
    const agrees = grounding.osmElementId === subject.productionSubjectId;
    console.log(
      `    Ephemeral's OWN independent grounding: category=${grounding.category} confidence=${grounding.confidence} osmElementId=${grounding.osmElementId ?? "(none)"} | agrees with LPC's ${subject.productionSubjectId}: ${agrees}`,
    );

    const ephemeralClaims = extractEphemeralClaims({
      article,
      placeKey: ec.placeKey,
      address: ec.address,
      streetName: ec.streetName,
      title: ec.title,
      proposedIdentityType: "current-osm-entity",
    });
    // Anchor to the SAME production identity LPC already established for
    // this physical building — the combined-evidence point of this proof.
    // Never derived from placeKey/address-similarity; explicitly the
    // already-deterministically-grounded id for this subject.
    for (const claim of ephemeralClaims) {
      claim.productionSubjectId = subject.productionSubjectId;
      claim.locationHints =
        [grounding.matchedIdentifier, grounding.matchingSignal]
          .filter(Boolean)
          .join(" — ") || claim.locationHints;
    }
    console.log(
      `    Ephemeral claims extracted: ${ephemeralClaims.length} (${[...new Set(ephemeralClaims.map((c) => c.claimType))].join(", ") || "none"})`,
    );
    for (const c of ephemeralClaims) {
      console.log(
        `      [${c.claimType}] "${c.claimText.slice(0, 140)}${c.claimText.length > 140 ? "..." : ""}"`,
      );
    }

    const ephemeralSource = buildEphemeralSource(article, ephemeralClaims);
    allSources[ephemeralSource.id] = ephemeralSource;
    allClaims.push(...ephemeralClaims);

    bySubject[subject.productionSubjectId] = {
      lpcClaimIds: lpcClaims.map((c) => c.id),
      ephemeralClaimIds: ephemeralClaims.map((c) => c.id),
      ephemeralGrounding: grounding,
      ephemeralGroundingAgreesWithLpc: agrees,
      article,
    };
    console.log();
  }

  // --- Canonicalize cross-source placeKeys per shared productionSubjectId ---
  // Reuses the exact source-agnostic canonicalization proven in
  // combinePabAndBaldwinPark.ts: any claim whose productionSubjectId is
  // shared by more than one source-native placeKey is reattributed to a
  // single synthetic `subject:${productionSubjectId}` key. This is a claim/
  // cross-source join key reassignment only — subjectId is still derived
  // solely from productionSubjectId in artifact.ts, never from placeKey.
  const placeKeysBySubjectId = computePlaceKeysBySubjectId(
    SUBJECTS.flatMap((s) => [
      {
        placeKey: s.lpcPlaceKey,
        grounding: { osmElementId: s.productionSubjectId },
      },
      {
        placeKey: s.ephemeral.placeKey,
        grounding: { osmElementId: s.productionSubjectId },
      },
    ]),
  );
  for (const claim of allClaims) {
    claim.placeKey = canonicalPlaceKeyForSubject(
      placeKeysBySubjectId,
      claim.productionSubjectId,
      claim.placeKey,
    );
  }

  const generatedAt = new Date().toISOString();
  const artifact: GeneratedEvidenceArtifact = generateArtifact(
    allClaims,
    allSources,
    {
      generatedAt,
    },
  );
  const projection = projectRuntimeCompat(artifact);
  const gated = applyDiscoveryWorthinessGate(projection, artifact);

  console.log("--- Combined artifact decision totals ---");
  console.log(
    `  total claims: ${artifact.summary.totalClaims} | AUTO-ADMIT: ${artifact.summary.byDecision["AUTO-ADMIT"]} | HOLD: ${artifact.summary.byDecision.HOLD} | SUPPRESS: ${artifact.summary.byDecision.SUPPRESS}`,
  );
  console.log(`  distinct subjectIds: ${artifact.summary.subjectCount}`);
  console.log(
    `  integrityViolations: ${artifact.summary.integrityViolations.length}`,
  );
  if (artifact.summary.integrityViolations.length > 0)
    console.log(
      `    !! ${artifact.summary.integrityViolations.join("\n    !! ")}`,
    );
  console.log();

  // --- Per-subject breakdown: decisions, provenance separation, worthiness ---
  for (const subject of SUBJECTS) {
    const sid = subject.productionSubjectId;
    const records = artifact.claims.filter((r) => r.subjectId === sid);
    const bySource: Record<string, typeof records> = {};
    for (const r of records) {
      // NOTE: placeKey is now canonicalized per shared productionSubjectId
      // (see above) and can no longer be used to distinguish LPC from
      // Ephemeral claims here — use each source's own id-prefix instead
      // (same pattern as run-pab-baldwinpark-production-proof.ts's
      // isPabSourceId/isBpSourceId).
      const isLpc = r.claim.sourceIds.some((id) => id.startsWith("lpc-"));
      const key = isLpc ? "LPC" : "Ephemeral";
      (bySource[key] ??= []).push(r);
    }
    console.log(`--- ${subject.displayName} (${sid}) ---`);
    console.log(
      `  LPC claims: ${bySource.LPC?.length ?? 0}, decisions: ${bySource.LPC?.map((r) => r.decision.decision).join(",")}`,
    );
    console.log(
      `  Ephemeral claims: ${bySource.Ephemeral?.length ?? 0}, decisions: ${bySource.Ephemeral?.map((r) => r.decision.decision).join(",")}`,
    );
    console.log(`  passes worthiness gate: ${sid in gated.entries}`);
    console.log(`  in final projection.entries: ${sid in projection.entries}`);
    console.log();
  }

  console.log(
    "--- Temporal-consistency check outcomes (construction-date claims) ---",
  );
  for (const r of artifact.claims) {
    if (r.claim.claimType !== "construction-date") continue;
    const tc = r.checks.find((c) => c.checkId === "temporal-consistency");
    console.log(
      `  ${r.claimId} [${r.decision.decision}]: ${tc?.outcome} — ${tc?.reason}`,
    );
  }
  console.log();

  // --- Collision / integrity checks (same battery as Phase 1/2) ---
  const projectedSubjectIds = Object.keys(projection.entries);
  const OSM_ID_PATTERN = /^(node|way|relation)\/\d+$/;
  const malformedSubjectIds = projectedSubjectIds.filter(
    (id) => !OSM_ID_PATTERN.test(id),
  );
  const claimIdToDecision = new Map(
    artifact.claims.map((r) => [r.claimId, r.decision.decision]),
  );
  const leakedNonAdmit: string[] = [];
  for (const [subjectId, claimIds] of Object.entries(
    projection.compositionMap,
  )) {
    for (const claimId of claimIds) {
      const decision = claimIdToDecision.get(claimId);
      if (decision !== "AUTO-ADMIT")
        leakedNonAdmit.push(`${subjectId}/${claimId} (${decision})`);
    }
  }
  console.log("--- Integrity checks ---");
  console.log(`  malformed subjectIds: ${malformedSubjectIds.length}`);
  console.log(
    `  HOLD/SUPPRESS leakage into projection: ${leakedNonAdmit.length}`,
  );
  console.log(
    `  worthiness gate: PASS ${Object.keys(gated.entries).length} / rejected ${gated.rejectedForWorthiness.length}`,
  );
  console.log();

  writeFileSync(
    join(outDir, "report-nyc-phase3-proof.json"),
    JSON.stringify(
      {
        corridorBbox: W38_W53_CORRIDOR_BBOX,
        subjects: SUBJECTS,
        osmIndexSize: osmIndex.length,
        bySubject,
        artifactSummary: artifact.summary,
        projectedSubjectCount: projectedSubjectIds.length,
        malformedSubjectIds,
        leakedNonAdmit,
        worthinessGateSummary: {
          passed: Object.keys(gated.entries),
          rejected: gated.rejectedForWorthiness,
        },
        artifact,
        projection,
        gated,
      },
      null,
      2,
    ),
  );
  console.log(
    `Full structured output written to ${join(outDir, "report-nyc-phase3-proof.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
