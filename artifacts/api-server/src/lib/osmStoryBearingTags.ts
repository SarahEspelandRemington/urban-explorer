/**
 * Shared base list of OSM tags that signal a place carries independent
 * historical, architectural, civic, or heritage evidence — i.e. more than
 * just its current use.
 *
 * Consumers (residentialBuildingFilter.ts, commercialUseFilter.ts, ...) each
 * bind their own local export to these values, and may build their own
 * additional Set that extends this list with tags relevant to their own
 * suppression rule. This module intentionally exports only the base list —
 * consumers must not mutate it, and must not share a single Set instance
 * across unrelated filters, so a change to one filter's override rules can
 * never silently change another's.
 *
 * start_date is intentionally excluded from this base list: a construction
 * date alone is not a story (see residentialBuildingFilter.ts for the
 * concrete example this was originally written to guard against).
 */
export const OSM_STORY_BEARING_TAGS: ReadonlySet<string> = new Set([
  "wikidata",
  "wikipedia",
  "historic",
  "heritage",
  "heritage:description",
  "ref:nrhp",
  "description",
  "architect",
]);
