/**
 * OSM trust-level classification for the Walk Mode OSM-anchor discover copy path.
 *
 * Trust level is computed from which tags are present on an OSM element.
 * It controls how conservatively the LLM is instructed to write copy —
 * in particular whether it may assert dates, founding stories, architectural
 * details, or former uses that are not present in the raw tag data.
 *
 * Three levels, in priority order (highest wins):
 *
 *   osm_enriched — element has wikidata, wikipedia, historic, description, or
 *     heritage:description.  Full historical copy is permitted when grounded
 *     in the tag data.
 *
 *   osm_standard — element has denomination, operator, start_date, architect,
 *     building:material, or alt_name (but none of the enriched tags).  Factual
 *     tags may be referenced; dates and founding claims are allowed only when
 *     start_date is present; architectural styles are allowed only when
 *     building:material or architect is present.
 *
 *   osm_bare — element has only name, type/category, and coordinates.
 *     Copy must be fully observational: no dates, no founding claims, no former
 *     uses, no architectural style claims, no "served as a hub" language.
 */

export type OsmTrustLevel = "osm_enriched" | "osm_standard" | "osm_bare";

const ENRICHED_TAGS = new Set([
  "wikidata",
  "wikipedia",
  "historic",
  "description",
  "heritage:description",
]);

const STANDARD_TAGS = new Set([
  "start_date",
  "denomination",
  "operator",
  "architect",
  "building:material",
  "alt_name",
]);

/**
 * Compute the OSM trust level for a place based on its raw OSM tags.
 * Enriched takes priority over standard; standard takes priority over bare.
 */
export function computeOsmTrustLevel(
  tags: Record<string, string>,
): OsmTrustLevel {
  for (const tag of ENRICHED_TAGS) {
    if (tags[tag]) return "osm_enriched";
  }
  for (const tag of STANDARD_TAGS) {
    if (tags[tag]) return "osm_standard";
  }
  return "osm_bare";
}

/**
 * Per-trust-level copy rules injected into the OSM-anchor discover system prompt.
 * Exported so the rules can be verified in tests.
 */
export const OSM_COPY_RULES: Record<OsmTrustLevel, string> = {
  osm_enriched: `\
osm_enriched — the candidate has wikidata, wikipedia, historic, description, or heritage:description tags.
  summary: One vivid, specific sentence using the historical or architectural detail present in the source tags.
  facts: 2–3 facts grounded in the tag data provided. Specific years, names, and events are permitted when the tags support them. Flag any claim not directly in the tags with "Reportedly" or "According to local accounts."
  yearBuilt: Include if supported by start_date or another tagged source. Otherwise omit.`,

  osm_standard: `\
osm_standard — the candidate has denomination, operator, start_date, architect, building:material, or alt_name, but none of the enriched tags.
  summary: One sentence grounded in the factual tags that are present — what the place is and what is verifiably known about it from the tags.
  facts: 1–2 facts using only information present in the tags. Do NOT invent founding dates, former uses, architectural styles not in the tags, historical roles, or community-organizing claims. If start_date is absent, omit any year, decade, or founding-date claim entirely. Use language like "is listed as", "is operated by", or "is a [denomination] congregation."
  yearBuilt: Include only if start_date is present in the tags. Otherwise omit.`,

  osm_bare: `\
osm_bare — the candidate has only name, type/category, and coordinates.
  summary: One observational sentence describing what the place is and what the user can notice or understand about it. No dates, no founding claims, no former uses, no architectural style claims, no "served as a hub" or "hosted" claims. Use language like "is mapped as", "appears to be", or "this [type] is listed here as."
  facts: 1–2 brief observational facts grounded in the place's current type, visible context, or present use. No invented history.
  yearBuilt: Omit entirely.`,
};
