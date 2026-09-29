/**
 * Hidden City retrieval + place-matching report. Offline/non-production,
 * experimental — see README.md. Task F: retrieval and place matching only,
 * no claim extraction, no trust/classification changes.
 *
 * Loads the cached Hidden City article corpus (hiddencity-pages.json,
 * produced by fetch-hiddencity-pages.ts) and the existing grounded PAB place
 * set (report-cross-source-enrichment.json's placeResultsSummary), runs
 * citywide address-mention extraction across the full corpus, restricts
 * place-matching to the Spring Garden 1700-2299 corridor, and writes a
 * structured report to report-hiddencity-matching.json.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-hiddencity-matching.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  extractAddressMentions,
  type HiddenCityArticle,
} from "./hiddencity/hiddenCityAdapter";
import {
  matchHiddenCityArticleToPlaces,
  type GroundedPlace,
  type HiddenCityPlaceMatch,
} from "./hiddencity/hiddenCityMatcher";

const outDir = dirname(fileURLToPath(import.meta.url));

const NAMED_GAPS: Record<string, string> = {
  "1700": "Carnegie / 1700",
  "1701-1707": "Local Union 98 / 1701-1707",
  "1800": "1800 Spring Garden",
  "2133-2135": "Polonia / 2133-2135",
};

function houseNumberOf(address: string): string {
  const m = address.match(/^(\d[\d-]*)/);
  return m ? m[1] : address;
}

function main() {
  const articles: HiddenCityArticle[] = JSON.parse(
    readFileSync(join(outDir, "hiddencity-pages.json"), "utf8"),
  );
  const crossSourceReport = JSON.parse(
    readFileSync(join(outDir, "report-cross-source-enrichment.json"), "utf8"),
  );
  const allPlaces: GroundedPlace[] = crossSourceReport.placeResultsSummary;
  const corridorPlaces = allPlaces.filter((p) => {
    const n = parseInt(houseNumberOf(p.address), 10);
    return n >= 1700 && n <= 2299;
  });

  console.log(`Total Hidden City articles: ${articles.length}`);
  console.log(
    `Grounded PAB places (all): ${allPlaces.length}, in Spring Garden 1700-2299 corridor: ${corridorPlaces.length}`,
  );

  // Citywide address-mention extraction pass (item 2: articles with usable Philadelphia place/address references).
  const articlesWithMentions = articles
    .map((a) => ({ article: a, mentions: extractAddressMentions(a.bodyText) }))
    .filter((x) => x.mentions.length > 0);
  console.log(
    `Articles with >=1 extracted Philadelphia address mention: ${articlesWithMentions.length}`,
  );

  // Corridor candidate pages: articles mentioning ANY Spring Garden address in the 1700-2299 range (item 3).
  const corridorCandidateArticles = articlesWithMentions.filter((x) =>
    x.mentions.some((m) => {
      if (!/spring\s+garden/i.test(m.streetName)) return false;
      const n = parseInt(m.houseNumber, 10);
      return n >= 1700 && n <= 2299;
    }),
  );
  console.log(
    `Corridor candidate articles (mention a Spring Garden 1700-2299 address): ${corridorCandidateArticles.length}`,
  );

  // Place matching, corridor only.
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
      const gapLabel = NAMED_GAPS[houseNumberOf(place.address)] ?? null;
      return {
        placeKey,
        address: place.address,
        title: place.title,
        proposedIdentityType: place.proposedIdentityType,
        namedGap: gapLabel,
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

  const gapCoverage = Object.entries(NAMED_GAPS).map(([houseNo, label]) => {
    const place = corridorPlaces.find(
      (p) => houseNumberOf(p.address) === houseNo,
    );
    const matches = place ? (matchesByPlace.get(place.placeKey) ?? []) : [];
    return {
      gap: label,
      houseNumber: houseNo,
      groundedPabRecordExists: Boolean(place),
      placeKey: place?.placeKey ?? null,
      strongMatchCount: matches.filter((m) => m.evidenceTier === "strong")
        .length,
      weakMatchCount: matches.filter(
        (m) => m.evidenceTier === "weak-incidental",
      ).length,
    };
  });

  const rejectedIncidentalSummary = weakMatches.map((m) => ({
    placeKey: m.place.placeKey,
    address: m.place.address,
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
    totalArticlesEnumerated: articles.length,
    articlesWithUsableAddressMentions: articlesWithMentions.length,
    corridorCandidateArticleCount: corridorCandidateArticles.length,
    corridorPlaceCount: corridorPlaces.length,
    confidentlyMatchedCorridorPlaces: confidentlyMatchedPlaces,
    namedGapCoverage: gapCoverage,
    rejectedIncidentalMatches: rejectedIncidentalSummary,
    totalStrongMatches: strongMatches.length,
    totalWeakIncidentalMatches: weakMatches.length,
  };

  writeFileSync(
    join(outDir, "report-hiddencity-matching.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Confidently matched corridor places: ${confidentlyMatchedPlaces.length}`,
  );
  console.log(`Written to ${join(outDir, "report-hiddencity-matching.json")}`);
}

main();
