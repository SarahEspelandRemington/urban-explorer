/**
 * cacheVersionConsistencyLib.test.ts
 *
 * Focused tests for the cache-version consistency guard's extraction and
 * comparison logic. Run via `pnpm run test:cache-version-consistency` (also
 * wired into the root `pnpm run lint` chain -- see package.json) using
 * Node's built-in test runner through tsx.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parseRegistry,
  scanRuntimeLiteralPrefixes,
  scanModeKeyVersions,
  checkConsistency,
} from "./cacheVersionConsistencyLib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

const MODE_KEY_PREFIXES = ["quick", "full"] as const;
const EXEMPT_RUNTIME_PREFIXES = { wiki: "test fixture exemption" };

// A minimal but representative fixture standing in for the real
// cacheVersions.ts / index.ts shapes, so tests don't depend on the current
// content of the real files (those are covered separately, against main).
const FIXTURE_REGISTRY_SOURCE = `
export const LLM_CACHE_CURRENT_VERSIONS: ReadonlyArray<
  [prefix: string, currentVersion: string | ReadonlyArray<string>]
> = [
  ["quick", ["v63", "v76"]], // discover — quick mode
  ["full", ["v63", "v76"]], // discover — full mode
  ["geocode", "v4"], // geocode
  ["suggest", "v12"], // location suggestions
  ["suggest404", "v5"], // address-not-found suggestions
  ["narration", "v20"], // walk narration
];

export const OSM_CACHE_VERSION = "v43";
`;

const FIXTURE_ROUTE_SOURCE = `
function osmSuggestionsBucketKey(lat, lng) {
  return \`osm:\${OSM_CACHE_VERSION}:\${lat},\${lng}\`;
}

const geocodeCacheKey = \`geocode:v4:\${query}\`;
const suggestCacheKey = \`suggest:v12:\${query}\`;
const suggestionCacheKey = \`suggest404:v5:\${address}\`;
const narrationCacheKey = \`narration:v20:\${placeName}\`;

const modeKey = isQuick ? "quick" : "full";
const discoverCacheKey = osmAnchor
  ? \`\${modeKey}:v76:\${searchRadius}\`
  : \`\${modeKey}:v63:\${searchRadius}\`;

const wikiCacheKey = \`wiki:v4:en:\${title}\`;
`;

function runFixtureCheck(registrySource: string, routeSource: string) {
  return checkConsistency({
    registrySource,
    routeSource,
    modeKeyPrefixes: MODE_KEY_PREFIXES,
    exemptRuntimePrefixes: EXEMPT_RUNTIME_PREFIXES,
  });
}

// --- parseRegistry -----------------------------------------------------

test("parseRegistry: extracts single- and multi-version tuples", () => {
  const { entries, osmConstantReferenced } = parseRegistry(
    FIXTURE_REGISTRY_SOURCE,
  );
  assert.deepEqual(entries.get("quick"), ["v63", "v76"]);
  assert.deepEqual(entries.get("full"), ["v63", "v76"]);
  assert.deepEqual(entries.get("geocode"), ["v4"]);
  assert.equal(osmConstantReferenced, true);
});

// --- scanRuntimeLiteralPrefixes -----------------------------------------

test("scanRuntimeLiteralPrefixes: does not confuse suggest with suggest404", () => {
  const found = scanRuntimeLiteralPrefixes(FIXTURE_ROUTE_SOURCE);
  assert.deepEqual([...(found.get("suggest") ?? [])], ["v12"]);
  assert.deepEqual([...(found.get("suggest404") ?? [])], ["v5"]);
});

test("scanRuntimeLiteralPrefixes: does not falsely flag the OSM_CACHE_VERSION direct-reference pattern as a literal prefix", () => {
  const found = scanRuntimeLiteralPrefixes(FIXTURE_ROUTE_SOURCE);
  assert.equal(found.has("osm"), false);
});

// --- scanModeKeyVersions -------------------------------------------------

test("scanModeKeyVersions: finds both quick/full dynamic-prefix versions", () => {
  const versions = scanModeKeyVersions(FIXTURE_ROUTE_SOURCE);
  assert.deepEqual([...versions].sort(), ["v63", "v76"]);
});

// --- checkConsistency: full pipeline --------------------------------------

test("checkConsistency: passes on a consistent fixture (mirrors current main)", () => {
  const problems = runFixtureCheck(
    FIXTURE_REGISTRY_SOURCE,
    FIXTURE_ROUTE_SOURCE,
  );
  assert.deepEqual(problems, []);
});

test("checkConsistency: fails when a runtime version drifts from the registry (e.g. narration bumped at the call site only)", () => {
  const driftedRoute = FIXTURE_ROUTE_SOURCE.replace(
    "narration:v20:",
    "narration:v21:",
  );
  const problems = runFixtureCheck(FIXTURE_REGISTRY_SOURCE, driftedRoute);
  assert.equal(
    problems.some(
      (p) =>
        p.kind === "runtime-version-not-allowed" &&
        p.message.includes('"narration"') &&
        p.message.includes("v21"),
    ),
    true,
  );
});

test("checkConsistency: fails when the registry lags a bumped runtime version (e.g. registry stuck at old geocode version)", () => {
  const staleRegistry = FIXTURE_REGISTRY_SOURCE.replace(
    '["geocode", "v4"]',
    '["geocode", "v3"]',
  );
  const problems = runFixtureCheck(staleRegistry, FIXTURE_ROUTE_SOURCE);
  assert.equal(
    problems.some(
      (p) =>
        p.kind === "runtime-version-not-allowed" &&
        p.message.includes('"geocode"'),
    ),
    true,
  );
});

test("checkConsistency: accepts both quick/full v63 and v76 as currently allowed", () => {
  const problems = runFixtureCheck(
    FIXTURE_REGISTRY_SOURCE,
    FIXTURE_ROUTE_SOURCE,
  );
  assert.equal(
    problems.some(
      (p) => p.message.includes('"quick"') || p.message.includes('"full"'),
    ),
    false,
  );
});

test("checkConsistency: rejects an unregistered quick/full version", () => {
  const unexpectedVersionRoute = FIXTURE_ROUTE_SOURCE.replace(
    "${modeKey}:v76:",
    "${modeKey}:v99:",
  );
  const problems = runFixtureCheck(
    FIXTURE_REGISTRY_SOURCE,
    unexpectedVersionRoute,
  );
  assert.equal(
    problems.some(
      (p) =>
        p.kind === "runtime-version-not-allowed" &&
        (p.message.includes('"quick"') || p.message.includes('"full"')) &&
        p.message.includes("v99"),
    ),
    true,
  );
});

test("checkConsistency: flags a runtime prefix with no registry entry at all (not the wiki exemption)", () => {
  const newUntrackedPrefixRoute =
    FIXTURE_ROUTE_SOURCE + "\nconst detailCacheKey = `detail:v10:${x}`;\n";
  const problems = runFixtureCheck(
    FIXTURE_REGISTRY_SOURCE,
    newUntrackedPrefixRoute,
  );
  assert.equal(
    problems.some(
      (p) =>
        p.kind === "runtime-prefix-missing-from-registry" &&
        p.message.includes('"detail"'),
    ),
    true,
  );
});

test("checkConsistency: does not flag the explicitly exempted wiki prefix", () => {
  const problems = runFixtureCheck(
    FIXTURE_REGISTRY_SOURCE,
    FIXTURE_ROUTE_SOURCE,
  );
  assert.equal(
    problems.some((p) => p.message.includes('"wiki"')),
    false,
  );
});

test("checkConsistency: flags a registry prefix with no corresponding runtime consumer", () => {
  const orphanedRegistry = FIXTURE_REGISTRY_SOURCE.replace(
    '["narration", "v20"], // walk narration',
    '["narration", "v20"], // walk narration\n  ["orphan-prefix", "v1"], // no runtime consumer',
  );
  const problems = runFixtureCheck(orphanedRegistry, FIXTURE_ROUTE_SOURCE);
  assert.equal(
    problems.some(
      (p) =>
        p.kind === "registry-prefix-missing-runtime-consumer" &&
        p.message.includes('"orphan-prefix"'),
    ),
    true,
  );
});

test("checkConsistency: flags a missing OSM_CACHE_VERSION reference", () => {
  const noOsmRoute = FIXTURE_ROUTE_SOURCE.replace(
    "osm:${OSM_CACHE_VERSION}:",
    "osm:hardcoded:",
  );
  const problems = runFixtureCheck(FIXTURE_REGISTRY_SOURCE, noOsmRoute);
  assert.equal(
    problems.some((p) => p.kind === "osm-constant-not-referenced"),
    true,
  );
});

// --- Self-test against the real repo state (main) -------------------------

test("checkConsistency: passes against the real cacheVersions.ts / index.ts on current main", () => {
  const registrySource = readFileSync(
    resolve(REPO_ROOT, "artifacts/api-server/src/lib/cacheVersions.ts"),
    "utf8",
  );
  const routeSource = readFileSync(
    resolve(REPO_ROOT, "artifacts/api-server/src/routes/explore/index.ts"),
    "utf8",
  );
  const problems = checkConsistency({
    registrySource,
    routeSource,
    modeKeyPrefixes: MODE_KEY_PREFIXES,
    exemptRuntimePrefixes: { wiki: "separate in-memory Map cache" },
  });
  assert.deepEqual(problems, []);
});
