/**
 * checkCacheVersionConsistency.ts
 *
 * CI / lint guard: verifies that LLM_CACHE_CURRENT_VERSIONS in
 * artifacts/api-server/src/lib/cacheVersions.ts stays in sync with the
 * actual runtime cache-key literals in
 * artifacts/api-server/src/routes/explore/index.ts.
 *
 * See scripts/src/lib/cacheVersionConsistencyLib.ts for the extraction
 * logic, the shapes it understands, and why this guard exists (the B2
 * registry-drift incident).
 *
 * Exits 0 — every runtime cache-key literal is allowed by the registry, and
 *           every registry prefix has a live runtime consumer.
 * Exits 1 — a runtime literal uses a version the registry doesn't allow.
 * Exits 1 — a runtime prefix has no registry entry at all (and isn't in the
 *           explicit exempt list).
 * Exits 1 — a registry prefix has no corresponding runtime consumer.
 * Exits 1 — the OSM_CACHE_VERSION direct-reference pattern appears to have
 *           been removed.
 */

import { readFileSync } from "fs";
import { resolve, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { checkConsistency } from "./lib/cacheVersionConsistencyLib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

const CACHE_VERSIONS_FILE = resolve(
  REPO_ROOT,
  "artifacts/api-server/src/lib/cacheVersions.ts",
);
const EXPLORE_ROUTE_FILE = resolve(
  REPO_ROOT,
  "artifacts/api-server/src/routes/explore/index.ts",
);

const MODE_KEY_PREFIXES = ["quick", "full"] as const;

/**
 * Runtime prefixes that legitimately construct version-tagged cache keys
 * but are NOT tracked in LLM_CACHE_CURRENT_VERSIONS, because they belong to
 * a different cache mechanism than the DB-backed "llm"-namespace apiCache
 * rows that cleanupStaleCacheVersions() sweeps.
 */
const EXEMPT_RUNTIME_PREFIXES: Record<string, string> = {
  wiki: "Wikipedia summary cache is a separate in-memory Map (wikipediaSummaryCache), not part of the apiCache DB table or cleanupStaleCacheVersions(); its version token is tracked by the wiki-summary @prompt-region entry in prompt-manifest.json instead.",
};

function fail(message: string): never {
  console.error(`\n[cache-version-consistency] FAIL\n\n${message}\n`);
  process.exit(1);
}

const registrySource = readFileSync(CACHE_VERSIONS_FILE, "utf8");
const routeSource = readFileSync(EXPLORE_ROUTE_FILE, "utf8");

const problems = checkConsistency({
  registrySource,
  routeSource,
  modeKeyPrefixes: MODE_KEY_PREFIXES,
  exemptRuntimePrefixes: EXEMPT_RUNTIME_PREFIXES,
});

if (problems.length > 0) {
  fail(problems.map((p) => `  • ${p.message}`).join("\n\n"));
}

console.log(
  `[cache-version-consistency] OK — runtime cache-key literals in ` +
    `${relative(REPO_ROOT, EXPLORE_ROUTE_FILE)} match ` +
    `${relative(REPO_ROOT, CACHE_VERSIONS_FILE)}.`,
);
