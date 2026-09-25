import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ pool: {}, db: {} }));
vi.mock("@workspace/integrations-openai-ai-server", () => ({ openai: {} }));
vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  textToSpeech: vi.fn(),
}));

import {
  parseWikipediaOsmTag,
  buildWikiPromptBlock,
  isValidWikidataId,
  extractEnwikiSitelinkTitle,
  type WikipediaSummary,
} from "../lib/wikipediaEnrichment";
import {
  buildDetailUserTurn,
  resolveWikipediaArticleTarget,
  fetchWikipediaSummaryForCandidate,
} from "../routes/explore/index";
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

// ---------------------------------------------------------------------------
// isValidWikidataId / extractEnwikiSitelinkTitle — pure Wikidata helpers
// ---------------------------------------------------------------------------

describe("isValidWikidataId", () => {
  it("accepts a well-formed QID", () => {
    expect(isValidWikidataId("Q6542503")).toBe(true);
  });

  it("rejects a missing value", () => {
    expect(isValidWikidataId(undefined)).toBe(false);
  });

  it("rejects a value without the Q prefix", () => {
    expect(isValidWikidataId("6542503")).toBe(false);
  });

  it("rejects a lowercase q", () => {
    expect(isValidWikidataId("q6542503")).toBe(false);
  });
});

describe("extractEnwikiSitelinkTitle", () => {
  it("extracts the enwiki sitelink title when present", () => {
    const raw = {
      entities: {
        Q6542503: {
          sitelinks: { enwiki: { site: "enwiki", title: "Library Hotel" } },
        },
      },
    };
    expect(extractEnwikiSitelinkTitle("Q6542503", raw)).toBe("Library Hotel");
  });

  it("returns null when the entity has no enwiki sitelink", () => {
    const raw = {
      entities: {
        Q999999: { sitelinks: { dewiki: { site: "dewiki", title: "Etwas" } } },
      },
    };
    expect(extractEnwikiSitelinkTitle("Q999999", raw)).toBeNull();
  });

  it("returns null for a malformed/unexpected response shape", () => {
    expect(extractEnwikiSitelinkTitle("Q123", { not: "expected" })).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(extractEnwikiSitelinkTitle("Q123", null)).toBeNull();
    expect(extractEnwikiSitelinkTitle("Q123", undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveWikipediaArticleTarget / fetchWikipediaSummaryForCandidate —
// Wikidata → English Wikipedia fallback (deterministic, fails closed)
// ---------------------------------------------------------------------------

function wikidataEntityResponse(qid: string, enwikiTitle: string | null) {
  return {
    ok: true,
    json: async () => ({
      entities: {
        [qid]: {
          sitelinks: enwikiTitle
            ? { enwiki: { site: "enwiki", title: enwikiTitle, badges: [] } }
            : {},
        },
      },
    }),
  };
}

function wikiArticleResponse(pageTitle: string, extract: string) {
  return {
    ok: true,
    json: async () => ({
      query: { pages: { "1": { pageid: 1, title: pageTitle, extract } } },
    }),
  };
}

function wikiDisambiguationResponse(pageTitle: string) {
  return {
    ok: true,
    json: async () => ({
      query: {
        pages: {
          "1": {
            pageid: 1,
            title: pageTitle,
            extract: "Springfield may refer to several places.",
            pageprops: { disambiguation: "" },
          },
        },
      },
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveWikipediaArticleTarget", () => {
  it("direct wikipedia= tag present → uses it; does not call Wikidata", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const target = await resolveWikipediaArticleTarget({
      wikipedia: "en:Bergdoll_Mansion",
      wikidata: "Q4891444",
    });
    expect(target).toEqual({
      lang: "en",
      title: "Bergdoll_Mansion",
      resolvedVia: "osmTag",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("malformed wikipedia= tag present → does not fall back to wikidata= even if valid", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const target = await resolveWikipediaArticleTarget({
      wikipedia: "no-colon-here",
      wikidata: "Q6542503",
    });
    expect(target).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no wikipedia= tag, valid wikidata= with enwiki sitelink → resolves via wikidataSitelink (Library Hotel/Q6542503)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(wikidataEntityResponse("Q6542503", "Library Hotel")),
    );
    const target = await resolveWikipediaArticleTarget({
      wikidata: "Q6542503",
    });
    expect(target).toEqual({
      lang: "en",
      title: "Library_Hotel",
      resolvedVia: "wikidataSitelink",
    });
  });

  it("no wikipedia= tag, no wikidata= tag → resolves to null", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const target = await resolveWikipediaArticleTarget({ name: "Some Place" });
    expect(target).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("wikidata= present but no enwiki sitelink → no fallback article (fails closed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(wikidataEntityResponse("Q999999", null)),
    );
    const target = await resolveWikipediaArticleTarget({
      wikidata: "Q999999",
    });
    expect(target).toBeNull();
  });

  it("malformed Wikidata response body → fails closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ not: "expected" }),
      }),
    );
    const target = await resolveWikipediaArticleTarget({ wikidata: "Q123" });
    expect(target).toBeNull();
  });

  it("Wikidata entity not found (404) → fails closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const target = await resolveWikipediaArticleTarget({ wikidata: "Q123" });
    expect(target).toBeNull();
  });

  it("invalid wikidata= tag shape (not a QID) → resolves to null without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const target = await resolveWikipediaArticleTarget({
      wikidata: "not-a-qid",
    });
    expect(target).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("fetchWikipediaSummaryForCandidate — end-to-end resolution + existing safeguards", () => {
  it("no wikipedia= tag, valid wikidata= sitelink → the real resolved article reaches the summary", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("wikidata.org")) {
        return wikidataEntityResponse("Q6542503", "Library Hotel");
      }
      return wikiArticleResponse(
        "Library Hotel",
        "The Library Hotel is a boutique hotel in Manhattan themed around the Dewey Decimal System, and was the subject of a 2003 OCLC trademark lawsuit.",
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await fetchWikipediaSummaryForCandidate({
      wikidata: "Q6542503",
    });
    expect(summary).toBeDefined();
    expect(summary?.resolvedVia).toBe("wikidataSitelink");
    expect(summary?.extract).toContain("Dewey Decimal");
    expect(summary?.extract).toContain("OCLC");
  });

  it("resolved sitelink pointing to a Wikipedia disambiguation page → existing refusal still applies (no summary)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("wikidata.org")) {
        return wikidataEntityResponse("Q42", "Springfield");
      }
      return wikiDisambiguationResponse("Springfield");
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await fetchWikipediaSummaryForCandidate({
      wikidata: "Q42",
    });
    expect(summary).toBeUndefined();
  });

  it("direct wikipedia= tag still resolves and fetches normally (unchanged behavior)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          wikiArticleResponse(
            "Bergdoll Mansion",
            "The Bergdoll Mansion is a historic house.",
          ),
        ),
    );
    const summary = await fetchWikipediaSummaryForCandidate({
      wikipedia: "en:Bergdoll_Mansion",
    });
    expect(summary?.resolvedVia).toBe("osmTag");
    expect(summary?.extract).toContain("historic house");
  });
});
