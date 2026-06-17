import { describe, it, expect } from "vitest";
import {
  classifyDiscovery,
  filterDeniedPlaces,
  filterExploreTier4,
  suppressApproxDuplicates,
} from "../lib/productionFilter";

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
  spatialSuppression?: string;
  trustLevel?: string;
  autoNarrationBlocked?: boolean;
  discoveryTier?: number;
  discoveryRejectionReason?: string;
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
// Shared pipeline helpers — used by both describe blocks below.
// ---------------------------------------------------------------------------

function applyDenyFilter(rawPlaces: TestPlace[]): TestPlace[] {
  const clones: TestPlace[] = rawPlaces.map((p) => ({ ...p }));
  classifyDiscovery(clones);
  return filterDeniedPlaces(clones) as TestPlace[];
}

function applyFullFilter(rawPlaces: TestPlace[]): TestPlace[] {
  const afterDeny = applyDenyFilter(rawPlaces);
  return afterDeny.filter((p) => p.coordSource !== undefined);
}

// ---------------------------------------------------------------------------
// Combined pipeline: classifyDiscovery + filterDeniedPlaces + coordSource gate
// Proves that denied categories and LLM-only coordinates cannot survive
// the production filter in either Explore or Walk Mode.
// ---------------------------------------------------------------------------

describe("production filter pipeline", () => {
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

  it("keeps a real building with coordSource=nominatim-corrected (eligible for Walk and Explore)", () => {
    const result = applyFullFilter([
      place({
        name: "Drexel University Main Building",
        coordSource: "nominatim-corrected",
      }),
    ]);
    expect(result).toHaveLength(1);
  });

  it("keeps a well-known landmark with coordSource=nominatim-confirmed (Chicago Loop fix)", () => {
    // Represents the case where the LLM already placed a pin accurately —
    // Nominatim confirms the location within the correction threshold so the
    // pin is not moved but coordSource is set to "nominatim-confirmed".
    // This place must survive the coordSource gate (was previously dropped).
    const result = applyFullFilter([
      place({
        name: "Willis Tower",
        coordSource: "nominatim-confirmed",
        latitude: 41.8789,
        longitude: -87.6359,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].coordSource).toBe("nominatim-confirmed");
  });

  it("nominatim-confirmed place is still denied when category is INTERPRETIVE_OVERLAY", () => {
    // Nominatim confirmation does not exempt a place from the deny list.
    const result = applyFullFilter([
      place({
        name: "Buried Creek Beneath the Loop",
        summary: "A waterway that once flowed beneath this block.",
        coordSource: "nominatim-confirmed",
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("mixed pool: nominatim-confirmed survives, unverified is dropped", () => {
    // Chicago Loop scenario: famous landmark (confirmed) + LLM-only place (no coordSource).
    const result = applyFullFilter([
      place({
        name: "Chicago Board of Trade",
        coordSource: "nominatim-confirmed",
      }),
      place({ name: "Some Vague Historic Corner" }), // no coordSource — dropped
      place({ name: "Rookery Building", coordSource: "nominatim-confirmed" }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.name)).toEqual([
      "Chicago Board of Trade",
      "Rookery Building",
    ]);
  });

  it("coordSource undefined (unprobed/error): all places are dropped by coordSource gate", () => {
    // Places with no coordSource at all (verification never ran or an
    // unexpected code path). These are distinct from coordSource="llm"
    // (Nominatim was probed but returned zero results, which IS an expected
    // outcome and those places survive to Explore).
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

// ---------------------------------------------------------------------------
// Address-only retry path — pipeline contract
//
// verifyPlaceCoordinates retries with address-only when the combined
// name+address Nominatim query returns 0 results.  These tests verify the
// pipeline contracts that the retry path must satisfy:
//
//   1. Retry succeeds, pin is already accurate (moveBy ≤ threshold):
//      coordSource = "nominatim-confirmed", place survives coordSource gate.
//   2. Retry succeeds, pin is wrong (moveBy > threshold):
//      coordSource = "nominatim-corrected", place survives coordSource gate.
//   3. Both combined and address-only fail:
//      coordSource remains undefined, place is dropped by coordSource gate.
//   4. Retry confirms an INTERPRETIVE_OVERLAY place:
//      coordSource gate is irrelevant — deny filter rejects it first.
// ---------------------------------------------------------------------------

describe("address-only retry path — coordSource pipeline contracts", () => {
  it("retry succeeds, moveBy ≤ threshold: coordSource='nominatim-confirmed', place survives", () => {
    // Combined "Rookery Building 209 S LaSalle St Chicago" → 0 results.
    // Address-only "209 S LaSalle St Chicago" → result within threshold.
    // verifyPlaceCoordinates sets coordSource = "nominatim-confirmed".
    const result = applyFullFilter([
      place({
        name: "Rookery Building",
        coordSource: "nominatim-confirmed",
        latitude: 41.8796,
        longitude: -87.6322,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].coordSource).toBe("nominatim-confirmed");
  });

  it("retry succeeds, moveBy > threshold: coordSource='nominatim-corrected', place survives", () => {
    // Combined "Chicago Board of Trade 141 W Jackson" → 0 results.
    // Address-only "141 W Jackson Chicago" → result >80m from LLM pin.
    // verifyPlaceCoordinates sets coordSource = "nominatim-corrected".
    const result = applyFullFilter([
      place({
        name: "Chicago Board of Trade",
        coordSource: "nominatim-corrected",
        latitude: 41.8779,
        longitude: -87.632,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].coordSource).toBe("nominatim-corrected");
  });

  it("both combined and address-only fail: coordSource='llm', autoNarrationBlocked=true, place survives to Explore", () => {
    // Neither query returns usable Nominatim results → verifyPlaceCoordinates
    // sets coordSource="llm" and autoNarrationBlocked=true. The place is an
    // obscure historical site not in OSM; it survives the coordSource gate so
    // Explore can show it as a low-confidence discovery.
    const result = applyFullFilter([
      place({
        name: "LLM-Only Historic Corner",
        coordSource: "llm",
        autoNarrationBlocked: true,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].coordSource).toBe("llm");
    expect(result[0].autoNarrationBlocked).toBe(true);
  });

  it("INTERPRETIVE_OVERLAY is denied even when address-only confirmation sets coordSource", () => {
    // The deny filter (classifyDiscovery + filterDeniedPlaces) runs before the
    // coordSource gate, so a buried-waterway place cannot survive regardless of
    // how it was geocoded.
    const result = applyFullFilter([
      place({
        name: "Buried Chicago River Tributary",
        summary: "A waterway that once flowed beneath these streets.",
        coordSource: "nominatim-confirmed",
      }),
    ]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// coordSource "llm" tier — Nominatim-unprobed Explore-only places
//
// When verifyPlaceCoordinates probes Nominatim and receives zero results for
// both the combined name+address query and the address-only retry, it sets:
//   coordSource      = "llm"
//   autoNarrationBlocked = true
//
// "llm" is NOT the same as undefined:
//   undefined = verification never ran (error / unprobed state) → always dropped
//   "llm"     = Nominatim was probed but had no POI entry → allowed in Explore
//
// Contracts:
//   1. coordSource="llm" passes the coordSource gate (Explore receives it).
//   2. autoNarrationBlocked=true is preserved so Walk walkEligibility blocks it.
//   3. Mixed pool: llm + nominatim-confirmed/corrected all reach Explore.
//   4. _rejectOutOfArea (Nominatim found the address elsewhere) is distinct —
//      those places are dropped by postProcessPlaces before reaching this gate.
//   5. INTERPRETIVE_OVERLAY with coordSource="llm" is still denied by the deny
//      filter (which runs before the coordSource gate).
// ---------------------------------------------------------------------------

describe("coordSource 'llm' tier — Nominatim-unprobed Explore-only places", () => {
  it("coordSource='llm' passes the coordSource gate and reaches Explore", () => {
    // verifyPlaceCoordinates probed Nominatim, got zero results → coordSource="llm".
    // The production filter allows it through so Explore can show the place.
    const result = applyFullFilter([
      place({
        name: "Former Fairmount Almshouse",
        coordSource: "llm",
        autoNarrationBlocked: true,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].coordSource).toBe("llm");
  });

  it("autoNarrationBlocked=true is preserved on coordSource='llm' places", () => {
    // The flag must reach the client so Walk Mode walkEligibility blocks these
    // places from auto-narration as a defence-in-depth layer.
    const result = applyFullFilter([
      place({
        name: "Former Fairmount Almshouse",
        coordSource: "llm",
        autoNarrationBlocked: true,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].autoNarrationBlocked).toBe(true);
  });

  it("mixed pool: llm-sourced and nominatim-verified places all survive to Explore", () => {
    // Fairmount scenario: well-known landmarks confirmed by Nominatim plus
    // obscure historical sites Nominatim has no record of — both reach Explore.
    const result = applyFullFilter([
      place({
        name: "Eastern State Penitentiary",
        coordSource: "nominatim-confirmed",
      }),
      place({
        name: "Former Almshouse Site",
        coordSource: "llm",
        autoNarrationBlocked: true,
      }),
      place({
        name: "Fairmount Water Works",
        coordSource: "nominatim-corrected",
      }),
    ]);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.coordSource)).toEqual([
      "nominatim-confirmed",
      "llm",
      "nominatim-corrected",
    ]);
  });

  it("coordSource='llm' INTERPRETIVE_OVERLAY is still denied by the deny filter", () => {
    // The deny filter (classifyDiscovery + filterDeniedPlaces) runs before the
    // coordSource gate; a buried-waterway place is dropped regardless of
    // whether coordSource is "llm" or "nominatim-confirmed".
    const result = applyFullFilter([
      place({
        name: "Buried Stream beneath Fairmount",
        summary: "A waterway that once flowed beneath these streets.",
        coordSource: "llm",
        autoNarrationBlocked: true,
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("coordSource undefined is still dropped — distinct from 'llm'", () => {
    // undefined means verification never ran (unexpected/unprobed state).
    // 'llm' means Nominatim was probed but had no record.
    // Both are Explore-unsafe from a Walk perspective, but only 'llm' is allowed
    // through to Explore. undefined remains a hard drop.
    const result = applyFullFilter([
      place({ name: "Unprobed Place" }), // coordSource: undefined
    ]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// suppressApproxDuplicates
// ---------------------------------------------------------------------------

describe("suppressApproxDuplicates", () => {
  it("promotes APPROXIMATE_SITE to INTERPRETIVE_OVERLAY when it shares a keyword with a nearby osm_enriched VERIFIED_PLACE", () => {
    const places = [
      place({
        name: "Bergdoll-Kemble Mansion",
        discoveryClass: "VERIFIED_PLACE",
        trustLevel: "osm_enriched",
        latitude: 39.9658,
        longitude: -75.1744,
      }),
      place({
        name: "Bergdoll Family Brewery Site",
        discoveryClass: "APPROXIMATE_SITE",
        latitude: 39.9665, // ~80 m from the mansion
        longitude: -75.1755,
      }),
    ];
    suppressApproxDuplicates(places);
    expect(places[1].discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(places[1].spatialSuppression).toBe(
      "approxDuplicateOfNearbyVerified",
    );
    expect(places[0].discoveryClass).toBe("VERIFIED_PLACE"); // unchanged
  });

  it("does NOT suppress when the APPROXIMATE_SITE is beyond the distance threshold", () => {
    const places = [
      place({
        name: "Bergdoll-Kemble Mansion",
        discoveryClass: "VERIFIED_PLACE",
        trustLevel: "osm_enriched",
        latitude: 39.9658,
        longitude: -75.1744,
      }),
      place({
        name: "Bergdoll Family Brewery Site",
        discoveryClass: "APPROXIMATE_SITE",
        latitude: 39.97, // ~1.2 km away — beyond 200 m threshold
        longitude: -75.19,
      }),
    ];
    suppressApproxDuplicates(places);
    expect(places[1].discoveryClass).toBe("APPROXIMATE_SITE");
  });

  it("does NOT suppress when no significant keyword overlaps between the two names", () => {
    const places = [
      place({
        name: "Bergdoll-Kemble Mansion",
        discoveryClass: "VERIFIED_PLACE",
        trustLevel: "osm_enriched",
        latitude: 39.9658,
        longitude: -75.1744,
      }),
      place({
        name: "Fairmount Water Works",
        discoveryClass: "APPROXIMATE_SITE",
        latitude: 39.966, // close, but no keyword overlap
        longitude: -75.1746,
      }),
    ];
    suppressApproxDuplicates(places);
    expect(places[1].discoveryClass).toBe("APPROXIMATE_SITE");
  });
});

// ---------------------------------------------------------------------------
// filterExploreTier4
// ---------------------------------------------------------------------------

describe("filterExploreTier4", () => {
  it("removes a Tier-4 place", () => {
    const places = [
      place({ discoveryTier: 4, discoveryRejectionReason: "metadataOnly" }),
    ];
    expect(filterExploreTier4(places)).toHaveLength(0);
  });

  it("keeps a Tier-1 place", () => {
    const places = [place({ discoveryTier: 1 })];
    expect(filterExploreTier4(places)).toHaveLength(1);
  });

  it("keeps a Tier-2 place", () => {
    const places = [place({ discoveryTier: 2 })];
    expect(filterExploreTier4(places)).toHaveLength(1);
  });

  it("keeps a Tier-3 place", () => {
    const places = [place({ discoveryTier: 3 })];
    expect(filterExploreTier4(places)).toHaveLength(1);
  });

  it("keeps a place with no discoveryTier (unclassified)", () => {
    const places = [place()];
    expect(filterExploreTier4(places)).toHaveLength(1);
  });

  it("removes only Tier-4 from a mixed array", () => {
    const places = [
      place({ discoveryTier: 1 }),
      place({
        discoveryTier: 4,
        discoveryRejectionReason: "noHistoricalDepth",
      }),
      place(), // unclassified
      place({ discoveryTier: 2 }),
      place({ discoveryTier: 4, discoveryRejectionReason: "metadataOnly" }),
    ];
    const result = filterExploreTier4(places);
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.discoveryTier !== 4)).toBe(true);
  });

  it("does not mutate the input array", () => {
    const places = [place({ discoveryTier: 4 }), place({ discoveryTier: 1 })];
    const original = [...places];
    filterExploreTier4(places);
    expect(places).toHaveLength(original.length);
  });

  it("returns an empty array unchanged", () => {
    expect(filterExploreTier4([])).toHaveLength(0);
  });
});
