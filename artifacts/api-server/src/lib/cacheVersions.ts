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
 */

/**
 * Authoritative list of every (prefix, currentVersion) pair that is live.
 * On startup, any DB rows whose cache_key begins with a known prefix but
 * carries a different version segment are deleted so they can never be
 * warmed back into memory.
 */
export const LLM_CACHE_CURRENT_VERSIONS: ReadonlyArray<
  [prefix: string, currentVersion: string]
> = [
  ["quick", "v58"], // discover — quick mode
  ["full", "v58"], // discover — full mode
  ["suggest", "v12"], // location suggestions
  ["geocode", "v3"], // geocode
  ["revgeo", "v12"], // reverse geocode
  ["nbhd", "v2"], // neighbourhood label reverse-geocode (formerly revgeo-nbhd:v1:)
  ["suggest404", "v5"], // address-not-found suggestions
  ["investigate", "v6"], // address investigation
  ["detail", "v6"], // place detail
  ["timeline", "v2"], // place timeline
  ["narration", "v17"], // walk narration (short)
  ["deep-narration", "v12"], // deep walk narration
  ["places-route", "v21"], // places along route
];

/**
 * OSM proximity cache version.
 * Must match the prefix used in osmSuggestionsBucketKey() in
 * routes/explore/index.ts.
 */
export const OSM_CACHE_VERSION = "v43";

/**
 * Flat record of all current cache versions keyed by namespace.
 * Used by /api/healthz to report the running cache state.
 */
export const CURRENT_CACHE_VERSIONS: Record<string, string> = {
  ...Object.fromEntries(LLM_CACHE_CURRENT_VERSIONS),
  osm: OSM_CACHE_VERSION,
};
