/**
 * Regression tests for groundNarrativeAddress's identity-continuity-before-
 * scale ordering fix.
 *
 * Previously, `isScaleImplausible()` (building:levels >= 6) was applied
 * BEFORE checking for a name/wikidata identity match, so a confirmed
 * identity match on a real tall building could be discarded purely for
 * height (or, when multiple OSM elements shared an address, could be
 * excluded from consideration entirely before the identity check ran,
 * letting an unrelated shorter/anonymous element win instead). Scale is
 * now only a secondary suspicion signal applied to otherwise-anonymous
 * matches — it never overrides a confirmed name/wikidata identity match.
 *
 * All fixture tag data below (housenumber/street/name/wikidata/
 * building:levels values and element ids) is taken from real, live-fetched
 * OSM tags for these real buildings, not invented — see
 * memory/deferred-tasks.md's "Shared narrative grounding's >=6-level
 * scale-implausibility heuristic" entry for the original finding this
 * fixes.
 */
import { describe, expect, it } from "vitest";
import {
  groundNarrativeAddress,
  type NarrativeOsmElement,
} from "./narrativeAddressGrounding";

function makeElement(
  overrides: Partial<NarrativeOsmElement> & { id: number },
): NarrativeOsmElement {
  return {
    type: "way",
    tags: {},
    ...overrides,
  };
}

describe("groundNarrativeAddress — identity continuity before scale", () => {
  it("Film Center Building: a real 13-story landmark with a name+wikidata match is no longer rejected for height", () => {
    const osmIndex: NarrativeOsmElement[] = [
      makeElement({
        id: 265320243,
        housenumber: "630",
        street: "9TH AVE",
        tags: {
          name: "Film Center Building",
          wikidata: "Q5448921",
          "building:levels": "13",
        },
      }),
    ];
    // Exercises both fixes together: the source's real spelled-out address
    // form ("Ninth Avenue") plus the ordering fix.
    const result = groundNarrativeAddress("630 Ninth Avenue", osmIndex);
    expect(result.category).toBe("current-entity");
    expect(result.matchedIdentifier).toBe("Film Center Building");
    expect(result.matchingSignal).toBe(
      "exact address match + wikidata identity",
    );
    expect(result.confidence).toBe("high");
    expect(result.osmElementId).toBe("way/265320243");
  });

  it("Farley Building: identity continuity resolves to the correct building-level entity instead of a co-located, scale-passing, name-only match", () => {
    const osmIndex: NarrativeOsmElement[] = [
      // The real Farley Building footprint — real height disqualifies it
      // under the old scale-first ordering, which excluded it from
      // consideration entirely before its own name+wikidata match could be
      // checked.
      makeElement({
        id: 264667030,
        housenumber: "421",
        street: "8TH AVE",
        tags: {
          name: "James A. Farley Building",
          wikidata: "Q5342376",
          "building:levels": "6",
        },
      }),
      // A separate, co-located OSM way for the post-office designation at
      // the same address — has a name but no height tag, so it passed the
      // old scale filter and won by default once the actual building was
      // excluded.
      makeElement({
        id: 928018702,
        housenumber: "421",
        street: "8TH AVE",
        tags: { name: "James A. Farley Post Office" },
      }),
    ];
    const result = groundNarrativeAddress("421 8th Avenue", osmIndex);
    expect(result.category).toBe("current-entity");
    expect(result.matchedIdentifier).toBe("James A. Farley Building");
    expect(result.matchingSignal).toBe(
      "exact address match + wikidata identity",
    );
    expect(result.osmElementId).toBe("way/264667030");
  });

  it("McGraw-Hill Building: currently-passing tall-building control is unaffected", () => {
    const osmIndex: NarrativeOsmElement[] = [
      makeElement({
        id: 266143357,
        housenumber: "330",
        street: "W 42ND ST",
        tags: {
          name: "McGraw-Hill Building",
          wikidata: "Q6741150",
          "building:levels": "33",
        },
      }),
    ];
    const result = groundNarrativeAddress("330 West 42nd Street", osmIndex);
    expect(result.category).toBe("current-entity");
    expect(result.matchedIdentifier).toBe("McGraw-Hill Building");
    expect(result.osmElementId).toBe("way/266143357");
  });

  it("546 West 43rd Street: a genuine anonymous redevelopment still correctly resolves as unresolved (no false-admission hole)", () => {
    const osmIndex: NarrativeOsmElement[] = [
      makeElement({
        id: 288450479,
        housenumber: "546",
        street: "W 43RD ST",
        tags: { building: "yes", "building:levels": "14" },
      }),
    ];
    const result = groundNarrativeAddress("546 West 43rd Street", osmIndex);
    expect(result.category).toBe("unresolved");
    expect(result.confidence).toBe("none");
    expect(result.osmElementId).toBeUndefined();
    expect(result.conflictingEvidence).toContain("building:levels=14");
  });
});
