/**
 * One-time fetch of every Baldwin Park page's plain text, cached to disk as
 * baldwinpark-pages.json. Offline/non-production, experimental. Re-run this
 * whenever a fresh crawl is needed; downstream matcher/extractor scripts
 * read from the cached file rather than re-fetching the live site on every
 * run, purely for local iteration speed (not a production cache).
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/fetch-baldwinpark-pages.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  fetchBaldwinParkPageList,
  fetchBaldwinParkPage,
  type BaldwinParkPage,
} from "./baldwinpark/baldwinParkAdapter";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const urls = await fetchBaldwinParkPageList();
  console.log(`Baldwin Park sitemap: ${urls.length} pages`);

  const pages: BaldwinParkPage[] = [];
  for (const url of urls) {
    try {
      pages.push(await fetchBaldwinParkPage(url));
    } catch (err) {
      console.error(`  failed: ${url}: ${(err as Error).message}`);
    }
    await sleep(80);
  }

  console.log(`Fetched ${pages.length} of ${urls.length} pages`);
  const outDir = dirname(fileURLToPath(import.meta.url));
  writeFileSync(
    join(outDir, "baldwinpark-pages.json"),
    JSON.stringify(pages, null, 2),
  );
  console.log(`Written to ${join(outDir, "baldwinpark-pages.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
