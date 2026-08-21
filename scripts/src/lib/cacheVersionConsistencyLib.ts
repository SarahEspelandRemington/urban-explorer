/**
 * cacheVersionConsistencyLib.ts
 *
 * Shared, pure extraction/comparison logic for the cache-version
 * consistency guard. No file I/O, no top-level executable code — safe to
 * import from both the check script and its tests.
 *
 * ## Why this exists
 *
 * artifacts/api-server/src/lib/cacheVersions.ts::LLM_CACHE_CURRENT_VERSIONS
 * is the registry cleanupStaleCacheVersions() (in routes/explore/index.ts)
 * uses to decide which DB-backed "llm"-namespace cache rows are current vs.
 * stale. If a registry entry drifts from the runtime cache-key literal it's
 * meant to describe, that function silently deletes CURRENT rows on every
 * startup while preserving genuinely obsolete ones — a real incident (see
 * the B2 backlog item) found six such drifted entries at once. This guard
 * is a narrow, mechanical string scan that fails CI if that happens again.
 *
 * ## What this is NOT
 *
 * This is not a TypeScript/AST parser and does not attempt to understand
 * arbitrary cache-key construction. It recognizes exactly the shapes
 * present in the runtime source today:
 *
 *   1. A literal single-version prefix:   `prefix:vN:...`
 *   2. The quick/full dynamic-prefix pair: `${modeKey}:vN:...`
 *      (modeKey is "quick" or "full" at runtime; the version literal found
 *      after it applies to BOTH registry entries, since the version depends
 *      only on which code branch ran (legacy vs. osm-anchor), not on which
 *      mode was selected.)
 *
 * The OSM proximity cache (`osm:${OSM_CACHE_VERSION}:...`) references its
 * version constant directly rather than duplicating it as a literal, so it
 * cannot drift by construction and is intentionally out of scope — this
 * guard only checks that the constant is still referenced (a smoke check
 * that the direct-reference pattern hasn't quietly been replaced with a
 * duplicated literal), not any specific value.
 *
 * If the runtime construction ever grows a genuinely new shape, extend the
 * two scan functions below deliberately — do not reach for a general
 * parser.
 */

export interface RegistryParseResult {
  /** prefix -> currently-allowed version(s), in declaration order */
  entries: Map<string, string[]>;
  /** whether OSM_CACHE_VERSION is still referenced anywhere in the source */
  osmConstantReferenced: boolean;
}

export interface ConsistencyProblem {
  kind:
    | "runtime-version-not-allowed"
    | "runtime-prefix-missing-from-registry"
    | "registry-prefix-missing-runtime-consumer"
    | "osm-constant-not-referenced"
    | "no-mode-key-versions-found"
    | "unparseable-registry";
  message: string;
}

/**
 * Parses the LLM_CACHE_CURRENT_VERSIONS tuple array out of the raw text of
 * cacheVersions.ts. Expects the current
 *   ["prefix", "vN"]   or   ["prefix", ["vN", "vM"]]
 * tuple-array literal shape.
 */
export function parseRegistry(source: string): RegistryParseResult {
  const arrayMatch = source.match(
    /LLM_CACHE_CURRENT_VERSIONS[\s\S]*?=\s*\[([\s\S]*?)\n\];/,
  );
  const entries = new Map<string, string[]>();
  if (!arrayMatch) {
    return { entries, osmConstantReferenced: /OSM_CACHE_VERSION/.test(source) };
  }

  const body = arrayMatch[1];
  const tupleRe = /\[\s*"([\w-]+)"\s*,\s*(\[[^\]]*\]|"[^"]+")\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = tupleRe.exec(body))) {
    const [, prefix, versionPart] = m;
    const versions = versionPart.startsWith("[")
      ? [...versionPart.matchAll(/"([^"]+)"/g)].map((v) => v[1])
      : [versionPart.slice(1, -1)];
    entries.set(prefix, versions);
  }

  return { entries, osmConstantReferenced: /OSM_CACHE_VERSION/.test(source) };
}

/**
 * Scans for literal `prefix:vN:` cache-key construction (shape 1 above).
 * The prefix must appear directly after an opening backtick so that a
 * substring-prefix collision (e.g. "suggest" inside "suggest404") cannot
 * occur: "suggest404:v5:" does not contain the substring "suggest:v", since
 * the character immediately after "suggest" there is "4", not ":".
 */
export function scanRuntimeLiteralPrefixes(
  source: string,
): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const literalRe = /`([a-zA-Z][a-zA-Z0-9-]*):v(\d+):/g;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(source))) {
    const [, prefix, version] = m;
    if (!found.has(prefix)) found.set(prefix, new Set());
    found.get(prefix)!.add(`v${version}`);
  }
  return found;
}

/**
 * Scans for the quick/full dynamic-prefix shape (shape 2 above):
 * `${modeKey}:vN:...`. Returns the set of versions found; the caller is
 * responsible for applying that set to both the "quick" and "full" registry
 * prefixes, since this shape can't distinguish which mode a given call site
 * belongs to (nor does it need to — the version is branch-dependent, not
 * mode-dependent).
 */
export function scanModeKeyVersions(source: string): Set<string> {
  const versions = new Set<string>();
  const re = /\$\{modeKey\}:v(\d+):/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    versions.add(`v${m[1]}`);
  }
  return versions;
}

export interface CheckConsistencyOptions {
  registrySource: string;
  routeSource: string;
  /** dynamic-prefix registry entries whose version set comes from scanModeKeyVersions */
  modeKeyPrefixes: readonly string[];
  /** runtime prefixes intentionally untracked by LLM_CACHE_CURRENT_VERSIONS, with justification */
  exemptRuntimePrefixes: Readonly<Record<string, string>>;
}

/**
 * Runs the full comparison and returns every problem found (empty array
 * means consistent). Pure function — no process.exit, no I/O — so it can be
 * exercised directly in tests.
 */
export function checkConsistency(
  options: CheckConsistencyOptions,
): ConsistencyProblem[] {
  const {
    registrySource,
    routeSource,
    modeKeyPrefixes,
    exemptRuntimePrefixes,
  } = options;
  const problems: ConsistencyProblem[] = [];

  const { entries: registry } = parseRegistry(registrySource);

  if (registry.size === 0) {
    problems.push({
      kind: "unparseable-registry",
      message:
        "Parsed zero entries out of LLM_CACHE_CURRENT_VERSIONS -- the tuple " +
        "regex in cacheVersionConsistencyLib.ts no longer matches the " +
        "file's format. Update the parser deliberately.",
    });
    return problems;
  }

  // The OSM proximity cache references OSM_CACHE_VERSION directly at its
  // construction site in the route file (rather than duplicating the
  // version as a literal there), so check for that reference in
  // routeSource -- registrySource always references the constant since
  // it's declared there, which would make this check vacuous.
  const osmConstantReferenced = /OSM_CACHE_VERSION/.test(routeSource);
  if (!osmConstantReferenced) {
    problems.push({
      kind: "osm-constant-not-referenced",
      message:
        "OSM_CACHE_VERSION is not referenced anywhere in the runtime route " +
        "file -- expected the OSM proximity cache's direct-reference " +
        "exemption (osm:${OSM_CACHE_VERSION}:...) to still hold. If the " +
        "construction changed to a duplicated literal instead, this guard " +
        "needs to be extended to check it explicitly.",
    });
  }

  const literalPrefixes = scanRuntimeLiteralPrefixes(routeSource);
  const modeKeyVersions = scanModeKeyVersions(routeSource);

  if (modeKeyPrefixes.length > 0 && modeKeyVersions.size === 0) {
    problems.push({
      kind: "no-mode-key-versions-found",
      message:
        `Found no \${modeKey}:vN: occurrences in the runtime route file -- ` +
        `expected at least the legacy and osm-anchor discoverCacheKey ` +
        `branches feeding the dynamic-prefix registry entries (${modeKeyPrefixes.join(", ")}). ` +
        `Has this construction been refactored? If so, update ` +
        `scanModeKeyVersions in cacheVersionConsistencyLib.ts.`,
    });
  }

  for (const prefix of modeKeyPrefixes) {
    if (!literalPrefixes.has(prefix)) literalPrefixes.set(prefix, new Set());
    for (const v of modeKeyVersions) literalPrefixes.get(prefix)!.add(v);
  }

  for (const [prefix, versions] of literalPrefixes) {
    if (Object.prototype.hasOwnProperty.call(exemptRuntimePrefixes, prefix)) {
      continue;
    }
    const allowed = registry.get(prefix);
    if (!allowed) {
      problems.push({
        kind: "runtime-prefix-missing-from-registry",
        message:
          `Runtime prefix "${prefix}" (found version(s): ${[...versions].join(", ")}) ` +
          `has no entry in LLM_CACHE_CURRENT_VERSIONS. Either add it to the ` +
          `registry, or if it's intentionally tracked by a different ` +
          `mechanism, add it to the exempt-prefix list with a justification.`,
      });
      continue;
    }
    for (const v of versions) {
      if (!allowed.includes(v)) {
        problems.push({
          kind: "runtime-version-not-allowed",
          message:
            `Runtime prefix "${prefix}" uses version "${v}", which is not ` +
            `listed as a currently-allowed version in LLM_CACHE_CURRENT_VERSIONS ` +
            `(registry allows: ${allowed.join(", ")}). Update ` +
            `LLM_CACHE_CURRENT_VERSIONS to match the runtime literal.`,
        });
      }
    }
  }

  for (const prefix of registry.keys()) {
    if (!literalPrefixes.has(prefix)) {
      problems.push({
        kind: "registry-prefix-missing-runtime-consumer",
        message:
          `Registry prefix "${prefix}" in LLM_CACHE_CURRENT_VERSIONS has no ` +
          `corresponding runtime cache-key literal in the route file. Remove ` +
          `the entry if the cache path was deleted, or investigate why this ` +
          `script didn't find its runtime usage.`,
      });
    }
  }

  return problems;
}
