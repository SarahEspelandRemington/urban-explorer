import { describe, it, expect } from "vitest";
import { computeOsmTrustLevel, OSM_COPY_RULES } from "../lib/osmTrustLevel";

// ---------------------------------------------------------------------------
// computeOsmTrustLevel — trust tier classification
// ---------------------------------------------------------------------------

describe("computeOsmTrustLevel — osm_enriched", () => {
  it("returns osm_enriched when wikidata tag is present", () => {
    expect(
      computeOsmTrustLevel({ wikidata: "Q12345", name: "Test Place" }),
    ).toBe("osm_enriched");
  });

  it("returns osm_enriched when wikipedia tag is present", () => {
    expect(
      computeOsmTrustLevel({ wikipedia: "en:Test Place", name: "Test Place" }),
    ).toBe("osm_enriched");
  });

  it("returns osm_enriched when historic tag is present", () => {
    expect(
      computeOsmTrustLevel({ historic: "building", name: "Old Hall" }),
    ).toBe("osm_enriched");
  });

  it("returns osm_enriched when description tag is present", () => {
    expect(
      computeOsmTrustLevel({
        description: "A Victorian-era market hall.",
        name: "Market Hall",
      }),
    ).toBe("osm_enriched");
  });

  it("returns osm_enriched when heritage:description tag is present", () => {
    expect(
      computeOsmTrustLevel({
        "heritage:description": "Listed on the local heritage register.",
        name: "Old Church",
      }),
    ).toBe("osm_enriched");
  });

  it("osm_enriched takes priority even when standard tags are also present", () => {
    expect(
      computeOsmTrustLevel({
        wikidata: "Q99999",
        denomination: "presbyterian",
        operator: "Presbyterian Church (U.S.A.)",
        name: "First Presbyterian",
      }),
    ).toBe("osm_enriched");
  });
});

describe("computeOsmTrustLevel — osm_standard", () => {
  it("returns osm_standard when denomination tag is present", () => {
    expect(
      computeOsmTrustLevel({ denomination: "presbyterian", name: "A Church" }),
    ).toBe("osm_standard");
  });

  it("returns osm_standard when operator tag is present", () => {
    expect(
      computeOsmTrustLevel({
        operator: "Presbyterian Church (U.S.A.)",
        name: "A Church",
      }),
    ).toBe("osm_standard");
  });

  it("returns osm_standard when start_date tag is present", () => {
    expect(
      computeOsmTrustLevel({ start_date: "1892", name: "Old Library" }),
    ).toBe("osm_standard");
  });

  it("returns osm_standard when architect tag is present", () => {
    expect(
      computeOsmTrustLevel({
        architect: "Frank Furness",
        name: "Penn Library",
      }),
    ).toBe("osm_standard");
  });

  it("returns osm_standard when building:material tag is present", () => {
    expect(
      computeOsmTrustLevel({
        "building:material": "brick",
        name: "Row House",
      }),
    ).toBe("osm_standard");
  });

  it("returns osm_standard when alt_name tag is present", () => {
    expect(
      computeOsmTrustLevel({
        alt_name: "The Old Market",
        name: "Reading Terminal",
      }),
    ).toBe("osm_standard");
  });

  it("returns osm_standard for denomination+operator with no start_date", () => {
    // This is the Olivet Covenant Presbyterian Church case:
    // denomination and operator are present but no start_date, wikidata,
    // wikipedia, historic, or description. Must be osm_standard — not
    // osm_enriched — so no founding date or decade claim is permitted.
    expect(
      computeOsmTrustLevel({
        denomination: "presbyterian",
        operator: "Presbyterian Church (U.S.A.)",
        name: "Olivet Covenant Presbyterian Church",
        amenity: "place_of_worship",
      }),
    ).toBe("osm_standard");
  });
});

describe("computeOsmTrustLevel — osm_bare", () => {
  it("returns osm_bare when only name and amenity are present", () => {
    expect(
      computeOsmTrustLevel({ amenity: "place_of_worship", name: "A Church" }),
    ).toBe("osm_bare");
  });

  it("returns osm_bare for empty tags", () => {
    expect(computeOsmTrustLevel({})).toBe("osm_bare");
  });

  it("returns osm_bare for tags with only address fields", () => {
    expect(
      computeOsmTrustLevel({
        "addr:housenumber": "608",
        "addr:street": "North 22nd Street",
        "addr:city": "Philadelphia",
        name: "Mystery Building",
      }),
    ).toBe("osm_bare");
  });

  it("returns osm_bare when only building, height, and source are present", () => {
    expect(
      computeOsmTrustLevel({
        building: "yes",
        height: "29.56",
        source: "City of Philadelphia",
        name: "Unnamed Building",
      }),
    ).toBe("osm_bare");
  });

  it("returns osm_bare when religion is present but none of the standard tags", () => {
    // religion alone is not a standard-tier tag
    expect(
      computeOsmTrustLevel({ religion: "christian", name: "A Church" }),
    ).toBe("osm_bare");
  });
});

// ---------------------------------------------------------------------------
// OSM_COPY_RULES prompt text — verify constraint language per tier
// ---------------------------------------------------------------------------

describe("OSM_COPY_RULES.osm_bare — no date/founding/history requirements", () => {
  const rule = OSM_COPY_RULES.osm_bare;

  it("does not require a year or decade in facts", () => {
    // The old rule 6 mandated "at least one specific year/decade" — that must
    // not appear in osm_bare.
    expect(rule).not.toMatch(/year\/decade/);
    expect(rule).not.toMatch(/specific year/);
    expect(rule).not.toMatch(/specific decade/);
  });

  it("explicitly forbids founding claims", () => {
    expect(rule).toMatch(/founding/i);
    expect(rule).toMatch(/no.*founding|founding.*claim/i);
  });

  it("explicitly forbids former uses", () => {
    expect(rule).toMatch(/former use/i);
  });

  it("explicitly forbids dates in copy", () => {
    expect(rule).toMatch(/no dates/i);
  });

  it("explicitly forbids architectural style claims", () => {
    expect(rule).toMatch(/architectural style/i);
  });

  it("instructs observational language only", () => {
    expect(rule).toMatch(/is mapped as|appears to be/i);
  });

  it("instructs to omit yearBuilt entirely", () => {
    expect(rule).toMatch(/omit entirely|Omit entirely/);
  });
});

describe("OSM_COPY_RULES.osm_standard — factual tags allowed, no invented history", () => {
  const rule = OSM_COPY_RULES.osm_standard;

  it("mentions denomination as an allowed factual source", () => {
    expect(rule).toMatch(/denomination/);
  });

  it("mentions operator as an allowed factual source", () => {
    expect(rule).toMatch(/operator/);
  });

  it("forbids inventing founding dates when start_date is absent", () => {
    expect(rule).toMatch(/start_date is absent/i);
    expect(rule).toMatch(/omit any year/i);
  });

  it("forbids inventing former uses", () => {
    expect(rule).toMatch(/former use/i);
    expect(rule).toMatch(/Do NOT invent/);
  });

  it("forbids inventing historical roles", () => {
    expect(rule).toMatch(/historical role/i);
  });

  it("forbids inventing architectural styles not in the tags", () => {
    expect(rule).toMatch(/architectural style/i);
  });

  it("gates yearBuilt on start_date being present in the tags", () => {
    expect(rule).toMatch(/start_date is present/i);
    expect(rule).toMatch(/Otherwise omit/);
  });
});

describe("OSM_COPY_RULES.osm_enriched — historical detail permitted when tag-backed", () => {
  const rule = OSM_COPY_RULES.osm_enriched;

  it("permits specific years when the tags support them", () => {
    expect(rule).toMatch(/specific years.*permitted|years.*are permitted/i);
  });

  it("permits names and events when tag-backed", () => {
    expect(rule).toMatch(/names.*events|events.*permitted/i);
  });

  it("still requires flagging claims not directly in the tags", () => {
    expect(rule).toMatch(/Reportedly/);
  });
});

// ---------------------------------------------------------------------------
// Regression: denomination + operator with NO start_date → osm_standard,
// not osm_enriched, so the copy rules forbid founding-date claims.
// ---------------------------------------------------------------------------

describe("Olivet Covenant regression — denomination+operator, no start_date", () => {
  const tags = {
    amenity: "place_of_worship",
    denomination: "presbyterian",
    operator: "Presbyterian Church (U.S.A.)",
    name: "Olivet Covenant Presbyterian Church",
    building: "yes",
    height: "29.56",
    source: "City of Philadelphia",
  };

  it("classifies as osm_standard (not osm_enriched or osm_bare)", () => {
    expect(computeOsmTrustLevel(tags)).toBe("osm_standard");
  });

  it("osm_standard copy rules say to omit year/founding when start_date is absent", () => {
    const rule = OSM_COPY_RULES.osm_standard;
    // start_date is absent from the tags, so the rules must say to omit it
    expect(rule).toMatch(/start_date is absent/i);
    expect(rule).toMatch(/omit any year.*founding|founding.*claim/i);
  });

  it("osm_standard copy rules do not require a specific year/decade in facts", () => {
    const rule = OSM_COPY_RULES.osm_standard;
    expect(rule).not.toMatch(/year\/decade/);
    expect(rule).not.toMatch(/specific year/);
  });
});
