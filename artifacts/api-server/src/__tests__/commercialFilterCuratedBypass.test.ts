import { describe, it, expect } from "vitest";
import { isOrdinaryCommercialUse } from "../lib/commercialUseFilter";
import { getApprovedCuratedEntry } from "../lib/curatedLocalHistory";

/**
 * Regression coverage for the curated-evidence commercial-filter bypass
 * added in routes/explore/index.ts (osm-anchor discover candidate filter),
 * mirroring residentialFilterCuratedBypass.test.ts:
 *
 *   !isOrdinaryCommercialUse(p.tags) || getApprovedCuratedEntry(p.osmId) !== undefined
 *
 * isOrdinaryCommercialUse() itself is untouched (see commercialUseFilter.test.ts)
 * — this file exercises the composed predicate exactly as it appears at the
 * real call site, using the real Spring Garden generated-evidence subjects
 * plus a synthetic uncurated candidate.
 */
function survivesCommercialFilter(
  tags: Record<string, string>,
  osmId: string,
): boolean {
  return (
    !isOrdinaryCommercialUse(tags) ||
    getApprovedCuratedEntry(osmId) !== undefined
  );
}

describe("commercial filter — curated-evidence bypass", () => {
  it("rescues Philadelphia Bikesmith (node/2453577957) via generated evidence", () => {
    const tags = {
      shop: "bicycle",
      "addr:housenumber": "1822",
      "addr:street": "Spring Garden Street",
      name: "Philadelphia Bikesmith",
    };
    expect(isOrdinaryCommercialUse(tags)).toBe(true);
    expect(survivesCommercialFilter(tags, "node/2453577957")).toBe(true);
  });

  it("rescues SEIU (way/349397298) via generated evidence", () => {
    const tags = {
      office: "union",
      building: "yes",
      "addr:housenumber": "1924",
      "addr:street": "Spring Garden Street",
      name: "SEIU",
    };
    expect(isOrdinaryCommercialUse(tags)).toBe(true);
    expect(survivesCommercialFilter(tags, "way/349397298")).toBe(true);
  });

  it("continues to suppress an unrelated shop with no curated evidence", () => {
    const tags = {
      shop: "hardware",
      building: "commercial",
      name: "Main Street Hardware",
    };
    expect(isOrdinaryCommercialUse(tags)).toBe(true);
    expect(getApprovedCuratedEntry("way/8888888888")).toBeUndefined();
    expect(survivesCommercialFilter(tags, "way/8888888888")).toBe(false);
  });
});
