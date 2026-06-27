import { describe, it, expect } from "vitest";
import {
  isBoringResidentialBuilding,
  RESIDENTIAL_BUILDING_TYPES,
  RESIDENTIAL_STORY_BEARING_TAGS,
} from "../lib/residentialBuildingFilter";

// ---------------------------------------------------------------------------
// Suppressed — plain residential buildings with no story-bearing tags
// ---------------------------------------------------------------------------

describe("isBoringResidentialBuilding — suppressed cases", () => {
  it("suppresses building=apartments with no story-bearing tags", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        name: "Victory Apartments",
      }),
    ).toBe(true);
  });

  it("suppresses building=residential with no story-bearing tags", () => {
    expect(
      isBoringResidentialBuilding({
        building: "residential",
        name: "Some Block",
      }),
    ).toBe(true);
  });

  it("suppresses building=flats with no story-bearing tags", () => {
    expect(
      isBoringResidentialBuilding({
        building: "flats",
        name: "Riverside Flats",
      }),
    ).toBe(true);
  });

  it("suppresses building=house with no story-bearing tags", () => {
    expect(
      isBoringResidentialBuilding({ building: "house", name: "1234 Main St" }),
    ).toBe(true);
  });

  it("suppresses building=detached with no story-bearing tags", () => {
    expect(
      isBoringResidentialBuilding({
        building: "detached",
        name: "Corner House",
      }),
    ).toBe(true);
  });

  it("suppresses building=semidetached_house with no story-bearing tags", () => {
    expect(
      isBoringResidentialBuilding({
        building: "semidetached_house",
        name: "Semi",
      }),
    ).toBe(true);
  });

  it("suppresses building=terrace with no story-bearing tags", () => {
    expect(
      isBoringResidentialBuilding({
        building: "terrace",
        name: "Park Terrace",
      }),
    ).toBe(true);
  });

  it("suppresses building=dormitory with no story-bearing tags", () => {
    expect(
      isBoringResidentialBuilding({ building: "dormitory", name: "East Hall" }),
    ).toBe(true);
  });

  it("suppresses building=APARTMENTS (uppercase from OSM data)", () => {
    // OSM exports are inconsistent in casing; the filter must be case-insensitive.
    expect(
      isBoringResidentialBuilding({
        building: "APARTMENTS",
        name: "Victory Apartments",
      }),
    ).toBe(true);
  });

  it("suppresses building=Apartments (mixed case)", () => {
    expect(
      isBoringResidentialBuilding({
        building: "Apartments",
        name: "Victory Apartments",
      }),
    ).toBe(true);
  });

  it("suppresses building=apartments with address tags but no story-bearing tags", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        "addr:housenumber": "42",
        "addr:street": "Main Street",
        name: "Main Street Apartments",
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// start_date does NOT exempt — product decision: a date is not a story
// ---------------------------------------------------------------------------

describe("isBoringResidentialBuilding — start_date does not exempt", () => {
  it("suppresses building=apartments with only start_date=1962", () => {
    // A construction date alone causes "Built in 1962…" LLM copy with no story
    // signal, producing an unclassified tier that bypasses downstream filters.
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        start_date: "1962",
        name: "Victory Apartments",
      }),
    ).toBe(true);
  });

  it("suppresses building=house with only start_date=1890", () => {
    expect(
      isBoringResidentialBuilding({
        building: "house",
        start_date: "1890",
        name: "Old House",
      }),
    ).toBe(true);
  });

  it("suppresses building=apartments with start_date + alt_name (both weak)", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        start_date: "1955",
        alt_name: "Victory Arms",
        name: "Victory Apartments",
      }),
    ).toBe(true);
  });

  it("suppresses building=apartments with start_date + operator (both weak)", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        start_date: "1975",
        operator: "City Housing Authority",
        name: "Park View Apartments",
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Weak tags that do NOT exempt on their own
// ---------------------------------------------------------------------------

describe("isBoringResidentialBuilding — other weak tags do not exempt", () => {
  it("suppresses building=apartments with only old_name", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        old_name: "Victory Arms",
        name: "Victory Apartments",
      }),
    ).toBe(true);
  });

  it("suppresses building=apartments with only building:material", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        "building:material": "brick",
        name: "Brick Apartments",
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story-bearing exemptions — any one of these keeps the place
// ---------------------------------------------------------------------------

describe("isBoringResidentialBuilding — story-bearing exemptions", () => {
  it("keeps building=apartments with wikidata tag", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        wikidata: "Q12345",
        name: "The Dakota",
      }),
    ).toBe(false);
  });

  it("keeps building=apartments with wikipedia tag", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        wikipedia: "en:The Ansonia",
        name: "The Ansonia",
      }),
    ).toBe(false);
  });

  it("keeps building=apartments with historic tag", () => {
    // The building was a warehouse converted to apartments and tagged historic=building.
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        historic: "building",
        name: "Lofts at Old Warehouse",
      }),
    ).toBe(false);
  });

  it("keeps building=apartments with heritage tag", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        heritage: "2",
        name: "Heritage Court",
      }),
    ).toBe(false);
  });

  it("keeps building=apartments with heritage:description tag", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        "heritage:description": "Grade II listed residential block.",
        name: "Listed Flats",
      }),
    ).toBe(false);
  });

  it("keeps building=apartments with ref:nrhp tag", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        "ref:nrhp": "64000001",
        name: "NRHP Apartments",
      }),
    ).toBe(false);
  });

  it("keeps building=apartments with description tag", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        description:
          "Former textile mill converted to loft apartments in the 1990s.",
        name: "The Mill Lofts",
      }),
    ).toBe(false);
  });

  it("keeps building=apartments with architect tag", () => {
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        architect: "Frank Furness",
        name: "Furness Flats",
      }),
    ).toBe(false);
  });

  it("keeps building=apartments when wikidata is present alongside start_date", () => {
    // wikidata overrides the weak start_date — place is kept.
    expect(
      isBoringResidentialBuilding({
        building: "apartments",
        start_date: "1962",
        wikidata: "Q99999",
        name: "Notable Apartments",
      }),
    ).toBe(false);
  });

  it("keeps building=house with historic tag", () => {
    expect(
      isBoringResidentialBuilding({
        building: "house",
        historic: "yes",
        name: "Old Stone House",
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-residential buildings pass through unchanged
// ---------------------------------------------------------------------------

describe("isBoringResidentialBuilding — non-residential buildings pass through", () => {
  it("returns false when no building tag is present", () => {
    expect(
      isBoringResidentialBuilding({
        amenity: "place_of_worship",
        name: "St. Mary's",
      }),
    ).toBe(false);
  });

  it("returns false for building=church", () => {
    expect(
      isBoringResidentialBuilding({ building: "church", name: "St. Mary's" }),
    ).toBe(false);
  });

  it("returns false for building=commercial", () => {
    expect(
      isBoringResidentialBuilding({
        building: "commercial",
        name: "Office Block",
      }),
    ).toBe(false);
  });

  it("returns false for building=industrial", () => {
    expect(
      isBoringResidentialBuilding({
        building: "industrial",
        name: "Old Factory",
      }),
    ).toBe(false);
  });

  it("returns false for building=yes (generic tag, not in residential list)", () => {
    expect(
      isBoringResidentialBuilding({ building: "yes", name: "Some Building" }),
    ).toBe(false);
  });

  it("returns false for building=retail", () => {
    expect(
      isBoringResidentialBuilding({ building: "retail", name: "Corner Shop" }),
    ).toBe(false);
  });

  it("returns false for empty tags", () => {
    expect(isBoringResidentialBuilding({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exported constants — sanity checks
// ---------------------------------------------------------------------------

describe("RESIDENTIAL_BUILDING_TYPES — expected values", () => {
  it("includes apartments", () =>
    expect(RESIDENTIAL_BUILDING_TYPES.has("apartments")).toBe(true));
  it("includes residential", () =>
    expect(RESIDENTIAL_BUILDING_TYPES.has("residential")).toBe(true));
  it("includes flats", () =>
    expect(RESIDENTIAL_BUILDING_TYPES.has("flats")).toBe(true));
  it("includes house", () =>
    expect(RESIDENTIAL_BUILDING_TYPES.has("house")).toBe(true));
  it("includes detached", () =>
    expect(RESIDENTIAL_BUILDING_TYPES.has("detached")).toBe(true));
  it("includes semidetached_house", () =>
    expect(RESIDENTIAL_BUILDING_TYPES.has("semidetached_house")).toBe(true));
  it("includes terrace", () =>
    expect(RESIDENTIAL_BUILDING_TYPES.has("terrace")).toBe(true));
  it("includes dormitory", () =>
    expect(RESIDENTIAL_BUILDING_TYPES.has("dormitory")).toBe(true));
});

describe("RESIDENTIAL_STORY_BEARING_TAGS — expected values", () => {
  it("includes wikidata", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("wikidata")).toBe(true));
  it("includes wikipedia", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("wikipedia")).toBe(true));
  it("includes historic", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("historic")).toBe(true));
  it("includes heritage", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("heritage")).toBe(true));
  it("includes heritage:description", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("heritage:description")).toBe(
      true,
    ));
  it("includes ref:nrhp", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("ref:nrhp")).toBe(true));
  it("includes description", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("description")).toBe(true));
  it("includes architect", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("architect")).toBe(true));
  it("does NOT include start_date", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("start_date")).toBe(false));
  it("does NOT include old_name", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("old_name")).toBe(false));
  it("does NOT include alt_name", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("alt_name")).toBe(false));
  it("does NOT include operator", () =>
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("operator")).toBe(false));
});
