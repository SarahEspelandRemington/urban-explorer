// cache-versions:v6:
/**
 * Single source of truth for all LLM and OSM cache version strings.
 *
 * Rules:
 *  - When bumping a version, update the entry in LLM_CACHE_CURRENT_VERSIONS
 *    AND the matching literal in the discoverCacheKey assignment in
 *    routes/explore/index.ts (the literal there must stay in sync).
 *  - routes/explore/index.ts imports LLM_CACHE_CURRENT_VERSIONS for startup
 *    eviction of stale DB rows.
 *  - routes/health.ts imports CURRENT_CACHE_VERSIONS to report runtime state
 *    at /api/healthz.
 *
 * v5-v6: B2 registry reconciliation — corrected six stale registry values
 * (geocode, investigate, detail, narration, deep-narration, places-route) to
 * match their already-live runtime cache-key literals, and added support for
 * a prefix to declare multiple simultaneously-current versions (used by
 * quick/full, which have distinct legacy vs. osm-anchor versions). No
 * runtime cache-key literal changed; this file's own version bump is a
 * prompt-manifest bookkeeping requirement only (whole-file/self-tag
 * tracking), not a cache-behavior change.
 */

/**
 * Authoritative list of every (prefix, currentVersion) pair that is live.
 * On startup, any DB rows whose cache_key begins with a known prefix but
 * carries a version segment that matches none of the currentVersion(s) are
 * deleted so they can never be warmed back into memory.
 *
 * A prefix's currentVersion is normally a single string. Some prefixes
 * intentionally have more than one version live at once (e.g. "quick"/"full"
 * carry distinct versions for the legacy vs. osm-anchored discover code
 * paths in routes/explore/index.ts) — for those, pass an array of every
 * currently-live version so startup eviction preserves rows matching any of
 * them.
 */
export const LLM_CACHE_CURRENT_VERSIONS: ReadonlyArray<
  [prefix: string, currentVersion: string | ReadonlyArray<string>]
> = [
  ["quick", ["v63", "v76"]], // discover — quick mode (legacy v63, osm-anchor v76)
  ["full", ["v63", "v76"]], // discover — full mode (legacy v63, osm-anchor v76)
  ["suggest", "v12"], // location suggestions
  ["geocode", "v4"], // geocode
  ["revgeo", "v12"], // reverse geocode
  ["nbhd", "v2"], // neighbourhood label reverse-geocode (formerly named revgeo-nbhd, version 1)
  ["suggest404", "v5"], // address-not-found suggestions
  ["investigate", "v8"], // address investigation
  ["detail", "v10"], // place detail
  ["timeline", "v2"], // place timeline
  ["narration", "v20"], // walk narration (short)
  ["deep-narration", "v14"], // deep walk narration
  ["places-route", "v28"], // places along route
];

/**
 * OSM proximity cache version.
 * Must match the prefix used in osmSuggestionsBucketKey() in
 * routes/explore/index.ts.
 */
export const OSM_CACHE_VERSION = "v43";

/**
 * Flat record of all current cache versions keyed by namespace.
 * Used by /api/healthz to report the running cache state. Prefixes with
 * multiple simultaneously-live versions are joined with "|" since the
 * healthz response schema is Record<string, string>.
 */
export const CURRENT_CACHE_VERSIONS: Record<string, string> = {
  ...Object.fromEntries(
    LLM_CACHE_CURRENT_VERSIONS.map(([prefix, currentVersion]) => [
      prefix,
      Array.isArray(currentVersion) ? currentVersion.join("|") : currentVersion,
    ]),
  ),
  osm: OSM_CACHE_VERSION,
};
