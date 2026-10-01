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

/**
 * Regression tests for the deterministic same-address entity-selection rule
 * (pickBestNamedMatch) that replaced array-order-dependent "first named
 * match wins". Live Overpass data showed `named[0]` could select a
 * co-located tenant/POI node (a ground-floor restaurant, a community board
 * office) over the actual building way purely because of OSM response
 * order — this is a distinct bug from the identity-before-scale ordering
 * fix above, caught during production-path verification of that fix.
 *
 * Fixture tag data for Film Center Building, McGraw-Hill Building, and
 * their real co-located tenant/office nodes is taken from real, live-fetched
 * OSM data, not invented.
 *
 * The ranking tiers below were revised after a semantic review found the
 * first version's top tier (bare `wikidata` presence, checked ahead of
 * structural building-likeness) was unsound: groundNarrativeAddress() has
 * no expected/source entity id to compare a candidate's `wikidata` tag
 * against, so that tag only means "this element is itself externally
 * identified," not "this element is the narrative subject." Structural
 * building-likeness is now checked first, since this grounding path is
 * fundamentally building/place-level — see the candidateTier doc comment
 * in narrativeAddressGrounding.ts for the corrected tier order.
 */
describe("groundNarrativeAddress — deterministic same-address entity selection", () => {
  it("Film Center Building: the building way wins over co-located ground-floor restaurant nodes, in the real live Overpass return order", () => {
    const osmIndex: NarrativeOsmElement[] = [
      makeElement({
        id: 1873813860,
        type: "node",
        housenumber: "630",
        street: "9TH AVE",
        tags: { name: "5 Napkin Burger", amenity: "restaurant" },
      }),
      makeElement({
        id: 2273962587,
        type: "node",
        housenumber: "630",
        street: "9TH AVE",
        tags: { name: "Marseille", amenity: "restaurant" },
      }),
      makeElement({
        id: 6483237643,
        type: "node",
        housenumber: "630",
        street: "9TH AVE",
        tags: { name: "Nizza", amenity: "restaurant" },
      }),
      makeElement({
        id: 265320243,
        housenumber: "630",
        street: "9TH AVE",
        tags: {
          name: "Film Center Building",
          wikidata: "Q5448921",
          building: "office",
          "building:levels": "13",
        },
      }),
    ];
    const result = groundNarrativeAddress("630 9th Avenue", osmIndex);
    expect(result.matchedIdentifier).toBe("Film Center Building");
    expect(result.osmElementId).toBe("way/265320243");
  });

  it("Film Center Building: result is unchanged when the same candidates are reversed or shuffled (no array-order dependence)", () => {
    const buildingWay = makeElement({
      id: 265320243,
      housenumber: "630",
      street: "9TH AVE",
      tags: {
        name: "Film Center Building",
        wikidata: "Q5448921",
        building: "office",
        "building:levels": "13",
      },
    });
    const tenantNodes = [
      makeElement({
        id: 1873813860,
        type: "node",
        housenumber: "630",
        street: "9TH AVE",
        tags: { name: "5 Napkin Burger", amenity: "restaurant" },
      }),
      makeElement({
        id: 2273962587,
        type: "node",
        housenumber: "630",
        street: "9TH AVE",
        tags: { name: "Marseille", amenity: "restaurant" },
      }),
      makeElement({
        id: 6483237643,
        type: "node",
        housenumber: "630",
        street: "9TH AVE",
        tags: { name: "Nizza", amenity: "restaurant" },
      }),
    ];

    const buildingLast = [...tenantNodes, buildingWay];
    const buildingFirst = [buildingWay, ...tenantNodes];
    const shuffled = [
      tenantNodes[1],
      buildingWay,
      tenantNodes[2],
      tenantNodes[0],
    ];

    for (const osmIndex of [buildingLast, buildingFirst, shuffled]) {
      const result = groundNarrativeAddress("630 9th Avenue", osmIndex);
      expect(result.osmElementId).toBe("way/265320243");
      expect(result.matchedIdentifier).toBe("Film Center Building");
    }
  });

  it("McGraw-Hill Building: the building way wins over a co-located, name-only community board office node", () => {
    const communityBoardFirst: NarrativeOsmElement[] = [
      makeElement({
        id: 4922094244,
        type: "node",
        housenumber: "330",
        street: "W 42ND ST",
        tags: { name: "Community Board 4" },
      }),
      makeElement({
        id: 266143357,
        housenumber: "330",
        street: "W 42ND ST",
        tags: {
          name: "McGraw-Hill Building",
          wikidata: "Q3303658",
          building: "commercial",
        },
      }),
    ];
    const communityBoardLast: NarrativeOsmElement[] = [
      communityBoardFirst[1],
      communityBoardFirst[0],
    ];

    for (const osmIndex of [communityBoardFirst, communityBoardLast]) {
      const result = groundNarrativeAddress("330 West 42nd Street", osmIndex);
      expect(result.matchedIdentifier).toBe("McGraw-Hill Building");
      expect(result.osmElementId).toBe("way/266143357");
    }
  });

  it("tier 2 in isolation: a building-tagged way outranks a name-only tenant node when NEITHER candidate carries wikidata (the common case, since most buildings have no wikidata tag)", () => {
    const osmIndex: NarrativeOsmElement[] = [
      makeElement({
        id: 9001,
        type: "node",
        housenumber: "100",
        street: "TEST ST",
        tags: { name: "Corner Deli", shop: "convenience" },
      }),
      makeElement({
        id: 9002,
        housenumber: "100",
        street: "TEST ST",
        tags: { name: "100 Test Street Building", building: "apartments" },
      }),
    ];
    const result = groundNarrativeAddress("100 Test St", osmIndex);
    expect(result.osmElementId).toBe("way/9002");
  });

  it("semantic correction: a building-tagged named way DOES outrank a non-building node carrying its own (unrelated-to-the-claim) wikidata tag", () => {
    // Deliberately constructed, not from any specific real address.
    // groundNarrativeAddress() is given only an address string + the OSM
    // index — never the narrative source's own expected entity/Wikidata id
    // — so a candidate's `wikidata` tag is NOT a verified match against the
    // narrative subject; it only means that specific OSM element is itself
    // externally identified (e.g. even a chain restaurant can carry its own
    // Wikidata item). This function grounds building/place-level narrative
    // subjects (see isBuildingLikeStructure and the former-site/
    // unnamed-current-building tiers), so a building footprint's structural
    // evidence is trusted ahead of an unrelated non-building candidate's
    // mere external identifiability. This replaces the prior version of
    // this test, which incorrectly asserted the opposite outcome.
    const osmIndex: NarrativeOsmElement[] = [
      makeElement({
        id: 9101,
        housenumber: "200",
        street: "TEST AVE",
        tags: { name: "200 Test Avenue Building", building: "yes" },
      }),
      makeElement({
        id: 9102,
        type: "node",
        housenumber: "200",
        street: "TEST AVE",
        tags: { name: "Well-Known Chain Restaurant", wikidata: "Q00000000" },
      }),
    ];
    const result = groundNarrativeAddress("200 Test Avenue", osmIndex);
    expect(result.osmElementId).toBe("way/9101");
    expect(result.matchingSignal).toBe(
      "exact address match + named OSM entity",
    );
  });

  it("fallback tier: when NO building-like candidate exists at the address, a wikidata-carrying non-building candidate outranks a name-only non-building candidate", () => {
    // Also synthetic: demonstrates tier 3 (non-building + wikidata) still
    // legitimately outranks tier 4 (non-building, name only) as a
    // least-bad fallback — this is NOT an identity resolution (neither
    // candidate is confirmed to be the narrative subject), just a
    // preference for the more externally-identified of two non-building
    // candidates when no building footprint is present at all.
    const osmIndex: NarrativeOsmElement[] = [
      makeElement({
        id: 9201,
        type: "node",
        housenumber: "300",
        street: "TEST BLVD",
        tags: { name: "Unidentified Shop" },
      }),
      makeElement({
        id: 9202,
        type: "node",
        housenumber: "300",
        street: "TEST BLVD",
        tags: { name: "Identified Kiosk", wikidata: "Q11111111" },
      }),
    ];
    const result = groundNarrativeAddress("300 Test Blvd", osmIndex);
    expect(result.osmElementId).toBe("node/9202");
  });

  it("tie-break: lowest numeric id wins between two otherwise-equal building-like named candidates (determinism only, not identity resolution), and is unaffected by shuffled order", () => {
    // Synthetic: two building-tagged ways at the same address, neither with
    // wikidata — the data model has no further evidence to distinguish
    // them, so the rule plainly falls back to a stable, order-independent
    // tie-break rather than claiming to resolve which is the "true" subject.
    const wayA = makeElement({
      id: 9301,
      housenumber: "400",
      street: "TEST PL",
      tags: { name: "400 Test Place Annex", building: "yes" },
    });
    const wayB = makeElement({
      id: 9300,
      housenumber: "400",
      street: "TEST PL",
      tags: { name: "400 Test Place Main", building: "yes" },
    });
    for (const osmIndex of [
      [wayA, wayB],
      [wayB, wayA],
    ]) {
      const result = groundNarrativeAddress("400 Test Pl", osmIndex);
      expect(result.osmElementId).toBe("way/9300");
    }
  });
});
