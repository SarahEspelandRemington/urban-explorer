import { describe, it, expect } from "vitest";
import { buildDetailUserTurn } from "../routes/explore/index";

const BASE_TURN = `Tell me everything interesting about "St. Clement's Church" — category: place of worship — located in this area of 51.500, -0.125`;

describe("buildDetailUserTurn — no OSM data", () => {
  it("returns the base turn when trustLevel is undefined", () => {
    const result = buildDetailUserTurn(
      "St. Clement's Church",
      "place of worship",
      51.5,
      -0.125,
    );
    expect(result).toBe(BASE_TURN);
  });

  it("returns the base turn when osmTags is empty", () => {
    const result = buildDetailUserTurn(
      "St. Clement's Church",
      "place of worship",
      51.5,
      -0.125,
      "osm_enriched",
      {},
    );
    expect(result).toBe(BASE_TURN);
  });

  it("returns the base turn when osmTags is undefined", () => {
    const result = buildDetailUserTurn(
      "St. Clement's Church",
      "place of worship",
      51.5,
      -0.125,
      "osm_standard",
      undefined,
    );
    expect(result).toBe(BASE_TURN);
  });

  it("returns the base turn for osm_bare even with tags present", () => {
    const result = buildDetailUserTurn(
      "St. Clement's Church",
      "place of worship",
      51.5,
      -0.125,
      "osm_bare",
      { denomination: "Anglican" },
    );
    expect(result).toBe(BASE_TURN);
  });
});

describe("buildDetailUserTurn — osm_enriched", () => {
  it("appends VERIFIED SOURCE TAGS block", () => {
    const result = buildDetailUserTurn(
      "St. Clement's Church",
      "place of worship",
      51.5,
      -0.125,
      "osm_enriched",
      { denomination: "Anglican", start_date: "1874" },
    );
    expect(result).toContain("VERIFIED SOURCE TAGS");
    expect(result).toContain("denomination: Anglican");
    expect(result).toContain("start_date: 1874");
  });

  it("does NOT append source pointer note when wikidata/wikipedia absent", () => {
    const result = buildDetailUserTurn(
      "St. Clement's Church",
      "place of worship",
      51.5,
      -0.125,
      "osm_enriched",
      { denomination: "Anglican" },
    );
    expect(result).not.toContain("SOURCE POINTER NOTE");
  });

  it("appends SOURCE POINTER NOTE when wikidata tag is present", () => {
    const result = buildDetailUserTurn(
      "St. Clement's Church",
      "place of worship",
      51.5,
      -0.125,
      "osm_enriched",
      { denomination: "Anglican", wikidata: "Q12345" },
    );
    expect(result).toContain("SOURCE POINTER NOTE");
    expect(result).toContain("Do NOT claim to have read the Wikipedia article");
  });

  it("appends SOURCE POINTER NOTE when wikipedia tag is present", () => {
    const result = buildDetailUserTurn(
      "St. Clement's Church",
      "place of worship",
      51.5,
      -0.125,
      "osm_enriched",
      { wikipedia: "en:St. Clement's Church, London" },
    );
    expect(result).toContain("SOURCE POINTER NOTE");
  });
});

describe("buildDetailUserTurn — osm_standard", () => {
  it("appends VERIFIED TAG DATA block with anti-hallucination rule", () => {
    const result = buildDetailUserTurn(
      "Gasworks Building",
      "industrial",
      51.5,
      -0.125,
      "osm_standard",
      { operator: "British Gas", building: "industrial" },
    );
    expect(result).toContain("VERIFIED TAG DATA");
    expect(result).toContain("operator: British Gas");
    expect(result).toContain(
      "Do NOT invent founding dates, architectural styles",
    );
  });

  it("instructs model to omit founding year when start_date is absent", () => {
    const result = buildDetailUserTurn(
      "Gasworks Building",
      "industrial",
      51.5,
      -0.125,
      "osm_standard",
      { operator: "British Gas" },
    );
    expect(result).toContain(
      "If start_date is absent from this block, omit any date or founding-year claim entirely",
    );
  });

  it("does NOT append SOURCE POINTER NOTE", () => {
    const result = buildDetailUserTurn(
      "Gasworks Building",
      "industrial",
      51.5,
      -0.125,
      "osm_standard",
      { wikidata: "Q99999" },
    );
    expect(result).not.toContain("SOURCE POINTER NOTE");
  });
});

describe("buildDetailUserTurn — category fallback", () => {
  it("uses 'place' when category is undefined", () => {
    const result = buildDetailUserTurn(
      "Mystery Building",
      undefined,
      51.5,
      -0.125,
    );
    expect(result).toContain("category: place");
  });
});
