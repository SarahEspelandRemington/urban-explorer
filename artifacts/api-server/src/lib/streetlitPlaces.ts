/**
 * Streetlit-owned point-identity registry.
 *
 * A small, manually curated registry of real-world places Streetlit wants
 * to attach documented local history to, but which do not have a usable
 * present-day OSM entity representing the historic building/place itself
 * (see the read-only identity diagnostics for 475 10th Avenue / Hill
 * Publishing and 557 Eighth Avenue). Each entry is a Streetlit-owned
 * exact-point identity — not an OSM element, not a fuzzy match, not a
 * vanished-site reconstruction (all out of scope for this registry).
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
  identityType: "building";
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
];
