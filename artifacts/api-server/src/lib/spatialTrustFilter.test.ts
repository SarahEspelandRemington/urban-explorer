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
    // For verified places only the NAME intersection check runs. A summary
    // mentioning a street is acceptable — the user's location determines
    // whether the 60 m gate blocks narration.
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
});
