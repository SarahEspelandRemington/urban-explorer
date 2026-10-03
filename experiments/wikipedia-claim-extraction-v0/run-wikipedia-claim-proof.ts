// Isolated experiment only. Offline proof: real Wikipedia article text ->
// structured Claim -> the existing shared checks/grounding/decide/artifact/
// projector/worthiness pipeline, via the new wikipediaClaimExtractor.ts.
//
// Runs ONLY the minimum existing offline evidence/admission machinery
// (new wikipediaClaimExtractor.ts + production narrativeExtractor/checks/
// grounding/decide/artifact/projector/worthiness, all unmodified) against
// real, already-published Wikipedia article content. Does not hand-author
// claims, does not use synthetic fixtures.
//
// Fetches the real plaintext extract live from en.wikipedia.org using the
// exact same action=query&prop=extracts&explaintext=1 endpoint/params as
// production's fetchWikipediaSummary (routes/explore/index.ts) — not a
// mocked/hand-typed string.
//
// Two real, already-known Streetlit subjects:
//   - Library Hotel (299 Madison Avenue, wikidata=Q6542503, OSM way/265875639
//     — confirmed live via Overpass `way["wikidata"="Q6542503"]` 2026-10-02).
//     No wikipedia= tag in OSM; this is exactly the subject the production
//     wikidata-sitelink fallback (commit 7f5b6dd) already resolves to the
//     real "Library Hotel" article in live copy generation today, via the
//     ungated wikipediaContent path. Primary calibration subject per the
//     Library Hotel source-acquisition inspection.
//   - The Actors' Temple / Congregation Ezrath Israel (339 West 47th Street,
//     wikidata=Q7712319, wikipedia=en:The Actors' Temple, OSM way/265322610
//     — already in GENERATED_LOCAL_HISTORY via a real Ephemeral New York
//     use-history claim). Chosen because its real Wikipedia article's 1917
//     founding / 1923 relocation dates are the exact known case (see
//     deferred-tasks.md) of real Wikipedia content currently bypassing the
//     structured admission model — a second, independent confirmation that
//     the Library Hotel gap is not subject-specific.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  extractWikipediaClaims,
  buildWikipediaSource,
  type WikipediaArticleSummary,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/sources/wikipedia/wikipediaClaimExtractor";
import type {
  Claim,
  Source,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/types";
import { generateArtifact } from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

const outDir = dirname(fileURLToPath(import.meta.url));

async function fetchWikipediaExtract(
  title: string,
): Promise<WikipediaArticleSummary> {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts|pageprops",
    explaintext: "1",
    redirects: "1",
    ppprop: "disambiguation",
    titles: title,
    format: "json",
  });
  const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "streetlit-offline-research/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const raw = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { pageid?: number; title?: string; extract?: string }
      >;
    };
  };
  const page = raw.query?.pages ? Object.values(raw.query.pages)[0] : undefined;
  if (!page || page.pageid === -1 || !page.extract) {
    throw new Error(`No Wikipedia article found for title "${title}"`);
  }
  const canonicalTitle = page.title ?? title;
  return {
    title: canonicalTitle,
    extract: page.extract.trim(),
    lang: "en",
    articleUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(canonicalTitle)}`,
  };
}

interface Subject {
  label: string;
  wikipediaTitle: string;
  placeKey: string;
  address: string;
  streetName: string;
  /** Identity anchor passed to the extractor — see narrativeExtractor's generic-title-word filtering. */
  anchorTitle: string;
  productionSubjectId: string;
}

const SUBJECTS: Subject[] = [
  {
    label: "Library Hotel",
    wikipediaTitle: "Library Hotel",
    placeKey: "wiki-library-hotel",
    address: "299 Madison Avenue",
    streetName: "Madison Avenue",
    anchorTitle: "Library Hotel",
    productionSubjectId: "way/265875639",
  },
  {
    label: "The Actors' Temple",
    wikipediaTitle: "Actors' Temple", // redirects to "The Actors' Temple"
    placeKey: "wiki-actors-temple",
    address: "339 West 47th Street",
    streetName: "West 47th Street",
    anchorTitle: "Actors' Temple",
    productionSubjectId: "way/265322610",
  },
];

async function runSubject(subject: Subject) {
  console.log(`\n--- ${subject.label} ---`);
  const article = await fetchWikipediaExtract(subject.wikipediaTitle);
  console.log(
    `  Fetched real article: "${article.title}" (${article.articleUrl})`,
  );
  console.log(`  Extract length: ${article.extract.length} chars`);

  const claims: Claim[] = extractWikipediaClaims({
    article,
    placeKey: subject.placeKey,
    address: subject.address,
    streetName: subject.streetName,
    title: subject.anchorTitle,
    proposedIdentityType: "current-osm-entity",
  });
  console.log(`  Extracted claims: ${claims.length}`);
  for (const c of claims) {
    console.log(`    [${c.claimType}] ${c.claimText}`);
    if (c.epistemicMarkers?.length)
      console.log(`      epistemicMarkers: ${c.epistemicMarkers.join(", ")}`);
  }

  if (claims.length === 0) {
    console.log("  CONCLUSION: extraction produced zero claims.");
    return { subject, article, claims: [] as Claim[], source: undefined };
  }

  const source: Source = buildWikipediaSource(article, claims);
  for (const claim of claims) {
    claim.sourceIds = [source.id];
    claim.productionSubjectId = subject.productionSubjectId;
  }

  const generatedAt = new Date().toISOString();
  const artifact = generateArtifact(
    claims,
    { [source.id]: source },
    { generatedAt },
  );
  const projection = projectRuntimeCompat(artifact);
  const gated = applyDiscoveryWorthinessGate(projection, artifact);

  console.log("  --- Artifact decision totals ---");
  console.log(
    `  total claims: ${artifact.summary.totalClaims} | AUTO-ADMIT: ${artifact.summary.byDecision["AUTO-ADMIT"]} | HOLD: ${artifact.summary.byDecision.HOLD} | SUPPRESS: ${artifact.summary.byDecision.SUPPRESS}`,
  );
  console.log(
    `  integrityViolations: ${artifact.summary.integrityViolations.length}`,
  );
  for (const v of artifact.summary.integrityViolations)
    console.log(`    ! ${v}`);

  for (const record of artifact.claims) {
    console.log(
      `    [${record.decision.decision}] (${record.claim.claimType}) grounding tier=${record.grounding.tier}/${record.grounding.confidence} factualTrust=${record.decision.factualTrust} :: ${record.decision.reasons.join(" | ")}`,
    );
  }

  const worthiness = gated.worthinessBySubject[subject.productionSubjectId];
  console.log(
    `  subjectId=${subject.productionSubjectId} worthiness=${worthiness ? (worthiness.projectableForDiscovery ? "positive" : "insufficient") : "n/a (no AUTO-ADMIT claim reached projection)"}`,
  );
  if (worthiness) {
    for (const r of worthiness.worthinessReasons)
      console.log(`    reason: ${r}`);
  }

  return {
    subject,
    article,
    claims,
    source,
    artifact,
    projection,
    gated,
    worthiness,
  };
}

async function main() {
  console.log("--- Offline Wikipedia -> structured Claim proof ---");
  const results = [];
  for (const subject of SUBJECTS) {
    results.push(await runSubject(subject));
  }

  const outPath = join(outDir, "report-wikipedia-claim-proof.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nFull structured output written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
