/**
 * Residential building suppression for OSM anchor candidates.
 *
 * Plain residential buildings (apartments, houses, etc.) are not Streetlit
 * discoveries — they are map data. This module suppresses them from the OSM
 * candidate pool before the LLM generates copy.
 *
 * A residential building is exempt when it carries at least one story-bearing
 * tag: wikidata, wikipedia, historic, heritage, heritage:description, ref:nrhp,
 * description, or architect. These signal that OSM mappers or heritage agencies
 * have already identified the place as notable beyond its current use.
 *
 * start_date is intentionally NOT an exemption tag. A construction date alone
 * is not a story: it causes the LLM to write "Built in 1962, Victory Apartments
 * is a residential building…", which produces an unclassified tier that bypasses
 * all downstream suppression. Suppressing at the candidate stage is the fix.
 */

/** OSM building= values that represent plain residential use. */
export const RESIDENTIAL_BUILDING_TYPES = new Set([
  "apartments",
  "residential",
  "flats",
  "house",
  "detached",
  "semidetached_house",
  "terrace",
  "dormitory",
]);

/**
 * OSM tags whose presence on a residential building signals a genuine hidden
 * story, architectural significance, or heritage designation. Any one of these
 * exempts the place from suppression.
 *
 * Excluded intentionally: start_date, old_name, alt_name, operator,
 * building:material, denomination — these describe facts about a place but do
 * not indicate that the place has a discovery-worthy story.
 */
export const RESIDENTIAL_STORY_BEARING_TAGS = new Set([
  "wikidata",
  "wikipedia",
  "historic",
  "heritage",
  "heritage:description",
  "ref:nrhp",
  "description",
  "architect",
]);

/**
 * Returns true when the place should be suppressed from OSM candidate pools:
 *   - its building= tag is in RESIDENTIAL_BUILDING_TYPES, AND
 *   - it carries none of the RESIDENTIAL_STORY_BEARING_TAGS.
 *
 * Returns false (keep the place) when:
 *   - the building= tag is absent or not residential, OR
 *   - at least one story-bearing tag is present.
 */
export function isBoringResidentialBuilding(
  tags: Record<string, string>,
): boolean {
  const building = (tags["building"] ?? "").toLowerCase().trim();
  if (!building || !RESIDENTIAL_BUILDING_TYPES.has(building)) return false;
  for (const tag of RESIDENTIAL_STORY_BEARING_TAGS) {
    if (tags[tag]) return false;
  }
  return true;
}
