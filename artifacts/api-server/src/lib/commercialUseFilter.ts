/**
 * Ordinary-commercial-use suppression for OSM anchor candidates.
 *
 * The Overpass query's named-building catch-all (`nwr["name"]["building"]`)
 * admits any named building regardless of its actual use, including shops,
 * offices, and craft businesses that have no independent story beyond
 * "a business operates here." These candidates never carry an `amenity`
 * value from the whitelisted set, so they fall through the osmType priority
 * chain to a building-derived category (e.g. "commercial", "retail") that has
 * no overlap with filterGenericCommercial()'s category list — meaning that
 * filter can only catch them if their name happens to match a known chain
 * regex. This module suppresses them from the OSM candidate pool before the
 * LLM generates copy, mirroring residentialBuildingFilter.ts's approach.
 *
 * A commercial place is exempt when it carries at least one story-bearing
 * tag: wikidata, wikipedia, historic, heritage, heritage:description, ref:nrhp,
 * description, architect, or disused:amenity. These signal that OSM mappers
 * or heritage agencies have already identified the place as notable beyond
 * its current use, or that its current use is itself a former use worth
 * noting.
 *
 * start_date is intentionally NOT an exemption tag, for the same reason it
 * is excluded in residentialBuildingFilter.ts: a construction date alone is
 * not a story.
 *
 * This predicate deliberately does not consult `amenity` (already handled by
 * the existing category-priority path) or `building` alone (an intentional
 * guardrail — see the storefront/building test cases in
 * productionFilter.test.ts, which keep architecturally or historically named
 * buildings even when their category is "commercial" or "building").
 */

import { OSM_STORY_BEARING_TAGS } from "./osmStoryBearingTags";

/** Raw OSM tag keys whose presence signals ordinary, non-notable commercial use. */
export const ORDINARY_COMMERCIAL_USE_TAG_KEYS = new Set([
  "shop",
  "office",
  "craft",
]);

/**
 * OSM tags whose presence on an ordinary-use commercial place signals a
 * genuine hidden story, architectural significance, or heritage designation.
 * Any one of these exempts the place from suppression.
 *
 * This is an independent Set instance from RESIDENTIAL_STORY_BEARING_TAGS —
 * built from the same shared base list (osmStoryBearingTags.ts) plus
 * disused:amenity, which is specific to this filter. The two Sets are never
 * shared or aliased, so a future change to one filter's override rules
 * cannot silently change the other's.
 */
export const COMMERCIAL_STORY_BEARING_TAGS: ReadonlySet<string> = new Set([
  ...OSM_STORY_BEARING_TAGS,
  "disused:amenity",
]);

/**
 * Returns true when the place should be suppressed from OSM candidate pools:
 *   - it carries a shop, office, or craft tag (any value), AND
 *   - it carries none of the COMMERCIAL_STORY_BEARING_TAGS.
 *
 * Returns false (keep the place) when:
 *   - none of shop/office/craft is present, OR
 *   - at least one story-bearing tag is present.
 */
export function isOrdinaryCommercialUse(tags: Record<string, string>): boolean {
  let hasOrdinaryUseTag = false;
  for (const key of ORDINARY_COMMERCIAL_USE_TAG_KEYS) {
    if (tags[key]) {
      hasOrdinaryUseTag = true;
      break;
    }
  }
  if (!hasOrdinaryUseTag) return false;
  for (const tag of COMMERCIAL_STORY_BEARING_TAGS) {
    if (tags[tag]) return false;
  }
  return true;
}
