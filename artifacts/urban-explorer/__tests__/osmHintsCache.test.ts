import { setOsmHints, getOsmHints } from "../lib/osmHintsCache";

describe("osmHintsCache", () => {
  it("returns null for an unknown osmId", () => {
    expect(getOsmHints("node/nonexistent-xzy123")).toBeNull();
  });

  it("returns stored hints after setOsmHints", () => {
    setOsmHints("node/cache-test-1", {
      trustLevel: "osm_enriched",
      osmTags: { wikidata: "Q999", denomination: "Catholic" },
    });
    const result = getOsmHints("node/cache-test-1");
    expect(result).not.toBeNull();
    expect(result?.trustLevel).toBe("osm_enriched");
    expect(result?.osmTags.wikidata).toBe("Q999");
  });

  it("overwrites an existing entry for the same osmId", () => {
    setOsmHints("node/cache-test-2", {
      trustLevel: "osm_standard",
      osmTags: { operator: "Old Operator" },
    });
    setOsmHints("node/cache-test-2", {
      trustLevel: "osm_enriched",
      osmTags: { operator: "New Operator", wikidata: "Q7" },
    });
    const result = getOsmHints("node/cache-test-2");
    expect(result?.trustLevel).toBe("osm_enriched");
    expect(result?.osmTags.operator).toBe("New Operator");
  });

  it("returns null for a different osmId when only one id was set", () => {
    setOsmHints("way/cache-test-3", {
      trustLevel: "osm_bare",
      osmTags: {},
    });
    expect(getOsmHints("node/cache-test-3")).toBeNull();
  });

  it("stores an entry with an empty osmTags map", () => {
    setOsmHints("node/cache-test-4", {
      trustLevel: "osm_bare",
      osmTags: {},
    });
    const result = getOsmHints("node/cache-test-4");
    expect(result).not.toBeNull();
    expect(result?.trustLevel).toBe("osm_bare");
    expect(Object.keys(result?.osmTags ?? {})).toHaveLength(0);
  });
});
