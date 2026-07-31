import { describe, it, expect } from "vitest";
import {
  isOrdinaryCommercialUse,
  ORDINARY_COMMERCIAL_USE_TAG_KEYS,
  COMMERCIAL_STORY_BEARING_TAGS,
} from "../lib/commercialUseFilter";
import { RESIDENTIAL_STORY_BEARING_TAGS } from "../lib/residentialBuildingFilter";

// ---------------------------------------------------------------------------
// Suppressed — ordinary shop/office/craft with no story-bearing tags
// ---------------------------------------------------------------------------

describe("isOrdinaryCommercialUse — suppressed cases", () => {
  it("suppresses shop=hardware with no story-bearing tags", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "hardware",
        building: "commercial",
        name: "Main Street Hardware",
      }),
    ).toBe(true);
  });

  it("suppresses shop=boutique with no story-bearing tags", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "boutique",
        name: "The Clothes Rack",
      }),
    ).toBe(true);
  });

  it("suppresses shop=clothes with no story-bearing tags", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "clothes",
        name: "Corner Fashions",
      }),
    ).toBe(true);
  });

  it("suppresses office=insurance with no story-bearing tags", () => {
    expect(
      isOrdinaryCommercialUse({
        office: "insurance",
        name: "Downtown Insurance Group",
      }),
    ).toBe(true);
  });

  it("suppresses craft=carpenter with no story-bearing tags", () => {
    expect(
      isOrdinaryCommercialUse({
        craft: "carpenter",
        name: "Smith & Sons Woodworking",
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// start_date does NOT exempt — mirrors residentialBuildingFilter's rule
// ---------------------------------------------------------------------------

describe("isOrdinaryCommercialUse — start_date does not exempt", () => {
  it("suppresses shop=hardware with only start_date=1962", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "hardware",
        start_date: "1962",
        name: "Main Street Hardware",
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story-bearing exemptions — any one of these keeps the place
// ---------------------------------------------------------------------------

describe("isOrdinaryCommercialUse — story-bearing exemptions", () => {
  it("keeps shop=hardware with historic tag", () => {
    // Historic tavern-style case: an ordinary-use tag alongside genuine
    // historic evidence should not be suppressed.
    expect(
      isOrdinaryCommercialUse({
        shop: "alcohol",
        historic: "tavern",
        name: "The Old Tavern",
      }),
    ).toBe(false);
  });

  it("keeps shop=* with wikidata tag", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "books",
        wikidata: "Q12345",
        name: "The Strand",
      }),
    ).toBe(false);
  });

  it("keeps shop=* with wikipedia tag", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "department_store",
        wikipedia: "en:Wanamaker's",
        name: "Wanamaker's",
      }),
    ).toBe(false);
  });

  it("keeps shop=* with architect tag", () => {
    // Architecturally significant commercial building case.
    expect(
      isOrdinaryCommercialUse({
        shop: "boutique",
        architect: "Frank Furness",
        name: "Furness Storefront",
      }),
    ).toBe(false);
  });

  it("keeps shop=* with heritage tag", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "gift",
        heritage: "2",
        name: "Heritage Gift Shop",
      }),
    ).toBe(false);
  });

  it("keeps shop=* with heritage:description tag", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "convenience",
        "heritage:description": "Grade II listed corner shop.",
        name: "Listed Corner Shop",
      }),
    ).toBe(false);
  });

  it("keeps shop=* with ref:nrhp tag", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "general",
        "ref:nrhp": "64000001",
        name: "NRHP General Store",
      }),
    ).toBe(false);
  });

  it("keeps shop=* with description tag", () => {
    // Former bank now used as retail case.
    expect(
      isOrdinaryCommercialUse({
        shop: "clothes",
        description: "Former Second Bank branch converted to retail in 1998.",
        name: "The Old Bank Boutique",
      }),
    ).toBe(false);
  });

  it("keeps office=* with disused:amenity tag (commercial-only addition)", () => {
    expect(
      isOrdinaryCommercialUse({
        office: "coworking",
        "disused:amenity": "bank",
        name: "The Vault Coworking",
      }),
    ).toBe(false);
  });

  it("keeps shop=* when wikidata is present alongside start_date", () => {
    expect(
      isOrdinaryCommercialUse({
        shop: "hardware",
        start_date: "1962",
        wikidata: "Q99999",
        name: "Notable Hardware",
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-triggering cases — confirm no regression on existing category paths
// ---------------------------------------------------------------------------

describe("isOrdinaryCommercialUse — non-triggering cases", () => {
  it("returns false for amenity=restaurant with no shop/office/craft tag", () => {
    // Already handled via the existing category-priority / GENERIC_COMMERCIAL_CATEGORIES path.
    expect(
      isOrdinaryCommercialUse({
        amenity: "restaurant",
        name: "Ordinary Restaurant",
      }),
    ).toBe(false);
  });

  it("returns false for building=retail with no shop/office/craft tag", () => {
    // Bare named building case — building alone is not evidence of ordinary use.
    expect(
      isOrdinaryCommercialUse({
        building: "retail",
        name: "Some Named Building",
      }),
    ).toBe(false);
  });

  it("returns false for empty tags", () => {
    expect(isOrdinaryCommercialUse({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exported constants — sanity checks
// ---------------------------------------------------------------------------

describe("ORDINARY_COMMERCIAL_USE_TAG_KEYS — expected values", () => {
  it("includes shop", () =>
    expect(ORDINARY_COMMERCIAL_USE_TAG_KEYS.has("shop")).toBe(true));
  it("includes office", () =>
    expect(ORDINARY_COMMERCIAL_USE_TAG_KEYS.has("office")).toBe(true));
  it("includes craft", () =>
    expect(ORDINARY_COMMERCIAL_USE_TAG_KEYS.has("craft")).toBe(true));
  it("does NOT include amenity", () =>
    expect(ORDINARY_COMMERCIAL_USE_TAG_KEYS.has("amenity")).toBe(false));
  it("does NOT include building", () =>
    expect(ORDINARY_COMMERCIAL_USE_TAG_KEYS.has("building")).toBe(false));
});

describe("COMMERCIAL_STORY_BEARING_TAGS — expected values", () => {
  it("includes wikidata", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("wikidata")).toBe(true));
  it("includes wikipedia", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("wikipedia")).toBe(true));
  it("includes historic", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("historic")).toBe(true));
  it("includes heritage", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("heritage")).toBe(true));
  it("includes heritage:description", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("heritage:description")).toBe(
      true,
    ));
  it("includes ref:nrhp", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("ref:nrhp")).toBe(true));
  it("includes description", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("description")).toBe(true));
  it("includes architect", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("architect")).toBe(true));
  it("includes disused:amenity (commercial-only addition)", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("disused:amenity")).toBe(true));
  it("does NOT include start_date", () =>
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("start_date")).toBe(false));
});

// ---------------------------------------------------------------------------
// Structural independence guardrail — the two override Sets must never be
// the same instance, and disused:amenity must not leak into the residential
// filter's set.
// ---------------------------------------------------------------------------

describe("COMMERCIAL_STORY_BEARING_TAGS vs RESIDENTIAL_STORY_BEARING_TAGS — independence", () => {
  it("are not the same Set instance", () => {
    expect(COMMERCIAL_STORY_BEARING_TAGS as unknown as Set<string>).not.toBe(
      RESIDENTIAL_STORY_BEARING_TAGS as unknown as Set<string>,
    );
  });

  it("RESIDENTIAL_STORY_BEARING_TAGS does NOT include disused:amenity", () => {
    expect(RESIDENTIAL_STORY_BEARING_TAGS.has("disused:amenity")).toBe(false);
  });

  it("COMMERCIAL_STORY_BEARING_TAGS DOES include disused:amenity", () => {
    expect(COMMERCIAL_STORY_BEARING_TAGS.has("disused:amenity")).toBe(true);
  });
});
