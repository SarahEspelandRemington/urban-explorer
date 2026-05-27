import { describe, expect, it } from "vitest";
import {
  parseWikipediaOsmTag,
  buildWikiPromptBlock,
  type WikipediaSummary,
} from "../lib/wikipediaEnrichment";
import { buildDetailUserTurn } from "../routes/explore/index";
import {
  isTechnicalTag,
  sanitizeDisplayTags,
} from "../lib/sanitizeDisplayTags";

// ---------------------------------------------------------------------------
// parseWikipediaOsmTag
// ---------------------------------------------------------------------------

describe("parseWikipediaOsmTag — parsing", () => {
  it("parses a well-formed English tag", () => {
    expect(parseWikipediaOsmTag("en:Bergdoll_Mansion")).toEqual({
      lang: "en",
      title: "Bergdoll_Mansion",
    });
  });

  it("parses a non-English tag", () => {
    expect(parseWikipediaOsmTag("de:Bergdoll-Villa")).toEqual({
      lang: "de",
      title: "Bergdoll-Villa",
    });
  });

  it("normalises spaces in the title to underscores", () => {
    expect(parseWikipediaOsmTag("en:Bergdoll Mansion")).toEqual({
      lang: "en",
      title: "Bergdoll_Mansion",
    });
  });

  it("lowercases the language code", () => {
    expect(parseWikipediaOsmTag("EN:Some_Article"))?.toEqual({
      lang: "en",
      title: "Some_Article",
    });
  });

  it("returns null for missing colon separator", () => {
    expect(parseWikipediaOsmTag("no-colon")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseWikipediaOsmTag("")).toBeNull();
  });

  it("returns null for colon at position 0", () => {
    expect(parseWikipediaOsmTag(":Title")).toBeNull();
  });

  it("returns null for empty title after colon", () => {
    expect(parseWikipediaOsmTag("en:")).toBeNull();
  });

  it("returns null for whitespace-only title", () => {
    expect(parseWikipediaOsmTag("en:   ")).toBeNull();
  });

  it("returns null for numeric-only language code", () => {
    expect(parseWikipediaOsmTag("123:Title")).toBeNull();
  });

  it("returns null for language code longer than 3 letters", () => {
    expect(parseWikipediaOsmTag("engl:Title")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildWikiPromptBlock
// ---------------------------------------------------------------------------

describe("buildWikiPromptBlock", () => {
  const base: WikipediaSummary = {
    title: "Bergdoll Mansion",
    extract:
      "The Bergdoll Mansion is a historic house in Philadelphia, Pennsylvania.",
    lang: "en",
  };

  it("includes the article title and language domain", () => {
    const block = buildWikiPromptBlock(base);
    expect(block).toContain("en.wikipedia.org");
    expect(block).toContain('"Bergdoll Mansion"');
  });

  it("includes the extract text", () => {
    const block = buildWikiPromptBlock(base);
    expect(block).toContain(
      "The Bergdoll Mansion is a historic house in Philadelphia",
    );
  });

  it("includes description when present", () => {
    const withDesc: WikipediaSummary = {
      ...base,
      description: "historic house in Philadelphia",
    };
    const block = buildWikiPromptBlock(withDesc);
    expect(block).toContain("historic house in Philadelphia");
  });

  it("omits description line when absent", () => {
    const block = buildWikiPromptBlock(base);
    expect(block).not.toContain("Description:");
  });

  it("instructs the LLM not to claim Wikidata was fetched", () => {
    const block = buildWikiPromptBlock(base);
    expect(block).toContain("Only Wikipedia was consulted");
    // The block must not falsely claim Wikidata was fetched; it may contain
    // "Wikidata" as part of an instruction telling the LLM not to claim it.
    expect(block).not.toMatch(/fetched Wikidata\b(?! content)/);
  });

  it("does not contain Wikipedia article URLs", () => {
    const withUrl: WikipediaSummary = {
      ...base,
      articleUrl: "https://en.wikipedia.org/wiki/Bergdoll_Mansion",
    };
    const block = buildWikiPromptBlock(withUrl);
    // URLs are not injected into the prompt block
    expect(block).not.toContain("https://");
  });
});

// ---------------------------------------------------------------------------
// buildDetailUserTurn — with Wikipedia enrichment
// ---------------------------------------------------------------------------

describe("buildDetailUserTurn — Wikipedia enrichment", () => {
  const wikiSummary: WikipediaSummary = {
    title: "Bergdoll Mansion",
    extract:
      "The Bergdoll Mansion, also known as the Bergdoll-Kemble Mansion, was built in 1890.",
    description: "historic mansion in Philadelphia",
    lang: "en",
  };

  const bergdollTags: Record<string, string> = {
    name: "Bergdoll-Kemble Mansion",
    "historic:civilization": "us",
    wikipedia: "en:Bergdoll_Mansion",
    wikidata: "Q4891444",
    start_date: "1890",
  };

  it("injects WIKIPEDIA SOURCE CONTENT block when summary is provided", () => {
    const turn = buildDetailUserTurn(
      "Bergdoll-Kemble Mansion",
      "historic building",
      39.966,
      -75.174,
      "osm_enriched",
      bergdollTags,
      wikiSummary,
    );
    expect(turn).toContain("WIKIPEDIA SOURCE CONTENT");
    expect(turn).toContain("Bergdoll Mansion");
    expect(turn).toContain("built in 1890");
  });

  it("includes VERIFIED SOURCE TAGS block alongside Wikipedia block", () => {
    const turn = buildDetailUserTurn(
      "Bergdoll-Kemble Mansion",
      "historic building",
      39.966,
      -75.174,
      "osm_enriched",
      bergdollTags,
      wikiSummary,
    );
    expect(turn).toContain("VERIFIED SOURCE TAGS");
    expect(turn).toContain("start_date: 1890");
  });

  it("drops the source-pointer warning when Wikipedia was actually fetched", () => {
    const turn = buildDetailUserTurn(
      "Bergdoll-Kemble Mansion",
      "historic building",
      39.966,
      -75.174,
      "osm_enriched",
      bergdollTags,
      wikiSummary,
    );
    expect(turn).not.toContain("SOURCE POINTER NOTE");
    expect(turn).not.toContain(
      "Do NOT claim to have read the Wikipedia article",
    );
  });

  it("Phase A fallback — keeps source-pointer note when no summary provided", () => {
    const turn = buildDetailUserTurn(
      "Bergdoll-Kemble Mansion",
      "historic building",
      39.966,
      -75.174,
      "osm_enriched",
      bergdollTags,
    );
    expect(turn).toContain("SOURCE POINTER NOTE");
    expect(turn).not.toContain("WIKIPEDIA SOURCE CONTENT");
  });

  it("works with no OSM tags but a Wikipedia summary", () => {
    const turn = buildDetailUserTurn(
      "Bergdoll-Kemble Mansion",
      "historic building",
      39.966,
      -75.174,
      undefined,
      undefined,
      wikiSummary,
    );
    expect(turn).toContain("WIKIPEDIA SOURCE CONTENT");
    expect(turn).not.toContain("VERIFIED SOURCE TAGS");
  });

  it("plain base turn when no OSM tags and no Wikipedia summary", () => {
    const turn = buildDetailUserTurn("Some Place", "place", 39.966, -75.174);
    expect(turn).not.toContain("WIKIPEDIA");
    expect(turn).not.toContain("VERIFIED SOURCE TAGS");
    expect(turn).toContain("Some Place");
  });
});

// ---------------------------------------------------------------------------
// No Wikipedia name-search — raw tag values must not appear as display chips
// ---------------------------------------------------------------------------

describe("display-tag guard — Wikipedia/Wikidata values cannot become chips", () => {
  it("sanitizeDisplayTags strips WIKIPEDIA:EN:BERGDOLL_MANSION", () => {
    expect(isTechnicalTag("WIKIPEDIA:EN:BERGDOLL_MANSION")).toBe(true);
  });

  it("sanitizeDisplayTags strips wikidata:Q4891444", () => {
    expect(isTechnicalTag("wikidata:Q4891444")).toBe(true);
  });

  it("sanitizeDisplayTags strips bare Wikidata IDs", () => {
    expect(isTechnicalTag("Q4891444")).toBe(true);
  });

  it("sanitizeDisplayTags returns undefined when all tags are technical metadata", () => {
    expect(
      sanitizeDisplayTags([
        "WIKIPEDIA:EN:BERGDOLL_MANSION",
        "WIKIDATA:Q4891444",
        "wikipedia:en:olivet_covenant_presbyterian_church",
      ]),
    ).toBeUndefined();
  });
});
