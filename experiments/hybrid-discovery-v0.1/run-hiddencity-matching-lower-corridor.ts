/**
 * Hidden City retrieval + place-matching report — geography correction.
 * Offline/non-production, experimental — see README.md.
 *
 * Same pipeline as run-hiddencity-matching.ts, retargeted to the Spring
 * Garden Street 400-1200 corridor, where the completed Hidden City crawl
 * shows materially denser coverage than the original 1700-2299 test
 * corridor (see report-hiddencity-matching.json's manual corpus review).
 *
 * This is a geography correction, not a matcher redesign:
 * - The grounded place set is built via the FROZEN, unmodified PAB
 *   source-native retrieval/grounding path (pabAdapter.ts's
 *   retrievePabCorridor, pabInterpreter.ts's classifyPabRecord,
 *   pabGrounding.ts's fetchOsmStreetIndex/groundPabRecord) — no manually
 *   seeded places.
 * - The Hidden City corpus is the existing cached crawl
 *   (hiddencity-pages.json, produced by fetch-hiddencity-pages.ts — not
 *   re-fetched here).
 * - hiddenCityAdapter.ts's extractAddressMentions and
 *   hiddenCityMatcher.ts's matchHiddenCityArticleToPlaces are imported and
 *   used completely unchanged.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-hiddencity-matching-lower-corridor.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { retrievePabCorridor, type PabRetrievalRecord } from "./pab/pabAdapter";
import {
  classifyPabRecord,
  type PabInterpretedRecord,
} from "./pab/pabInterpreter";
import { fetchOsmStreetIndex, groundPabRecord } from "./pab/pabGrounding";
import {
  extractAddressMentions,
  type HiddenCityArticle,
} from "./hiddencity/hiddenCityAdapter";
import {
  matchHiddenCityArticleToPlaces,
  type GroundedPlace,
  type HiddenCityPlaceMatch,
} from "./hiddencity/hiddenCityMatcher";

const CORRIDOR_LOWER = 400;
const CORRIDOR_UPPER = 1200;
const outDir = dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function primaryAddress(record: PabRetrievalRecord): string {
  return record.matchedCorridorAddresses[0] ?? record.addressBlock[0] ?? "";
}

function houseNumberOf(address: string): string {
  const m = address.match(/^(\d[\d-]*)/);
  return m ? m[1] : address;
}

/** Orchestration-level retry around the FROZEN, unmodified retrievePabCorridor call — same pattern already used by run-cross-source-enrichment.ts for PAB's occasional Cloudflare 524 timeouts. Not a change to pabAdapter.ts's own logic. */
async function retrievePabCorridorWithRetry(
  input: Parameters<typeof retrievePabCorridor>[0],
  attempts = 5,
): Promise<Awaited<ReturnType<typeof retrievePabCorridor>>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await retrievePabCorridor(input);
    } catch (err) {
      if (attempt >= attempts) throw err;
      console.error(
        `  retrievePabCorridor attempt ${attempt} failed (${(err as Error).message.slice(0, 80)}...), retrying in ${attempt * 5}s`,
      );
      await sleep(attempt * 5000);
    }
  }
}

async function buildGroundedPlaces(): Promise<GroundedPlace[]> {
  const adapterResult = await retrievePabCorridorWithRetry({
    street: "Spring Garden St",
    city: "Philadelphia",
    lowerBound: CORRIDOR_LOWER,
    upperBound: CORRIDOR_UPPER,
  });
  console.log(
    `Retrieved ${adapterResult.totalRetrieved} total PAB records; ${adapterResult.records.length} corridor-filtered (${CORRIDOR_LOWER}-${CORRIDOR_UPPER})`,
  );

  const interpreted: PabInterpretedRecord[] = [];
  for (const record of adapterResult.records) {
    interpreted.push(await classifyPabRecord(record));
    await sleep(120);
  }
  const claimBearing = interpreted.filter(
    (r) => r.classification === "claim-bearing",
  );
  console.log(`claim-bearing records: ${claimBearing.length}`);

  console.log(
    "Fetching OSM street index for Spring Garden St, Philadelphia (Overpass)...",
  );
  const osmIndex = await fetchOsmStreetIndex("Spring Garden", "Philadelphia");
  console.log(`OSM street index: ${osmIndex.length} elements\n`);

  const places: GroundedPlace[] = [];
  for (const interpretedRecord of claimBearing) {
    const record = adapterResult.records.find(
      (r) => r.pabId === interpretedRecord.pabId,
    )!;
    const grounding = groundPabRecord(record, interpretedRecord, osmIndex);
    places.push({
      placeKey: `pab-record-${record.pabId}`,
      address: primaryAddress(record),
      title: interpretedRecord.title,
      proposedIdentityType: grounding.proposedIdentityType,
    });
  }
  return places;
}

async function main() {
  const corridorPlaces = await buildGroundedPlaces();
  console.log(
    `Grounded PAB places in ${CORRIDOR_LOWER}-${CORRIDOR_UPPER} corridor: ${corridorPlaces.length}\n`,
  );

  const articles: HiddenCityArticle[] = JSON.parse(
    readFileSync(join(outDir, "hiddencity-pages.json"), "utf8"),
  );
  console.log(`Loaded ${articles.length} cached Hidden City articles`);

  const articlesWithMentions = articles
    .map((a) => ({ article: a, mentions: extractAddressMentions(a.bodyText) }))
    .filter((x) => x.mentions.length > 0);

  const corridorCandidateArticles = articlesWithMentions.filter((x) =>
    x.mentions.some((m) => {
      if (!/spring\s+garden/i.test(m.streetName)) return false;
      const n = parseInt(m.houseNumber, 10);
      return n >= CORRIDOR_LOWER && n <= CORRIDOR_UPPER;
    }),
  );
  console.log(
    `Corridor candidate articles (mention a Spring Garden ${CORRIDOR_LOWER}-${CORRIDOR_UPPER} address): ${corridorCandidateArticles.length}`,
  );

  const allMatches: HiddenCityPlaceMatch[] = [];
  for (const { article } of corridorCandidateArticles) {
    allMatches.push(...matchHiddenCityArticleToPlaces(article, corridorPlaces));
  }

  const strongMatches = allMatches.filter((m) => m.evidenceTier === "strong");
  const weakMatches = allMatches.filter(
    (m) => m.evidenceTier === "weak-incidental",
  );

  const matchesByPlace = new Map<string, HiddenCityPlaceMatch[]>();
  for (const m of allMatches) {
    const list = matchesByPlace.get(m.place.placeKey) ?? [];
    list.push(m);
    matchesByPlace.set(m.place.placeKey, list);
  }

  const confidentlyMatchedPlaces = [...matchesByPlace.entries()]
    .filter(([, matches]) => matches.some((m) => m.evidenceTier === "strong"))
    .map(([placeKey, matches]) => {
      const place = matches[0].place;
      return {
        placeKey,
        address: place.address,
        title: place.title,
        proposedIdentityType: place.proposedIdentityType,
        strongMatchCount: matches.filter((m) => m.evidenceTier === "strong")
          .length,
        weakMatchCount: matches.filter(
          (m) => m.evidenceTier === "weak-incidental",
        ).length,
        strongMatches: matches
          .filter((m) => m.evidenceTier === "strong")
          .map((m) => ({
            articleUrl: m.article.url,
            articleTitle: m.article.title,
            publishedAt: m.article.publishedAt,
            author: m.article.author,
            mentionCount: m.mentionCount,
            isMaxMentionedAddress: m.isMaxMentionedAddress,
            distinctSpringGardenAddressCount:
              m.distinctSpringGardenAddressCount,
            titleNamesPlace: m.titleNamesPlace,
          })),
      };
    });

  const rejectedIncidentalSummary = weakMatches.map((m) => ({
    placeKey: m.place.placeKey,
    address: m.place.address,
    title: m.place.title,
    articleUrl: m.article.url,
    articleTitle: m.article.title,
    mentionCount: m.mentionCount,
    isMaxMentionedAddress: m.isMaxMentionedAddress,
    distinctSpringGardenAddressCount: m.distinctSpringGardenAddressCount,
    reasonRejected:
      m.distinctSpringGardenAddressCount > 1 && !m.isMaxMentionedAddress
        ? "not the most-mentioned Spring Garden address in a multi-address article"
        : "single incidental mention, article title does not name this place",
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    corridor: `Spring Garden St ${CORRIDOR_LOWER}-${CORRIDOR_UPPER}`,
    groundedPabPlaceCount: corridorPlaces.length,
    groundedPlaces: corridorPlaces,
    totalArticlesEnumerated: articles.length,
    corridorCandidateArticleCount: corridorCandidateArticles.length,
    confidentlyMatchedCorridorPlaces: confidentlyMatchedPlaces,
    rejectedIncidentalMatches: rejectedIncidentalSummary,
    totalStrongMatches: strongMatches.length,
    totalWeakIncidentalMatches: weakMatches.length,
  };

  writeFileSync(
    join(outDir, "report-hiddencity-matching-lower-corridor.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(`\nGrounded PAB places: ${corridorPlaces.length}`);
  console.log(
    `Corridor candidate articles: ${corridorCandidateArticles.length}`,
  );
  console.log(`Confidently matched places: ${confidentlyMatchedPlaces.length}`);
  console.log(
    `Written to ${join(outDir, "report-hiddencity-matching-lower-corridor.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
