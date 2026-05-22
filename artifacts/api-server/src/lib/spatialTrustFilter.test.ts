import { describe, expect, it } from "vitest";

import { applyLlmPrecisionFilter } from "./spatialTrustFilter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlace(overrides: Record<string, unknown>) {
  return {
    discoveryClass: "VERIFIED_PLACE",
    spatialSuppression: undefined as string | undefined,
    coordSource: undefined as string | undefined,
    name: "Test Place",
    summary: "A generic test summary with no street references.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rejection cases — field-test examples from Fairmount GPS 39.966/−75.174
// ---------------------------------------------------------------------------

describe("applyLlmPrecisionFilter — rejection cases", () => {
  it("rejects 'Former Hitching Post Site at 39th & Market' with LLM-only coords", () => {
    const p = makePlace({
      name: "Former Hitching Post Site at 39th & Market",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects 'Former Hitching Post Site at 39th & Market' even when coordSource is set", () => {
    // Nominatim may set coordSource by matching a nearby address token rather
    // than confirming the actual 39th & Market intersection. The
    // intersection-in-name pattern is an LLM confabulation signature that must
    // be caught regardless of coordinate verification status.
    const p = makePlace({
      name: "Former Hitching Post Site at 39th & Market",
      coordSource: "nominatim-corrected",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects '4101 Market Street Historical Building' with LLM-only coords", () => {
    // "Market Street" matches SPECIFIC_LOC_TEXT_RE in the prose check path.
    const p = makePlace({
      name: "4101 Market Street Historical Building",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects 'Buried Tributary of Mill Creek' whose summary mentions Walnut Street", () => {
    // The name is generic, but the summary contains "Walnut Street" —
    // sufficient to trigger SPECIFIC_LOC_TEXT_RE on LLM-only places.
    const p = makePlace({
      name: "Buried Tributary of Mill Creek",
      summary:
        "Buried stream running under Walnut Street near 33rd Street, West Philadelphia.",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects an intersection claim using 'and' instead of '&'", () => {
    const p = makePlace({
      name: "Historic Tavern at 22nd and Chestnut",
      coordSource: "nominatim-corrected",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects a place with ordinal street in name and no coordSource", () => {
    const p = makePlace({
      name: "Former Ice House on 33rd Street",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
  });

  it("rejects a named-street claim in the name even when coordSource is set", () => {
    // Rule 3: SPECIFIC_LOC_TEXT_RE applies to the NAME universally, regardless
    // of coordSource. A place whose identity-name asserts a specific street
    // has an unverifiable coordinate claim even if Nominatim verified nearby
    // coordinates via an address token.
    const p = makePlace({
      name: "Old Warehouse on Market Street",
      summary: "A historic warehouse building.",
      coordSource: "nominatim-corrected",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects 'Old Sewer Entrance Grate on West Diamond Street' even when coordSource is set", () => {
    // Field-test case: this exact place was narrated in Walk Mode because the
    // old code bypassed SPECIFIC_LOC_TEXT_RE when coordSource was present.
    // "West Diamond Street" → SPECIFIC_LOC_TEXT_RE matches on the name →
    // downgrade regardless of coordSource.
    const p = makePlace({
      name: "Old Sewer Entrance Grate on West Diamond Street",
      summary: "A historic sewer infrastructure element.",
      coordSource: "nominatim-corrected",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  // ---------------------------------------------------------------------------
  // ADDRESS_RANGE_RE (Rule 3.5) — field-test case: Fairmount GPS 39.966/−75.174
  // "Former Political Machine Clubhouse, 3408–10 Spruce Street" was narrated
  // in Walk Mode near Fairmount even though 3408 Spruce is in West Philadelphia
  // (~2.5 km away). Root cause: the en-dash range format "3408–10" caused
  // ADDRESS_RX in verifyAddressCoherence to skip the coherence probe entirely.
  // Rule 3.5 adds a pattern-level backstop for when the full address string is
  // embedded in the NAME.
  // ---------------------------------------------------------------------------

  it("rejects 'Former Political Machine Clubhouse, 3408–10 Spruce Street' (en-dash range in name) regardless of coordSource", () => {
    // Field-test case. When the LLM embeds the full address in the name, the
    // place is rejected. "Spruce Street" (full-form) is caught by Rule 3
    // (SPECIFIC_LOC_TEXT_RE) before Rule 3.5 fires — so the suppression reason
    // is "llmCoordWithSpecificLocationText". The critical check is that
    // discoveryClass is downgraded regardless of coordSource.
    const p = makePlace({
      name: "Former Political Machine Clubhouse, 3408–10 Spruce Street",
      summary:
        "A rowhouse used by a Democratic ward organization in the early 20th century.",
      coordSource: "nominatim-corrected",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    // Rule 3 fires first: SPECIFIC_LOC_TEXT_RE matches "Spruce Street" (full form)
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects '3408–10 Spruce Street' as a standalone place name (en-dash range, full form caught by Rule 3)", () => {
    // Full-form "Spruce Street" is caught by SPECIFIC_LOC_TEXT_RE (Rule 3).
    // This confirms address-range names are always downgraded even when the
    // street type is full-form and coordSource is absent.
    const p = makePlace({
      name: "3408–10 Spruce Street",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    // Rule 3 fires before Rule 3.5 because "Spruce Street" matches SPECIFIC_LOC_TEXT_RE
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects '3408 Spruce St' in name — Rule 3.5 catches abbreviated type missed by Rule 3", () => {
    // "Spruce St" with abbreviated "St" is NOT caught by SPECIFIC_LOC_TEXT_RE
    // (which only lists full-form types like "Street"). ADDRESS_RANGE_RE (Rule 3.5)
    // covers abbreviated forms as a defence-in-depth check. This is the primary
    // addition of Rule 3.5: abbreviated address forms that slip past Rule 3.
    const p = makePlace({
      name: "3408 Spruce St",
      coordSource: "nominatim-corrected",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("explicitAddressInName");
  });

  it("rejects en-dash address range with abbreviated type '3408–10 Spruce St' in name — Rule 3.5", () => {
    // Abbreviated "St" is missed by Rule 3; en-dash range "3408–10" is missed
    // by ADDRESS_RX in verifyAddressCoherence without the range fix. Rule 3.5
    // catches the combined case at the pattern level.
    const p = makePlace({
      name: "Former Political Machine Clubhouse, 3408–10 Spruce St",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("explicitAddressInName");
  });

  it("rejects hyphen address range with abbreviated type '3408-10 Spruce St' in name — Rule 3.5", () => {
    const p = makePlace({
      name: "Former Political Machine Clubhouse, 3408-10 Spruce St",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("explicitAddressInName");
  });

  // ---------------------------------------------------------------------------
  // PRECISE_LOCATION_PROSE_RE (Rule 4) — intersection-of / block-style claims
  // These only fire for LLM-only places (no coordSource). The patterns catch
  // prose like "intersection of 34th and Walnut" or "3400 block Walnut Street"
  // embedded in the summary when the place has no Nominatim confirmation.
  // ---------------------------------------------------------------------------

  it("rejects an LLM-only place whose summary contains 'intersection of 34th and Walnut'", () => {
    const p = makePlace({
      name: "Historic Corner Site",
      summary:
        "This site stood at the intersection of 34th and Walnut in West Philadelphia.",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects an LLM-only place whose summary contains '3400 block Walnut Street'", () => {
    const p = makePlace({
      name: "Former Pharmacy",
      summary:
        "A drugstore that operated on the 3400 block Walnut Street during the early twentieth century.",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects an LLM-only place whose summary contains a named neighborhood claim (University City)", () => {
    const p = makePlace({
      name: "Former Faculty Club",
      summary:
        "A private dining club that served University City professors and administrators.",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });

  it("rejects an LLM-only place whose summary contains a named neighborhood claim (Rittenhouse)", () => {
    const p = makePlace({
      name: "Lost Mansion",
      summary:
        "An estate once situated in the Rittenhouse district that was demolished in the nineteen thirties.",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("llmCoordWithSpecificLocationText");
  });
});

// ---------------------------------------------------------------------------
// Pass cases — legitimate places that must NOT be downgraded
// ---------------------------------------------------------------------------

describe("applyLlmPrecisionFilter — pass cases", () => {
  it("passes a verified local building with Nominatim coords and no street claim in name", () => {
    const p = makePlace({
      name: "St. Clement's Episcopal Church",
      summary:
        "Historic Episcopal church founded in 1855 in the Fairmount neighborhood of Philadelphia.",
      coordSource: "nominatim-corrected",
      discoveryClass: "VERIFIED_PLACE",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("VERIFIED_PLACE");
    expect(p.spatialSuppression).toBeUndefined();
  });

  it("does not downgrade a verified place whose summary mentions a street but whose name is clean", () => {
    // For verified places (coordSource set), both INTERSECTION_NAME_RE and
    // SPECIFIC_LOC_TEXT_RE run on the NAME. A summary mentioning a nearby
    // street is not downgraded — describing a location is not the same as
    // asserting an unverifiable coordinate in the place's identity name.
    const p = makePlace({
      name: "Fairmount Water Works",
      summary:
        "Located along Kelly Drive on the Schuylkill River near Fairmount Avenue.",
      coordSource: "nominatim-corrected",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("VERIFIED_PLACE");
    expect(p.spatialSuppression).toBeUndefined();
  });

  it("ensures spatialSuppression is filled for an already-INTERPRETIVE_OVERLAY place", () => {
    const p = makePlace({
      discoveryClass: "INTERPRETIVE_OVERLAY",
      spatialSuppression: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("INTERPRETIVE_OVERLAY");
    expect(p.spatialSuppression).toBe("interpretiveOverlay");
  });

  it("preserves an existing spatialSuppression reason on INTERPRETIVE_OVERLAY places", () => {
    const p = makePlace({
      discoveryClass: "INTERPRETIVE_OVERLAY",
      spatialSuppression: "someOtherReason",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.spatialSuppression).toBe("someOtherReason");
  });

  it("passes a place with no street reference in name or summary and no coordSource", () => {
    const p = makePlace({
      name: "Fairmount Neighborhood Park",
      summary: "A small green space popular with local residents.",
      coordSource: undefined,
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("VERIFIED_PLACE");
    expect(p.spatialSuppression).toBeUndefined();
  });

  it("passes a verified local place whose address field contains a numbered address but whose name is clean", () => {
    // The address field always contains street references by design; only the
    // NAME (and for LLM-only places, the summary) is checked. A verified local
    // building with coordSource set and a clean identity name must not be
    // downgraded even if its address field contains "2300 Fairmount Ave".
    // The name "Fairmount Engine Company No. 15" has no street/address pattern.
    const p = makePlace({
      name: "Fairmount Engine Company No. 15",
      summary:
        "An 1880s firehouse serving the Fairmount neighborhood of Philadelphia.",
      address: "2300 Fairmount Ave, Philadelphia, PA",
      coordSource: "nominatim-corrected",
      discoveryClass: "VERIFIED_PLACE",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("VERIFIED_PLACE");
    expect(p.spatialSuppression).toBeUndefined();
  });

  it("passes a place whose name contains a year but no street address (no false match on ADDRESS_RANGE_RE)", () => {
    // "1887" is 4 digits but "Cornice" is not a street type — no ADDRESS_RANGE_RE match.
    const p = makePlace({
      name: "Italianate Rowhouse with 1887 Cornice",
      summary:
        "A brick rowhouse near 22nd Street in Fairmount, featuring an ornate 1887 pressed-tin cornice.",
      coordSource: "nominatim-corrected",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("VERIFIED_PLACE");
    expect(p.spatialSuppression).toBeUndefined();
  });

  it("does NOT downgrade a verified place (coordSource set) whose summary mentions a neighborhood name", () => {
    // NAMED_NEIGHBORHOOD_RE is Rule 4: applies only to LLM-only places.
    // A verified place may legitimately describe itself as being in a
    // neighbourhood without that being a fabricated location claim.
    const p = makePlace({
      name: "University of Pennsylvania Campus Building",
      summary:
        "A historic academic building in University City, home to several research departments.",
      coordSource: "nominatim-corrected",
      discoveryClass: "VERIFIED_PLACE",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("VERIFIED_PLACE");
    expect(p.spatialSuppression).toBeUndefined();
  });

  it("does NOT downgrade a verified place (coordSource set) whose summary contains an intersection-of phrase", () => {
    // Rule 4 fires only when coordSource is absent. A Nominatim-confirmed
    // place that happens to describe its cross-street context must survive.
    const p = makePlace({
      name: "Spruce Hill Community Center",
      summary:
        "Community hub at the intersection of 43rd and Spruce, serving West Philadelphia since the nineteen sixties.",
      coordSource: "nominatim-corrected",
      discoveryClass: "VERIFIED_PLACE",
    });
    applyLlmPrecisionFilter([p]);
    expect(p.discoveryClass).toBe("VERIFIED_PLACE");
    expect(p.spatialSuppression).toBeUndefined();
  });
});
