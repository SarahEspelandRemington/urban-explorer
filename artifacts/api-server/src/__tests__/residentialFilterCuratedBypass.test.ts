import { describe, it, expect } from "vitest";
import { isBoringResidentialBuilding } from "../lib/residentialBuildingFilter";
import { getApprovedCuratedEntry } from "../lib/curatedLocalHistory";

/**
 * Regression coverage for the curated-evidence residential-filter bypass
 * added in routes/explore/index.ts (osm-anchor discover candidate filter):
 *
 *   !isBoringResidentialBuilding(p.tags) || getApprovedCuratedEntry(p.osmId) !== undefined
 *
 * isBoringResidentialBuilding() itself is untouched (see
 * residentialBuildingFilter.test.ts) — this file exercises the composed
 * predicate exactly as it appears at the real call site, using the two real
 * Fishtown curated entries plus a synthetic uncurated candidate.
 */
function survivesResidentialFilter(
  tags: Record<string, string>,
  osmId: string,
): boolean {
  return (
    !isBoringResidentialBuilding(tags) ||
    getApprovedCuratedEntry(osmId) !== undefined
  );
}

describe("residential filter — curated-evidence bypass", () => {
  it("rescues Brownhill & Kramer / The Columbia (way/1359685411) via curated evidence", () => {
    const tags = {
      building: "apartments",
      "addr:housenumber": "1421",
      "addr:street": "East Columbia Avenue",
      "building:levels": "5",
      name: "The Columbia",
    };
    expect(isBoringResidentialBuilding(tags)).toBe(true);
    expect(survivesResidentialFilter(tags, "way/1359685411")).toBe(true);
  });

  it("rescues Memphis Studios (way/963718616) via curated evidence", () => {
    const tags = {
      building: "apartments",
      "addr:housenumber": "1714",
      "addr:street": "Memphis Street",
      height: "23.16",
      name: "Memphis Studios",
    };
    expect(isBoringResidentialBuilding(tags)).toBe(true);
    expect(survivesResidentialFilter(tags, "way/963718616")).toBe(true);
  });

  it("continues to suppress an unrelated apartments building with no curated evidence", () => {
    const tags = {
      building: "apartments",
      "addr:housenumber": "42",
      "addr:street": "Main Street",
      name: "Victory Apartments",
    };
    expect(isBoringResidentialBuilding(tags)).toBe(true);
    expect(getApprovedCuratedEntry("way/9999999999")).toBeUndefined();
    expect(survivesResidentialFilter(tags, "way/9999999999")).toBe(false);
  });
});
