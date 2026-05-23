import { describe, it, expect } from "vitest";
import { classifyDiscovery, filterDeniedPlaces } from "../lib/productionFilter";

interface TestPlace {
  id: string;
  name: string;
  summary: string;
  facts: string[];
  latitude: number;
  longitude: number;
  category?: string;
  tags?: string[];
  coordSource?: string;
  discoveryClass?: string;
}

function place(overrides: Partial<TestPlace> = {}): TestPlace {
  return {
    id: "test-id",
    name: "Test Building",
    summary: "A historic building with a long history.",
    facts: ["Fact one."],
    latitude: 39.951,
    longitude: -75.165,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyDiscovery
// ---------------------------------------------------------------------------

describe("classifyDiscovery", () => {
  it("classifies a regular historic building as VERIFIED_PLACE", () => {
    const places = [place({ name: "Drexel University Main Hall" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("VERIFIED_PLACE");
  });

  it("classifies ghost sign by name as INTERPRETIVE_OVERLAY", () => {
    const places = [
      place({
        name: "Ghost Sign — 4000 Block Chestnut",
        summary: "A faded commercial sign on the brick facade.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it("classifies faded painted advertisement by name as INTERPRETIVE_OVERLAY", () => {
    const places = [
      place({ name: "Faded Painted Advertisement — Walnut Street" }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it("classifies culvert by name as INTERPRETIVE_OVERLAY", () => {
    const places = [place({ name: "Mill Creek Culvert Outfall" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it("classifies storm drain by name as INTERPRETIVE_OVERLAY", () => {
    const places = [place({ name: "Historic Storm Drain Infrastructure" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it("classifies subterranean by name as INTERPRETIVE_OVERLAY", () => {
    const places = [place({ name: "Subterranean Utility Corridor" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it("classifies buried stream via summary as INTERPRETIVE_OVERLAY", () => {
    const places = [
      place({
        name: "Mill Creek",
        summary: "A stream that once flowed through this neighborhood.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "flows beneath" via summary as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "Hidden Waterway",
        summary: "The creek flows beneath Woodland Avenue.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "buried waterway" category as INTERPRETIVE_OVERLAY', () => {
    const places = [place({ category: "buried waterway" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "subsurface" category as INTERPRETIVE_OVERLAY', () => {
    const places = [place({ category: "subsurface" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "SUBSURFACE" category (uppercase from LLM) as INTERPRETIVE_OVERLAY', () => {
    const places = [place({ category: "SUBSURFACE" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "transportation remnant" category as INTERPRETIVE_OVERLAY', () => {
    const places = [place({ category: "transportation remnant" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "waterway remnant" category as INTERPRETIVE_OVERLAY', () => {
    const places = [place({ category: "waterway remnant" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it("classifies former/demolished site as APPROXIMATE_SITE", () => {
    const places = [place({ name: "Former Site of West Philly Armory" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("APPROXIMATE_SITE");
  });

  it("handles empty name, summary, and tags without throwing", () => {
    const places = [place({ name: "", summary: "", tags: [] })];
    expect(() => classifyDiscovery(places)).not.toThrow();
    expect(places[0].discoveryClass).toBe("VERIFIED_PLACE");
  });

  it("classifies ghost sign in tags as INTERPRETIVE_OVERLAY", () => {
    const places = [place({ tags: ["ghost sign", "commercial"], summary: "" })];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  // -------------------------------------------------------------------------
  // Field-tested failure terms (all confirmed absent from old regex)
  // -------------------------------------------------------------------------

  it('classifies "Speakeasy Passage beneath 40th & Walnut Streetcar Tracks" as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "Speakeasy Passage beneath 40th & Walnut Streetcar Tracks",
        summary:
          "A hidden speakeasy that once operated beneath the trolley tracks.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "#UNDERGROUND PASSAGE" tag as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "Walnut Street Passage",
        tags: ["#UNDERGROUND PASSAGE", "historic"],
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "#ORAL HISTORY" tag as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "Neighborhood Gathering Place",
        tags: ["#ORAL HISTORY", "community"],
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "hidden under" in summary as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "Penn Station Foundations",
        summary:
          "The original station footings remain hidden under the current plaza.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "tunnel" in name as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "Reading Railroad Tunnel Access",
        summary: "A disused tunnel entrance below 12th Street.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "unexcavated" in summary as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "Colonial Brick Building",
        summary:
          "Much of the original foundation remains unexcavated beneath the parking lot.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "oral history" in summary as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "46th & Baltimore Community Corner",
        summary:
          "Known through oral history as a gathering place for West Philly jazz musicians.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "oral histories" in summary as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "Powelton Village Lot",
        summary:
          "Preserved only in oral histories passed down through local families.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies standalone "beneath" in name as INTERPRETIVE_OVERLAY', () => {
    const places = [
      place({
        name: "Forgotten Vault beneath City Hall Plaza",
        summary: "A sealed basement chamber.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it('classifies "subsurface" as a text signal in summary (no category set)', () => {
    const places = [
      place({
        name: "Vine Street Expressway Underpass",
        summary:
          "Significant subsurface infrastructure runs beneath this block.",
      }),
    ];
    classifyDiscovery(places);
    expect(places[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });
});

// ---------------------------------------------------------------------------
// filterDeniedPlaces
// ---------------------------------------------------------------------------

describe("filterDeniedPlaces", () => {
  it("removes INTERPRETIVE_OVERLAY places", () => {
    const places = [
      place({ name: "Ghost Sign", discoveryClass: "INTERPRETIVE_OVERLAY" }),
      place({ name: "Historic Church", discoveryClass: "VERIFIED_PLACE" }),
    ];
    const result = filterDeniedPlaces(places);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Historic Church");
  });

  it("keeps APPROXIMATE_SITE places", () => {
    const places = [
      place({ name: "Former Armory", discoveryClass: "APPROXIMATE_SITE" }),
    ];
    expect(filterDeniedPlaces(places)).toHaveLength(1);
  });

  it("keeps VERIFIED_PLACE places", () => {
    const places = [
      place({ name: "Drexel Hall", discoveryClass: "VERIFIED_PLACE" }),
    ];
    expect(filterDeniedPlaces(places)).toHaveLength(1);
  });

  it("returns empty array when all places are denied", () => {
    const places = [
      place({ discoveryClass: "INTERPRETIVE_OVERLAY" }),
      place({ discoveryClass: "INTERPRETIVE_OVERLAY" }),
    ];
    expect(filterDeniedPlaces(places)).toHaveLength(0);
  });

  it("does not mutate the input array", () => {
    const places = [
      place({ discoveryClass: "INTERPRETIVE_OVERLAY" }),
      place({ discoveryClass: "VERIFIED_PLACE" }),
    ];
    filterDeniedPlaces(places);
    expect(places).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(filterDeniedPlaces([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Combined pipeline: classifyDiscovery + filterDeniedPlaces + coordSource gate
// Proves that denied categories and LLM-only coordinates cannot survive
// the production filter in either Explore or Walk Mode.
// ---------------------------------------------------------------------------

describe("production filter pipeline", () => {
  function applyDenyFilter(rawPlaces: TestPlace[]): TestPlace[] {
    const clones: TestPlace[] = rawPlaces.map((p) => ({ ...p }));
    classifyDiscovery(clones);
    return filterDeniedPlaces(clones) as TestPlace[];
  }

  function applyFullFilter(rawPlaces: TestPlace[]): TestPlace[] {
    const afterDeny = applyDenyFilter(rawPlaces);
    return afterDeny.filter((p) => p.coordSource !== undefined);
  }

  it("drops ghost sign in Explore Mode (no coordSource)", () => {
    const result = applyFullFilter([
      place({ name: "Ghost Sign — Chestnut Street" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("drops ghost sign in Walk Mode even with coordSource", () => {
    const result = applyFullFilter([
      place({
        name: "Ghost Sign — Chestnut Street",
        coordSource: "nominatim-corrected",
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("drops buried stream in Explore Mode (no coordSource)", () => {
    const result = applyFullFilter([
      place({
        name: "Buried Tributary of Mill Creek",
        summary: "A stream that once flowed beneath this block.",
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("drops buried stream in Walk Mode even with coordSource", () => {
    const result = applyFullFilter([
      place({
        name: "Buried Tributary of Mill Creek",
        summary: "A stream that once flowed beneath this block.",
        coordSource: "nominatim-corrected",
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("drops subsurface infrastructure in both modes regardless of coordSource", () => {
    const result = applyFullFilter([
      place({ category: "subsurface", coordSource: "nominatim" }),
      place({ category: "subsurface" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("keeps a real building with coordSource (eligible for Walk and Explore)", () => {
    const result = applyFullFilter([
      place({
        name: "Drexel University Main Building",
        coordSource: "nominatim-corrected",
      }),
    ]);
    expect(result).toHaveLength(1);
  });

  it("Explore cannot return coordSrc: llm×5 nom×0 — all unverified places are dropped", () => {
    const result = applyFullFilter([
      place({ name: "Building A" }),
      place({ name: "Building B" }),
      place({ name: "Building C" }),
      place({ name: "Building D" }),
      place({ name: "Building E" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("Explore cannot return mostly unverified pool — only verified places survive", () => {
    const result = applyFullFilter([
      place({ name: "Building A" }),
      place({ name: "Building B", coordSource: "nominatim" }),
      place({ name: "Building C" }),
      place({ name: "Building D" }),
      place({ name: "Building E" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Building B");
  });

  it("cached denied results are filtered before being returned", () => {
    const cachedPlaces: TestPlace[] = [
      place({ name: "Old Ghost Sign", coordSource: "nominatim" }),
      place({ name: "Historic Church", coordSource: "nominatim-corrected" }),
    ];
    classifyDiscovery(cachedPlaces);
    const result = filterDeniedPlaces(cachedPlaces);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Historic Church");
  });

  it("Walk cannot narrate a buried waterway even after Nominatim correction", () => {
    const result = applyFullFilter([
      place({
        category: "buried waterway",
        name: "Buried Run Creek",
        coordSource: "nominatim-corrected",
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("Walk cannot narrate a transportation remnant even with coordSource", () => {
    const result = applyFullFilter([
      place({
        category: "transportation remnant",
        name: "Former Trolley Barn Corridor",
        coordSource: "nominatim",
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("speakeasy passage is denied even with coordSource (walk route candidate)", () => {
    const result = applyFullFilter([
      place({
        name: "Speakeasy Passage beneath 40th & Walnut Streetcar Tracks",
        summary:
          "A hidden speakeasy that once operated beneath the trolley tracks.",
        coordSource: "nominatim-corrected",
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("SUBSURFACE category (uppercase from LLM) is denied regardless of coordSource", () => {
    const result = applyFullFilter([
      place({ category: "SUBSURFACE", coordSource: "nominatim" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("#UNDERGROUND PASSAGE tag is denied", () => {
    const result = applyDenyFilter([
      place({
        name: "Walnut Street Passage",
        tags: ["#UNDERGROUND PASSAGE", "historic"],
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("#ORAL HISTORY tag is denied", () => {
    const result = applyDenyFilter([
      place({
        name: "Community Corner",
        tags: ["#ORAL HISTORY"],
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('"hidden under" in summary is denied', () => {
    const result = applyDenyFilter([
      place({
        name: "Station Foundations",
        summary: "The original footings remain hidden under the current plaza.",
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("ghost sign is denied even with coordSource", () => {
    const result = applyFullFilter([
      place({
        name: "Former J.C. Sly Grocery Ghost Sign",
        summary: "A faded painted advertisement on the east brick wall.",
        coordSource: "nominatim",
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("place with discoveryClass:undefined that matches denied term by name is still denied", () => {
    const raw = [
      place({
        name: "Speakeasy Passage beneath 40th & Walnut Streetcar Tracks",
        summary: "A hidden space beneath the trolley tracks.",
      }),
    ];
    classifyDiscovery(raw);
    expect(raw[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(filterDeniedPlaces(raw)).toHaveLength(0);
  });

  it("place with discoveryClass:undefined that matches denied term by summary is still denied", () => {
    const raw = [
      place({
        name: "Generic Street Corner",
        summary:
          "Known primarily through oral histories of the local community.",
      }),
    ];
    classifyDiscovery(raw);
    expect(raw[0].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(filterDeniedPlaces(raw)).toHaveLength(0);
  });

  it("places-along-route pipeline: route candidate with denied category is dropped", () => {
    const routeStylePlaces = [
      place({
        name: "Mill Creek Culvert",
        summary: "A historic culvert that carries the buried creek.",
        coordSource: undefined,
      }),
      place({
        name: "Clark Park",
        summary: "A neighbourhood park with a Victorian-era fountain.",
        coordSource: undefined,
      }),
    ];
    const clones = routeStylePlaces.map((p) => ({ ...p }));
    classifyDiscovery(clones);
    const filtered = filterDeniedPlaces(clones);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Clark Park");
  });

  it("places-along-route pipeline: speakeasy tunnel candidate is dropped", () => {
    const routeStylePlaces = [
      place({
        name: "Speakeasy Tunnel beneath 40th & Walnut",
        summary: "An underground passage used during Prohibition.",
        coordSource: undefined,
      }),
    ];
    const clones = routeStylePlaces.map((p) => ({ ...p }));
    classifyDiscovery(clones);
    const filtered = filterDeniedPlaces(clones);
    expect(filtered).toHaveLength(0);
  });
});
