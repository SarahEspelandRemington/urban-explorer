import { describe, it, expect } from "vitest";
import {
  deriveLifecycleFormerUse,
  classifyThinUseValue,
  evaluateThinLodgingCommercialGuardrail,
  LODGING_USE_VALUES,
  COMMERCIAL_SERVICE_USE_VALUES,
} from "../lib/thinLodgingCommercialGuardrail";

// ---------------------------------------------------------------------------
// deriveLifecycleFormerUse
// ---------------------------------------------------------------------------

describe("deriveLifecycleFormerUse", () => {
  it("reads was:tourism=hotel as a lodging former use", () => {
    expect(
      deriveLifecycleFormerUse({
        "was:tourism": "hotel",
        building: "yes",
      }),
    ).toEqual({
      value: "hotel",
      category: "lodging",
      sourceTag: "was:tourism",
    });
  });

  it("reads disused:amenity=restaurant as a commercial former use", () => {
    expect(
      deriveLifecycleFormerUse({
        "disused:amenity": "restaurant",
        building: "yes",
      }),
    ).toEqual({
      value: "restaurant",
      category: "commercial",
      sourceTag: "disused:amenity",
    });
  });

  it("recognizes abandoned:/demolished:/ruins: prefixes too", () => {
    expect(deriveLifecycleFormerUse({ "abandoned:tourism": "hotel" })).toEqual({
      value: "hotel",
      category: "lodging",
      sourceTag: "abandoned:tourism",
    });
    expect(deriveLifecycleFormerUse({ "demolished:amenity": "cafe" })).toEqual({
      value: "cafe",
      category: "commercial",
      sourceTag: "demolished:amenity",
    });
    expect(deriveLifecycleFormerUse({ "ruins:tourism": "motel" })).toEqual({
      value: "motel",
      category: "lodging",
      sourceTag: "ruins:tourism",
    });
  });

  it("never reads the un-prefixed current-use key", () => {
    // A current, non-lifecycle tourism=hotel must not be picked up here —
    // that's the current-category path, a separate dimension.
    expect(deriveLifecycleFormerUse({ tourism: "hotel" })).toBeUndefined();
  });

  it("ignores lifecycle-prefixed values outside the lodging/commercial vocabulary", () => {
    expect(
      deriveLifecycleFormerUse({ "was:amenity": "post_office" }),
    ).toBeUndefined();
  });

  it("returns undefined for empty tags", () => {
    expect(deriveLifecycleFormerUse({})).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// classifyThinUseValue
// ---------------------------------------------------------------------------

describe("classifyThinUseValue", () => {
  it("classifies every LODGING_USE_VALUES entry as lodging", () => {
    for (const v of LODGING_USE_VALUES) {
      expect(classifyThinUseValue(v)).toBe("lodging");
    }
  });

  it("classifies every COMMERCIAL_SERVICE_USE_VALUES entry as commercial", () => {
    for (const v of COMMERCIAL_SERVICE_USE_VALUES) {
      expect(classifyThinUseValue(v)).toBe("commercial");
    }
  });

  it("returns undefined for an unrelated value", () => {
    expect(classifyThinUseValue("place_of_worship")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// evaluateThinLodgingCommercialGuardrail — required regression cases
// ---------------------------------------------------------------------------

const baseInput = {
  discoveryTier: undefined as number | undefined,
  category: undefined as string | undefined,
  formerUse: undefined as string | undefined,
  hasPositiveWikiEvidence: false,
  hasApprovedCuratedEntry: false,
};

describe("evaluateThinLodgingCommercialGuardrail — suppress cases", () => {
  it("suppresses a Hilton-shaped candidate: was:tourism=hotel + generic building, no story evidence", () => {
    // category is "building" (osmType priority chain falls through to it —
    // was:tourism is never read by that chain) — only formerUse carries the
    // lodging signal.
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "building",
        formerUse: "hotel",
      }),
    ).toBe("genericFormerLodging");
  });

  it("suppresses a generic disused:amenity=restaurant candidate with no story evidence", () => {
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "building",
        formerUse: "restaurant",
      }),
    ).toBe("genericFormerCommercial");
  });

  it("suppresses a current thin active hotel with no story evidence (existing behavior unchanged)", () => {
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "hotel",
      }),
    ).toBe("genericLodging");
  });

  it("suppresses a current thin active restaurant with no story evidence", () => {
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "restaurant",
      }),
    ).toBe("genericCommercial");
  });

  it("suppresses a current or former hotel with osm_enriched trust but no positive story evidence (osm_enriched is not a valid exemption)", () => {
    // trustLevel/osm_enriched is a pure tag-richness metric, not editorial
    // worthiness, and was deliberately removed from the guardrail's input
    // contract — there is no field left to pass that would exempt a
    // candidate on enrichment alone. Both the current-use and lifecycle
    // former-use variant of an "osm_enriched hotel" must still suppress.
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "hotel",
      }),
    ).toBe("genericLodging");
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "building",
        formerUse: "hotel",
      }),
    ).toBe("genericFormerLodging");
  });
});

describe("evaluateThinLodgingCommercialGuardrail — remain-eligible cases", () => {
  it("keeps a former hotel/lodging building with an approved curated entry", () => {
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "building",
        formerUse: "hotel",
        hasApprovedCuratedEntry: true,
      }),
    ).toBeUndefined();
  });

  it("keeps a former commercial/lodging building with a successful A3 Wikipedia evidence-selector result", () => {
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "building",
        formerUse: "restaurant",
        hasPositiveWikiEvidence: true,
      }),
    ).toBeUndefined();
  });

  it("keeps a former lodging building already classified into a positive Tier (1-3)", () => {
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 2,
        category: "building",
        formerUse: "hotel",
      }),
    ).toBeUndefined();
  });

  it("keeps a current active hotel with a genuine documented story (successful A3 Wikipedia evidence-selector result)", () => {
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "hotel",
        hasPositiveWikiEvidence: true,
      }),
    ).toBeUndefined();
  });

  it("never triggers for an unrelated category with no lifecycle former use", () => {
    expect(
      evaluateThinLodgingCommercialGuardrail({
        ...baseInput,
        discoveryTier: 4,
        category: "place_of_worship",
      }),
    ).toBeUndefined();
  });
});
