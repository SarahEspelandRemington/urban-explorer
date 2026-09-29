/**
 * One-time fetch of every Hidden City Philadelphia article's structured
 * fields, cached to disk as hiddencity-pages.json. Offline/non-production,
 * experimental. Re-run whenever a fresh crawl is needed; downstream
 * matcher/report scripts read from the cached file rather than re-fetching
 * the live site on every run, purely for local iteration speed (not a
 * production cache).
 *
 * Uses a small concurrency pool rather than Baldwin Park's serial
 * fetch-with-sleep approach — Hidden City's corpus is ~2710 articles vs.
 * Baldwin Park's low dozens, so serial fetching would be impractically slow.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/fetch-hiddencity-pages.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  fetchHiddenCityArticleList,
  fetchHiddenCityArticle,
  type HiddenCityArticle,
} from "./hiddencity/hiddenCityAdapter";

const CONCURRENCY = 12;

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runNext(),
    ),
  );
  return results;
}

async function main() {
  const urls = await fetchHiddenCityArticleList();
  console.log(`Hidden City sitemaps: ${urls.length} article URLs`);

  let fetched = 0;
  let failed = 0;
  const articles: HiddenCityArticle[] = [];
  await runPool(urls, CONCURRENCY, async (url) => {
    try {
      const article = await fetchHiddenCityArticle(url);
      articles.push(article);
    } catch (err) {
      failed += 1;
      console.error(`  failed: ${url}: ${(err as Error).message}`);
    } finally {
      fetched += 1;
      if (fetched % 200 === 0)
        console.log(`  progress: ${fetched}/${urls.length}`);
    }
  });

  console.log(
    `Fetched ${articles.length} of ${urls.length} articles (${failed} failed)`,
  );
  const outDir = dirname(fileURLToPath(import.meta.url));
  writeFileSync(
    join(outDir, "hiddencity-pages.json"),
    JSON.stringify(articles, null, 2),
  );
  console.log(`Written to ${join(outDir, "hiddencity-pages.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
