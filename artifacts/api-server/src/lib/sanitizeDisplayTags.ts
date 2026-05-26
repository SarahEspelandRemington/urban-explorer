/**
 * Display-tag sanitizer for OSM-anchored discover candidates.
 *
 * The copy-generation LLM occasionally echoes raw OSM metadata (Wikidata IDs,
 * Wikipedia slugs, key:value pairs, internal field names) from the structured
 * candidate data into the `tags` field. These functions filter that out before
 * the tags are stored on a Place and later rendered as user-facing chips.
 */

/**
 * Returns true if `tag` looks like raw technical metadata rather than a
 * human-readable display phrase.
 *
 * Rejected patterns:
 *  - Contains `:` — OSM key:value pairs  (WIKIDATA:Q4891444, BUILDING:LEVELS:3)
 *  - Contains `_` — OSM / URL slug style  (place_of_worship, BERGDOLL_MANSION)
 *  - All-uppercase (no lowercase letters) — internal labels  (ADDRESS, NAME, TYPE)
 *  - Bare Wikidata IDs                    (Q4891444)
 *  - Empty or over-long strings           (> 60 chars)
 */
export function isTechnicalTag(tag: string): boolean {
  const t = tag.trim();
  if (!t || t.length > 60) return true;
  if (t.includes(":")) return true;
  if (t.includes("_")) return true;
  if (/^[^a-z]+$/.test(t) && /[A-Z]/.test(t)) return true;
  if (/^Q\d{1,12}$/i.test(t)) return true;
  return false;
}

/**
 * Filters an LLM-generated tags array, removing entries that look like raw
 * OSM metadata, Wikidata IDs, Wikipedia slugs, or technical identifiers.
 *
 * Returns `undefined` (not an empty array) when all entries are filtered so
 * callers can distinguish "no tags" from "tags not provided".
 * Caps the result at 5 entries.
 */
export function sanitizeDisplayTags(
  tags: string[] | undefined,
): string[] | undefined {
  if (!tags) return undefined;
  const clean = tags.filter((t) => !isTechnicalTag(t));
  return clean.length > 0 ? clean.slice(0, 5) : undefined;
}
