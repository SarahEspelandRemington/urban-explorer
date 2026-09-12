/**
 * Streetlit-owned point-identity registry.
 *
 * A small, manually curated registry of real-world places Streetlit wants
 * to attach documented local history to, but which do not have a usable
 * present-day OSM entity representing the historic building/place itself
 * (see the read-only identity diagnostics for 475 10th Avenue / Hill
 * Publishing and 557 Eighth Avenue). Each entry is a Streetlit-owned
 * exact-point identity — not an OSM element, not a fuzzy match, and not a
 * general vanished-site reconstruction system.
 *
 * identityType is "building" for a real, currently-standing structure with
 * no usable present-day OSM entity of its own. identityType: "former_site"
 * is a single, deliberately narrow exception (added for the Spring Garden
 * Carnegie Library prototype case): the place this entry describes no
 * longer physically exists at this location. This is NOT a general
 * approximate/fuzzy-location or historical-polygon mechanism — it is one
 * exact point, used only when a place has been independently confirmed
 * demolished/removed and no current OSM entity represents it. Narration for
 * a former_site entry must never imply the historic structure still stands;
 * that constraint is enforced via the entry's curated-evidence claimScope
 * (see curatedLocalHistory.ts), not via any code branch on identityType
 * itself.
 *
 * Entries are normalized into the discover candidate stream in
 * routes/explore/index.ts as an OSMPlace with candidateOrigin: "streetlit"
 * and tags: {} (so computeOsmTrustLevel self-computes osm_bare, with no
 * special-casing), after the existing radius filter, using the same
 * distance-inclusion rule as real OSM candidates. A Streetlit-owned
 * identity and a coexisting real OSM candidate at the same address are
 * never suppressed/deduped against each other — both remain distinct
 * entries in the response.
 *
 * streetlitId is the internal join key (curated-evidence lookup, copy-gen
 * result matching, response identity) — the same role osmId plays for real
 * OSM candidates, and, like osmId, treated as an opaque string everywhere
 * it's read internally. It is never presented to the client under the
 * `osmId` field; see mergedPlaces construction in routes/explore/index.ts.
 */

export interface StreetlitPlace {
  streetlitId: string;
  displayName: string;
  latitude: number;
  longitude: number;
  address: string;
  identityType: "building" | "former_site";
  /** Present only when a related-but-distinct real OSM element exists at
   *  or near this identity's coordinates that should not be conflated with
   *  it (e.g. a current tenant under a different name). Omitted for both
   *  pilot entries below — a coexisting tenant candidate is handled by
   *  ordinary candidate coexistence (no suppression rule), not by this
   *  field. */
  osmAlias?: string;
}

export const STREETLIT_PLACES: readonly StreetlitPlace[] = [
  {
    streetlitId: "streetlit/475-10th-ave-hill-publishing",
    displayName: "Hill Publishing Building",
    latitude: 40.7561342,
    longitude: -73.9982421,
    address: "475 10th Avenue",
    identityType: "building",
  },
  {
    streetlitId: "streetlit/557-8th-ave",
    displayName: "557 Eighth Avenue",
    latitude: 40.7547,
    longitude: -73.9918572,
    address: "557 8th Avenue",
    identityType: "building",
  },
  {
    streetlitId: "streetlit/2301-fairmount-ave-rothacker-orth",
    displayName: "Rothacker-Orth Brewery and Lager Beer Saloon",
    latitude: 39.9675427,
    longitude: -75.1754632,
    address: "2301 Fairmount Avenue",
    identityType: "building",
  },
  {
    streetlitId: "streetlit/2133-spring-garden-polonia",
    displayName: "Polonia Federal Savings Bank",
    latitude: 39.9643516,
    longitude: -75.1741986,
    address: "2133-35 Spring Garden Street",
    identityType: "building",
  },
  {
    streetlitId: "streetlit/2101-mount-vernon-st",
    displayName: "2101 Mount Vernon Street",
    latitude: 39.9661417,
    longitude: -75.1724873,
    address: "2101 Mount Vernon Street",
    identityType: "building",
  },
  {
    streetlitId: "streetlit/1700-spring-garden-carnegie-library",
    displayName: "Spring Garden Carnegie Library (former site)",
    latitude: 39.9628,
    longitude: -75.1664,
    address: "SW corner of 17th & Spring Garden Streets",
    identityType: "former_site",
  },
  {
    streetlitId: "streetlit/1818-spring-garden-reyburn-mansion",
    displayName: "Reyburn Mansion — First PCOM Campus (former site)",
    latitude: 39.9629506,
    longitude: -75.1690731,
    address: "1818-1820 Spring Garden Street",
    identityType: "former_site",
    // A real, named OSM building (an unrelated modern apartment building,
    // "Spring Garden Towers") occupies this exact site today. Not the
    // historic mansion — see curatedLocalHistory.ts for the claimScope
    // guard against conflating the two.
    osmAlias: "way/250836804",
  },
  {
    streetlitId: "streetlit/1903-spring-garden-la-milagrosa",
    displayName: "La Milagrosa Chapel (former Spanish Catholic chapel)",
    latitude: 39.963738,
    longitude: -75.1696196,
    address: "1903 Spring Garden Street",
    // The historic chapel building still physically stands (converted to
    // residential use after the congregation closed in 2013) — "building",
    // not "former_site". The real OSM entity at this address (way/1314403624)
    // is still tagged amenity=place_of_worship/denomination=catholic, which
    // is stale by over a decade. That OSM entity is deliberately excluded
    // from the candidate pool via STALE_OSM_IDS below rather than left to
    // coexist under osmAlias, so it never independently surfaces as a
    // current church — see curatedLocalHistory.ts for the bounded former-use
    // history this entry carries instead.
    identityType: "building",
  },
  {
    streetlitId: "streetlit/1717-spring-garden-stetson-house",
    displayName: "John B. Stetson House",
    latitude: 39.9634535,
    longitude: -75.1669028,
    address: "1717 Spring Garden Street",
    // The building still stands (converted to condominium/loft units) —
    // "building", not "former_site". No current-day OSM entity at this
    // address carries a name tag (confirmed via Overpass), so it is
    // categorically absent from the raw discover candidate fetch, which
    // requires a named building/way — see curatedLocalHistory.ts for the
    // bounded curated evidence this entry carries.
    identityType: "building",
  },
];

/**
 * Real OSM element ids whose current tags misrepresent the present-day use
 * of the place — e.g. a chapel that closed years ago but whose OSM entity is
 * still tagged amenity=place_of_worship. Distinct from STREETLIT_PLACES
 * (which adds identities OSM has no usable current entity for at all): this
 * set instead suppresses a real, currently-mapped OSM candidate that would
 * otherwise surface as if it were still a legitimate current place. Excluded
 * from the raw candidate pool in both user-facing candidate paths in
 * routes/explore/index.ts that can independently surface this id: the main
 * /explore/discover route (before radius filtering) and the
 * /explore/places-along-route route's fetchOSMPlacesInBoundingBox Overpass
 * fetch (whose amenity=place_of_worship clause can otherwise return it too).
 * This is a targeted exclusion of specific known-stale ids, not a general
 * staleness-detection mechanism. The corresponding historic story (if any)
 * belongs in a separate STREETLIT_PLACES + curatedLocalHistory.ts entry, not
 * as a coexisting osmAlias — see the La Milagrosa entry above.
 */
export const STALE_OSM_IDS: ReadonlySet<string> = new Set([
  // La Milagrosa Chapel closed permanently in June 2013; the building was
  // later sold and converted to residential use. This OSM way is still
  // tagged amenity=place_of_worship/denomination=catholic as of the most
  // recent check. See streetlitPlaces.ts's La Milagrosa entry and
  // curatedLocalHistory.ts for the bounded former-use history.
  "way/1314403624",
]);
