import { describe, expect, it } from "vitest";
import {
  isTechnicalTag,
  sanitizeDisplayTags,
} from "../lib/sanitizeDisplayTags";

describe("isTechnicalTag — rejects technical identifiers", () => {
  it("rejects OSM key:value pairs", () => {
    expect(isTechnicalTag("WIKIDATA:Q4891444")).toBe(true);
    expect(isTechnicalTag("WIKIPEDIA:EN:BERGDOLL_MANSION")).toBe(true);
    expect(isTechnicalTag("BUILDING:LEVELS:3")).toBe(true);
    expect(isTechnicalTag("DENOMINATION:PRESBYTERIAN")).toBe(true);
    expect(isTechnicalTag("OPERATOR:PRESBYTERIAN CHURCH (U.S.A.)")).toBe(true);
    expect(isTechnicalTag("TYPE:PLACE_OF_WORSHIP")).toBe(true);
    expect(isTechnicalTag("wikidata:Q5764869")).toBe(true);
    expect(isTechnicalTag("building:levels:3")).toBe(true);
  });

  it("rejects all-uppercase internal field labels", () => {
    expect(isTechnicalTag("ADDRESS")).toBe(true);
    expect(isTechnicalTag("NAME")).toBe(true);
    expect(isTechnicalTag("TYPE")).toBe(true);
    expect(isTechnicalTag("OPERATOR")).toBe(true);
  });

  it("rejects underscore-formatted slugs", () => {
    expect(isTechnicalTag("place_of_worship")).toBe(true);
    expect(isTechnicalTag("BERGDOLL_MANSION")).toBe(true);
    expect(isTechnicalTag("historic_building")).toBe(true);
  });

  it("rejects bare Wikidata IDs", () => {
    expect(isTechnicalTag("Q4891444")).toBe(true);
    expect(isTechnicalTag("Q123")).toBe(true);
    expect(isTechnicalTag("q4891444")).toBe(true);
  });

  it("rejects empty or over-long strings", () => {
    expect(isTechnicalTag("")).toBe(true);
    expect(isTechnicalTag("   ")).toBe(true);
    expect(isTechnicalTag("x".repeat(61))).toBe(true);
    expect(isTechnicalTag("x".repeat(60))).toBe(false);
  });
});

describe("isTechnicalTag — passes human-readable display tags", () => {
  it("passes Bergdoll-style tags", () => {
    expect(isTechnicalTag("historic mansion")).toBe(false);
    expect(isTechnicalTag("Victorian architecture")).toBe(false);
    expect(isTechnicalTag("Gilded Age")).toBe(false);
    expect(isTechnicalTag("stone construction")).toBe(false);
    expect(isTechnicalTag("Willis G. Hale")).toBe(false);
    expect(isTechnicalTag("1880s mansion")).toBe(false);
  });

  it("passes Olivet-style tags", () => {
    expect(isTechnicalTag("Presbyterian")).toBe(false);
    expect(isTechnicalTag("place of worship")).toBe(false);
    expect(isTechnicalTag("historic church")).toBe(false);
    expect(isTechnicalTag("North Philadelphia")).toBe(false);
    expect(isTechnicalTag("immigrant heritage")).toBe(false);
  });

  it("passes common discover display tags", () => {
    expect(isTechnicalTag("art deco")).toBe(false);
    expect(isTechnicalTag("ghost sign")).toBe(false);
    expect(isTechnicalTag("labor history")).toBe(false);
    expect(isTechnicalTag("immigrant community")).toBe(false);
    expect(isTechnicalTag("1880s brewery")).toBe(false);
    expect(isTechnicalTag("tenement era")).toBe(false);
    expect(isTechnicalTag("speakeasy")).toBe(false);
  });
});

describe("sanitizeDisplayTags", () => {
  it("returns undefined for undefined input", () => {
    expect(sanitizeDisplayTags(undefined)).toBeUndefined();
  });

  it("returns undefined when all tags are technical", () => {
    expect(
      sanitizeDisplayTags(["WIKIDATA:Q123", "ADDRESS", "NAME"]),
    ).toBeUndefined();
  });

  it("Bergdoll case — filters raw OSM metadata, keeps human-readable phrases", () => {
    const input = [
      "WIKIDATA:Q4891444",
      "WIKIPEDIA:EN:BERGDOLL_MANSION",
      "historic mansion",
      "BUILDING:LEVELS:3",
      "Victorian architecture",
    ];
    expect(sanitizeDisplayTags(input)).toEqual([
      "historic mansion",
      "Victorian architecture",
    ]);
  });

  it("Olivet case — filters raw OSM metadata, keeps human-readable phrases", () => {
    const input = [
      "DENOMINATION:PRESBYTERIAN",
      "OPERATOR:PRESBYTERIAN CHURCH (U.S.A.)",
      "Presbyterian",
      "TYPE:PLACE_OF_WORSHIP",
      "place of worship",
    ];
    expect(sanitizeDisplayTags(input)).toEqual([
      "Presbyterian",
      "place of worship",
    ]);
  });

  it("returns clean tags unmodified", () => {
    const input = ["art deco", "ghost sign", "labor history"];
    expect(sanitizeDisplayTags(input)).toEqual([
      "art deco",
      "ghost sign",
      "labor history",
    ]);
  });

  it("caps at 5 tags", () => {
    const input = ["a", "b", "c", "d", "e", "f"];
    expect(sanitizeDisplayTags(input)).toHaveLength(5);
  });

  it("returns undefined for empty array", () => {
    expect(sanitizeDisplayTags([])).toBeUndefined();
  });
});
