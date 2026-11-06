// Explicit boolean reproduction of the 13 `nwr[...]` selector clauses in
// fetchNearbyOSMPlaces's Overpass query (artifacts/api-server/src/routes/
// explore/index.ts, the `(...)` union block). This file is deliberately NOT
// built on osmium's `tags-filter` grammar: that tool's `key1,key2` syntax is
// an OR of keys, not an AND — confirmed by test during the Package 1 parity
// investigation — which would silently admit elements that fail one half of
// the 8 `name + X` composite clauses below. Each clause here is a plain JS
// predicate over the raw tag dict instead.
//
// A tag-existence clause (e.g. `nwr["historic"]`) matches any element that
// HAS the key, regardless of its value (Overpass does not special-case
// "no"/"false" here — that filtering happens elsewhere, downstream, not in
// the selector itself). A regex clause (e.g. `tourism~"^(...)$"`) requires
// both the key to exist AND its value to match the anchored alternation.
//
// This module intentionally does NOT apply the separate, unconditional
// `if (!name) continue` filter that fetchNearbyOSMPlaces's own
// post-processing loop applies to every Overpass result regardless of which
// clause matched (index.ts line ~985). That is downstream OSMPlace[]
// shaping, owned by the (not-yet-built) server adapter — see osm_places.ts's
// schema comments. Package 1's job is to mirror the Overpass selector only,
// so unnamed historic/heritage/ruins/tourism/memorial elements are retained
// here as valid candidate rows.

export type OsmTags = Record<string, string>;

// A clause descriptor is the structural shape the selector-drift guard test
// (selectorsTest.ts) parses back out of the live query text in
// routes/explore/index.ts and compares against this file's own clauses —
// byte-for-byte on `keys` and `valueRegex`, so an edit to either side without
// the other fails that test.
export interface SelectorClause {
  id: string;
  keys: string[];
  valueRegex: string | null; // the exact `^(...)$` text from the query, or null for a bare existence check
  test: (tags: OsmTags) => boolean;
}

function hasKey(tags: OsmTags, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(tags, key);
}

// `nwr["key"]` — bare existence, no secondary key required.
function existenceClause(id: string, key: string): SelectorClause {
  return {
    id,
    keys: [key],
    valueRegex: null,
    test: (tags) => hasKey(tags, key),
  };
}

// `nwr["key"~"regex"]` — existence of `key` plus a regex match on its value,
// no secondary key required.
function regexClause(
  id: string,
  key: string,
  valueRegex: string,
): SelectorClause {
  const re = new RegExp(valueRegex);
  return {
    id,
    keys: [key],
    valueRegex,
    test: (tags) => hasKey(tags, key) && re.test(tags[key]),
  };
}

// `nwr["name"]["key"~"regex"]` — AND of `name` existing and `key` existing
// and matching the regex.
function nameAndRegexClause(
  id: string,
  key: string,
  valueRegex: string,
): SelectorClause {
  const re = new RegExp(valueRegex);
  return {
    id,
    keys: ["name", key],
    valueRegex,
    test: (tags) =>
      hasKey(tags, "name") && hasKey(tags, key) && re.test(tags[key]),
  };
}

// `nwr["name"]["key"]` — AND of `name` existing and `key` existing, no regex.
function nameAndExistenceClause(id: string, key: string): SelectorClause {
  return {
    id,
    keys: ["name", key],
    valueRegex: null,
    test: (tags) => hasKey(tags, "name") && hasKey(tags, key),
  };
}

export const SELECTOR_CLAUSES: SelectorClause[] = [
  existenceClause("historic", "historic"),
  existenceClause("heritage", "heritage"),
  existenceClause("ruins", "ruins"),
  regexClause(
    "tourism",
    "tourism",
    "^(attraction|artwork|memorial|museum|gallery|viewpoint)$",
  ),
  nameAndExistenceClause("name+building", "building"),
  nameAndRegexClause(
    "name+amenity",
    "amenity",
    "^(place_of_worship|library|theatre|cinema|arts_centre|pub|bar|bank|post_office|police|fire_station|school|college|university|marketplace|townhall|courthouse|prison|hospital|community_centre|social_facility)$",
  ),
  nameAndRegexClause(
    "name+man_made",
    "man_made",
    "^(water_tower|chimney|bridge|lighthouse|monument|tower|pier|reservoir_covered|storage_tank|gasometer)$",
  ),
  nameAndRegexClause(
    "name+landuse",
    "landuse",
    "^(religious|cemetery|industrial|railway)$",
  ),
  nameAndRegexClause(
    "name+railway",
    "railway",
    "^(station|halt|tram_stop|subway_entrance|disused_station)$",
  ),
  nameAndExistenceClause("name+disused:amenity", "disused:amenity"),
  nameAndExistenceClause("name+demolished:building", "demolished:building"),
  existenceClause("memorial", "memorial"),
  nameAndRegexClause(
    "name+leisure",
    "leisure",
    "^(park|garden|nature_reserve)$",
  ),
];

export function matchesAnySelector(tags: OsmTags): boolean {
  return SELECTOR_CLAUSES.some((c) => c.test(tags));
}

export function matchingSelectorIds(tags: OsmTags): string[] {
  return SELECTOR_CLAUSES.filter((c) => c.test(tags)).map((c) => c.id);
}
