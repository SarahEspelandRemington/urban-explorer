/**
 * Regression tests for the shared NYC address parser — see nycAddress.ts's
 * module doc for the hyphenated-housenumber bug this fixes.
 *
 * Promoted (faithful port) from
 * experiments/hybrid-discovery-v0.1/shared/nycAddress.test.ts for production
 * offline batch-tool use — now covered by the committed CI
 * `pnpm --filter @workspace/api-server run test` path.
 */
import { describe, expect, it } from "vitest";
import { normalizeStreet, parseAddress } from "./nycAddress";

describe("parseAddress — NYC hyphenated (Queens/Bronx/Staten Island block-style) housenumbers", () => {
  it("parses a two-digit block prefix (81-04 37th Avenue — the Last Jahn's case)", () => {
    expect(parseAddress("81-04 37th Avenue")).toEqual({
      housenumber: "81-04",
      street: "37TH AVE",
    });
  });

  it("parses another two-digit block prefix (80-19 31st Avenue — the Crooked House case)", () => {
    expect(parseAddress("80-19 31st Avenue")).toEqual({
      housenumber: "80-19",
      street: "31ST AVE",
    });
  });

  it("parses a two-digit block prefix with a two-digit street (34-11 84th Street)", () => {
    expect(parseAddress("34-11 84th Street")).toEqual({
      housenumber: "34-11",
      street: "84TH ST",
    });
  });
});

describe("parseAddress — ordinary non-hyphenated addresses (preserved behavior)", () => {
  it("parses a plain Manhattan-style address (422 West 46th Street)", () => {
    expect(parseAddress("422 West 46th Street")).toEqual({
      housenumber: "422",
      street: "W 46TH ST",
    });
  });

  it("parses a plain address with a trailing letter suffix (1234A Main Street)", () => {
    expect(parseAddress("1234A Main Street")).toEqual({
      housenumber: "1234A",
      street: "MAIN ST",
    });
  });

  it("returns null for an address with no leading housenumber", () => {
    expect(parseAddress("Main Street")).toBeNull();
  });
});

describe("normalizeStreet", () => {
  it("normalizes directional/suffix abbreviations and casing", () => {
    expect(normalizeStreet("West 46th Street")).toBe("W 46TH ST");
    expect(normalizeStreet("37th Avenue")).toBe("37TH AVE");
  });
});

describe("normalizeStreet — spelled-out ordinal normalization (Film Center Building fix)", () => {
  it("normalizes a simple spelled-out avenue ordinal (Ninth Avenue — the Film Center Building case)", () => {
    expect(normalizeStreet("Ninth Avenue")).toBe("9TH AVE");
  });

  it("normalizes another simple spelled-out avenue ordinal (Eighth Avenue — the Farley Building case)", () => {
    expect(normalizeStreet("Eighth Avenue")).toBe("8TH AVE");
  });

  it("normalizes a teens-range spelled-out ordinal (Twelfth Avenue)", () => {
    expect(normalizeStreet("Twelfth Avenue")).toBe("12TH AVE");
  });

  it("normalizes a compound hyphenated spelled-out street ordinal (Forty-Second Street)", () => {
    expect(normalizeStreet("West Forty-Second Street")).toBe("W 42ND ST");
  });

  it("normalizes a compound space-separated spelled-out street ordinal (Forty Second Street)", () => {
    expect(normalizeStreet("West Forty Second Street")).toBe("W 42ND ST");
  });

  it("normalizes a tens-only spelled-out ordinal (Twentieth Street)", () => {
    expect(normalizeStreet("West Twentieth Street")).toBe("W 20TH ST");
  });

  it("is case-insensitive on spelled-out ordinals", () => {
    expect(normalizeStreet("ninth avenue")).toBe("9TH AVE");
  });

  it("leaves an already-numeral street name byte-for-byte unaffected (negative case)", () => {
    expect(normalizeStreet("9th Avenue")).toBe("9TH AVE");
    expect(normalizeStreet("West 42nd Street")).toBe("W 42ND ST");
  });

  it("does not alter an ordinary street name containing no ordinal words at all (negative case)", () => {
    expect(normalizeStreet("Madison Avenue")).toBe("MADISON AVE");
  });

  it("does not rewrite an ordinal-shaped word that is part of a real proper street name, not a numbered-grid ordinal (Carroll Gardens, Brooklyn's First/Second/Third Place — negative/adversarial case)", () => {
    expect(normalizeStreet("First Place")).toBe("FIRST PLACE");
    expect(normalizeStreet("Second Place")).toBe("SECOND PLACE");
    expect(normalizeStreet("Third Place")).toBe("THIRD PLACE");
  });

  it("parseAddress resolves a full spelled-out-ordinal address to the same normalized form as its numeral equivalent", () => {
    expect(parseAddress("630 Ninth Avenue")).toEqual(
      parseAddress("630 9th Avenue"),
    );
  });
});
