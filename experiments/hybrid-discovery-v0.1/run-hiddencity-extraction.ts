/**
 * Hidden City claim-extraction pilot — Spring Garden 400-1200, 3 confidently
 * matched places. Offline/non-production, experimental — see README.md.
 *
 * FROZEN inputs: report-hiddencity-matching-lower-corridor.json (grounded
 * places + confidently matched articles) and hiddencity-pages.json (cached
 * article bodies). FROZEN downstream harness: pipeline.ts/checks.ts/
 * grounding.ts/decide.ts/editorial.ts. Only new code is the orchestration
 * below, which calls extractHiddenCityClaims/buildHiddenCitySource once per
 * (place, article) pair from the matching report.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-hiddencity-extraction.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Claim, Source } from "./types";
import { runPipeline } from "./pipeline";
import {
  extractHiddenCityClaims,
  buildHiddenCitySource,
} from "./hiddencity/hiddenCityExtractor";
import type { HiddenCityArticle } from "./hiddencity/hiddenCityAdapter";

const outDir = dirname(fileURLToPath(import.meta.url));

interface MatchingReport {
  confidentlyMatchedCorridorPlaces: Array<{
    placeKey: string;
    address: string;
    title: string;
    proposedIdentityType:
      | "current-osm-entity"
      | "unnamed-current-building"
      | "current-building-former-use"
      | "former-site"
      | "unresolved";
    strongMatches: Array<{ articleUrl: string }>;
  }>;
}

function main() {
  const report: MatchingReport = JSON.parse(
    readFileSync(
      join(outDir, "report-hiddencity-matching-lower-corridor.json"),
      "utf8",
    ),
  );
  const articles: HiddenCityArticle[] = JSON.parse(
    readFileSync(join(outDir, "hiddencity-pages.json"), "utf8"),
  );
  const articleByUrl = new Map(articles.map((a) => [a.url, a]));

  const claims: Claim[] = [];
  const sources: Record<string, Source> = {};
  let articlesProcessed = 0;

  for (const place of report.confidentlyMatchedCorridorPlaces) {
    for (const match of place.strongMatches) {
      const article = articleByUrl.get(match.articleUrl);
      if (!article) {
        console.error(`  MISSING article in cache: ${match.articleUrl}`);
        continue;
      }
      articlesProcessed++;
      const placeClaims = extractHiddenCityClaims({
        article,
        placeKey: place.placeKey,
        address: place.address,
        title: place.title,
        proposedIdentityType: place.proposedIdentityType,
      });
      claims.push(...placeClaims);
      const source = buildHiddenCitySource(article, placeClaims);
      sources[source.id] = source;
    }
  }

  console.log(`Articles processed: ${articlesProcessed}`);
  console.log(`Total claims extracted: ${claims.length}\n`);

  const outcomes = runPipeline(claims, sources);

  const byType: Record<string, number> = {};
  for (const c of claims) byType[c.claimType] = (byType[c.claimType] ?? 0) + 1;
  console.log("--- Claims by type ---");
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1]))
    console.log(`  ${t}: ${n}`);

  const admit = outcomes.filter(
    (o) => o.decision.decision === "AUTO-ADMIT",
  ).length;
  const hold = outcomes.filter((o) => o.decision.decision === "HOLD").length;
  const suppress = outcomes.filter(
    (o) => o.decision.decision === "SUPPRESS",
  ).length;
  console.log("\n--- AUTO-ADMIT / HOLD / SUPPRESS totals ---");
  console.log(
    `  AUTO-ADMIT: ${admit} | HOLD: ${hold} | SUPPRESS: ${suppress} (total ${outcomes.length})`,
  );

  console.log("\n--- Medium/high editorial-value claims by place ---");
  const byPlace = new Map<string, typeof outcomes>();
  for (const o of outcomes) {
    if (
      o.decision.editorialQuality !== "medium" &&
      o.decision.editorialQuality !== "high"
    )
      continue;
    const list = byPlace.get(o.claim.placeKey) ?? [];
    list.push(o);
    byPlace.set(o.claim.placeKey, list);
  }
  for (const [placeKey, list] of byPlace) {
    console.log(`  ${placeKey} (${list[0].claim.address}): ${list.length}`);
  }

  console.log("\n--- All outcomes (full detail for inspection) ---");
  for (const o of outcomes) {
    console.log(
      `[${o.claim.claimType}/${o.decision.decision}/${o.decision.editorialQuality}] placeKey=${o.claim.placeKey} addr=${o.claim.address}` +
        `\n  span: "${o.claim.supportingSpan}"` +
        `\n  epistemic: ${o.claim.epistemicMarkers?.join(",") ?? "-"} related: ${o.claim.relatedEntities?.join(",") ?? "-"}` +
        `\n  checks: ${o.checks.map((c) => `${c.checkId}:${c.outcome}`).join(", ")}` +
        `\n  grounding: tier=${o.grounding.tier} conf=${o.grounding.confidence}`,
    );
  }

  writeFileSync(
    join(outDir, "report-hiddencity-extraction.json"),
    JSON.stringify(
      {
        articlesProcessed,
        claimCountsByType: byType,
        totals: { admit, hold, suppress },
        outcomes,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nFull structured output written to ${join(outDir, "report-hiddencity-extraction.json")}`,
  );
}

main();
