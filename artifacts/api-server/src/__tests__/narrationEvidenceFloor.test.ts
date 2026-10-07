import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ pool: {}, db: {} }));

const createMock = vi.fn();
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: { completions: { create: (...args: any[]) => createMock(...args) } },
  },
}));
vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  textToSpeech: vi.fn(),
}));

// Override hook for the curated+Wikipedia bridge error test (test 3 below)
// only — delegates to the real parseWikipediaOsmTag in every other test.
// This is the one dependency attemptNarrationWikipediaBridge calls without
// its own internal try/catch (fetchWikipediaSummary/selectEvidenceParagraphs/
// selectPrimaryUnit each already swallow their own errors and return a
// null/declined result instead of throwing), so it's the only available,
// non-invasive way to exercise the bridge's own outer .catch() -> "wikipedia_error"
// path in a black-box test.
let parseWikipediaOsmTagOverride: ((tag: string) => unknown) | null = null;
vi.mock("../lib/wikipediaEnrichment", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/wikipediaEnrichment")>();
  return {
    ...actual,
    parseWikipediaOsmTag: (tag: string) =>
      parseWikipediaOsmTagOverride
        ? parseWikipediaOsmTagOverride(tag)
        : actual.parseWikipediaOsmTag(tag),
  };
});

import {
  computeNarrationLeadAndSupport,
  hasMinimumNarrationEvidence,
  resolveNarrationEvidence,
  runNarrationJitEvidence,
} from "../routes/explore/index";

// Real approved curated entry (Green Room) from curatedLocalHistory.ts —
// reused here rather than a synthetic fixture so these tests exercise the
// actual production registry lookup, not a stand-in.
const GREEN_ROOM_SUBJECT_ID = "way/250863827";

// Real approved curated entries for the 4 curated+Wikipedia bridge's known
// live blast-radius subjects (curatedLocalHistory.ts) — reused directly
// rather than synthetic fixtures, same convention as GREEN_ROOM_SUBJECT_ID
// above.
const FILM_CENTER_SUBJECT_ID = "way/265320243";
const ACTORS_TEMPLE_SUBJECT_ID = "way/265322610";
const ACTORS_STUDIO_SUBJECT_ID = "way/265319542";
const LIBRARY_HOTEL_SUBJECT_ID = "way/265875639";

function wikiFetchResponse(pageTitle: string, extract: string) {
  return {
    ok: true,
    json: async () => ({
      query: { pages: { "1": { pageid: 1, title: pageTitle, extract } } },
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  createMock.mockReset();
  parseWikipediaOsmTagOverride = null;
});

// ---------------------------------------------------------------------------
// runNarrationJitEvidence — curated-before-Wikipedia evidence order
// ---------------------------------------------------------------------------

describe("runNarrationJitEvidence — curated evidence checked before Wikipedia (evidence-floor fix)", () => {
  it("(1) approved curated evidence + no wikipediaTag → curatedSuccess (Green Room)", async () => {
    const result = await runNarrationJitEvidence(
      "osm",
      GREEN_ROOM_SUBJECT_ID,
      undefined,
      "Green Room",
      "1940 Green Street",
    );
    expect(result.outcome).toBe("curatedSuccess");
    expect(result.factText).toContain("Pop");
  });

  it("approved curated evidence wins even when a wikipediaTag is also present, without any network/LLM call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await runNarrationJitEvidence(
      "osm",
      GREEN_ROOM_SUBJECT_ID,
      "en:Some_Other_Article",
      "Green Room",
      "1940 Green Street",
    );
    expect(result.outcome).toBe("curatedSuccess");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("(2) osm candidate with no curated entry falls back to Wikipedia JIT — success proceeds (Bergdoll)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          wikiFetchResponse(
            "Bergdoll Mansion",
            "The Bergdoll Mansion was originally built as a private residence in eighteen ninety and later became a boarding house before the family sold it.",
          ),
        ),
    );
    createMock
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ selected_indices: [1] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ selected_index: 1 }) } },
        ],
      });

    const result = await runNarrationJitEvidence(
      "osm",
      "way/nonexistent-not-curated",
      "en:Bergdoll_Mansion_Test_2",
      "Bergdoll Mansion",
      undefined,
    );
    expect(result.outcome).toBe("wikipediaSuccess");
    expect(result.factText).toBeTruthy();
  });

  it("osm candidate with neither curated entry nor wikipediaTag → skippedNoWikipediaTag (existing behavior unchanged)", async () => {
    const result = await runNarrationJitEvidence(
      "osm",
      "way/nonexistent-not-curated-2",
      undefined,
      "Some Place",
      undefined,
    );
    expect(result.outcome).toBe("skippedNoWikipediaTag");
    expect(result.factText).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasMinimumNarrationEvidence — deterministic evidence-PRESENCE floor
// (not a narration-quality judgment; no LLM evaluator, no lexical heuristics
// such as years/civic terms/word count)
// ---------------------------------------------------------------------------

describe("hasMinimumNarrationEvidence — deterministic evidence-presence floor before copy generation", () => {
  it("(3) no curated + no wiki + placeholder summary + no facts → suppressed (Enon)", () => {
    const passes = hasMinimumNarrationEvidence({
      jitOutcome: "skippedNoWikipediaTag",
      summary: "A notable place in this area.",
      narrationFacts: undefined,
    });
    expect(passes).toBe(false);
  });

  it("curatedSuccess always proceeds, regardless of summary/facts shape (Green Room)", () => {
    const passes = hasMinimumNarrationEvidence({
      jitOutcome: "curatedSuccess",
      summary: "A bar on Green Street.",
      narrationFacts: [
        'During the Depression, the corner store at 1940 Green Street was run by a local grocer remembered as "Pop" Plumer.',
      ],
    });
    expect(passes).toBe(true);
  });

  it("wikipediaSuccess always proceeds, regardless of summary/facts shape (Bergdoll)", () => {
    const passes = hasMinimumNarrationEvidence({
      jitOutcome: "wikipediaSuccess",
      summary: "A historic mansion.",
      narrationFacts: [
        "The Bergdoll Mansion was originally built as a private residence and later became a boarding house.",
      ],
    });
    expect(passes).toBe(true);
  });

  it("(4) modest, specific single fallback fact overrides an otherwise-placeholder summary → proceeds", () => {
    // No curated/Wikipedia success; the placeholder summary alone would
    // suppress, but a single non-empty fact is enough to pass this narrow
    // presence floor — no judgment is made about how substantive the fact is.
    const passes = hasMinimumNarrationEvidence({
      jitOutcome: "skippedNoWikipediaTag",
      summary: "A notable place in this area.",
      narrationFacts: [
        "The building was originally a firehouse before it was converted into apartments.",
      ],
    });
    expect(passes).toBe(true);
  });

  it("(5) jitOutcome details beyond success/non-success do not drive the result — only summary shape + fact presence do", () => {
    // Two different non-success jitOutcome values, both with the exact
    // placeholder summary and no facts, must suppress identically. This
    // predicate has no tier/trustLevel input at all, so there is nothing for
    // upstream trust signals to influence.
    const base = {
      summary: "A notable place in this area.",
      narrationFacts: undefined,
    };
    expect(
      hasMinimumNarrationEvidence({
        jitOutcome: "skippedNoWikipediaTag",
        ...base,
      }),
    ).toBe(false);
    expect(
      hasMinimumNarrationEvidence({
        jitOutcome: "skippedNoTrustworthyIdentity",
        ...base,
      }),
    ).toBe(false);
  });

  it("(6) known intentional limitation: a generic but non-placeholder-shaped fallback summary with no facts still proceeds", () => {
    // This narrow pass only suppresses the EXACT known placeholder/default
    // summary shape with no facts — it does not attempt to detect other,
    // non-exact generic summary text. A generic-but-different summary with no
    // facts currently proceeds. This is a known, intentional limitation of
    // this pass (see task scope: no lexical/story-quality heuristics).
    const passes = hasMinimumNarrationEvidence({
      jitOutcome: "skippedNoWikipediaTag",
      summary: "A building along Market Street.",
      narrationFacts: undefined,
    });
    expect(passes).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveNarrationEvidence — shared orchestration used by both narration routes
// ---------------------------------------------------------------------------

describe("resolveNarrationEvidence — evidence resolution order and diagnostics", () => {
  it("curatedEvidenceFoundBeforeJit is true and narrationFacts is enriched when curated evidence resolves (Green Room)", async () => {
    const result = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: GREEN_ROOM_SUBJECT_ID,
      wikipediaTag: undefined,
      placeName: "Green Room",
      address: "1940 Green Street",
      facts: [],
    });
    expect(result.curatedEvidenceFoundBeforeJit).toBe(true);
    expect(result.jitOutcome).toBe("curatedSuccess");
    expect(result.narrationFacts?.some((f) => f.includes("Pop"))).toBe(true);
  });

  it("skips JIT and leaves narrationFacts unchanged when evidenceRef is already present (existing behavior unchanged)", async () => {
    const facts = ["An existing discover-time fact."];
    const result = await resolveNarrationEvidence({
      evidenceRef: "some-correlation-token",
      candidateSource: "osm",
      subjectId: GREEN_ROOM_SUBJECT_ID,
      wikipediaTag: undefined,
      placeName: "Green Room",
      address: "1940 Green Street",
      facts,
    });
    expect(result.jitOutcome).toBe("skippedHasEvidenceRef");
    expect(result.curatedEvidenceFoundBeforeJit).toBe(false);
    expect(result.narrationFacts).toBe(facts);
  });

  it("skips JIT for untrustworthy/absent candidateSource and leaves narrationFacts unchanged", async () => {
    const facts = ["An existing discover-time fact."];
    const result = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "llm",
      subjectId: undefined,
      wikipediaTag: undefined,
      placeName: "Some Place",
      address: undefined,
      facts,
    });
    expect(result.jitOutcome).toBe("skippedNoTrustworthyIdentity");
    expect(result.narrationFacts).toBe(facts);
  });
});

// ---------------------------------------------------------------------------
// End-to-end acceptance scenarios: Green Room / Enon / Bergdoll
// ---------------------------------------------------------------------------

describe("Green Room / Enon / Bergdoll acceptance scenarios (resolveNarrationEvidence + hasMinimumNarrationEvidence)", () => {
  it("Green Room: curated evidence found before no-Wikipedia skip, floor passes, narration proceeds", async () => {
    const resolved = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: GREEN_ROOM_SUBJECT_ID,
      wikipediaTag: undefined,
      placeName: "Green Room",
      address: "1940 Green Street",
      facts: [],
    });
    expect(resolved.jitOutcome).toBe("curatedSuccess");
    const passes = hasMinimumNarrationEvidence({
      jitOutcome: resolved.jitOutcome,
      summary: "A bar on Green Street.",
      narrationFacts: resolved.narrationFacts,
    });
    expect(passes).toBe(true);
  });

  it("Enon: no wikipediaTag, no curated entry, no meaningful fallback — resolution completes with no qualifying fact, floor suppresses", async () => {
    const resolved = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: "way/enon-not-curated",
      wikipediaTag: undefined,
      placeName: "Enon Baptist Church",
      address: undefined,
      facts: [],
    });
    expect(resolved.jitOutcome).toBe("skippedNoWikipediaTag");
    const passes = hasMinimumNarrationEvidence({
      jitOutcome: resolved.jitOutcome,
      summary: "A notable place in this area.",
      narrationFacts: resolved.narrationFacts,
    });
    expect(passes).toBe(false);
  });

  it("Bergdoll: Wikipedia JIT succeeds, floor passes, narration proceeds with no ordering/prose change", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          wikiFetchResponse(
            "Bergdoll Mansion",
            "The Bergdoll Mansion was originally built as a private residence in eighteen ninety and later became a boarding house before the family sold it.",
          ),
        ),
    );
    createMock
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ selected_indices: [1] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ selected_index: 1 }) } },
        ],
      });

    const resolved = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: "way/bergdoll-not-curated",
      wikipediaTag: "en:Bergdoll_Mansion_Test_3",
      placeName: "Bergdoll Mansion",
      address: undefined,
      facts: [],
    });
    expect(resolved.jitOutcome).toBe("wikipediaSuccess");
    const passes = hasMinimumNarrationEvidence({
      jitOutcome: resolved.jitOutcome,
      summary: "A historic mansion.",
      narrationFacts: resolved.narrationFacts,
    });
    expect(passes).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task C — curated+Wikipedia narration bridge (2026-10-05)
// Known live blast radius: Film Center Building (way/265320243), Actors'
// Temple (way/265322610), The Actors Studio (way/265319542), Library Hotel
// (way/265875639).
// ---------------------------------------------------------------------------

describe("resolveNarrationEvidence — curated+Wikipedia narration bridge", () => {
  it("(1) curated-only subject with no wikipediaTag: unchanged curated-only behavior, no network/LLM call (Actors Studio)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: ACTORS_STUDIO_SUBJECT_ID,
      wikipediaTag: undefined,
      placeName: "The Actors Studio",
      address: "432 West 44th Street",
      facts: [],
    });
    expect(result.jitOutcome).toBe("curatedSuccess");
    expect(result.bridgeOutcome).toBe("curated_only");
    expect(result.primaryStory).toBeNull();
    expect(
      result.narrationFacts?.some((f) => f.includes("Bricklayer Greek")),
    ).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("(2) Wikipedia timeout during the bridge attempt still returns curated evidence unchanged (Film Center)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})), // never resolves
    );
    const resultPromise = resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: FILM_CENTER_SUBJECT_ID,
      wikipediaTag: "en:Film_Center_Building_Bridge_Test_Timeout",
      placeName: "Film Center Building",
      address: "630 Ninth Avenue",
      facts: [],
    });
    await vi.advanceTimersByTimeAsync(4_000);
    const result = await resultPromise;
    expect(result.jitOutcome).toBe("curatedSuccess");
    expect(result.curatedEvidenceFoundBeforeJit).toBe(true);
    expect(result.narrationFacts?.some((f) => f.includes("Jacques Kahn"))).toBe(
      true,
    );
    expect(result.bridgeOutcome).toBe("wikipedia_timeout");
    expect(result.primaryStory).toBeNull();
  });

  it("(3) Wikipedia error during the bridge attempt still returns curated evidence unchanged (Film Center)", async () => {
    parseWikipediaOsmTagOverride = () => {
      throw new Error("simulated bridge error");
    };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: FILM_CENTER_SUBJECT_ID,
      wikipediaTag: "en:Film_Center_Building_Bridge_Test_Error",
      placeName: "Film Center Building",
      address: "630 Ninth Avenue",
      facts: [],
    });
    expect(result.jitOutcome).toBe("curatedSuccess");
    expect(result.curatedEvidenceFoundBeforeJit).toBe(true);
    expect(result.narrationFacts?.some((f) => f.includes("Jacques Kahn"))).toBe(
      true,
    );
    expect(result.bridgeOutcome).toBe("wikipedia_error");
    expect(result.primaryStory).toBeNull();
  });

  it("(4) a Wikipedia extract consisting only of already-admitted spans is suppressed as overlap, curated preserved (Library Hotel)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          wikiFetchResponse(
            "Library Hotel",
            "The hotel was designed by architect Stephen B. Jacobs. Due to this classification scheme, the hotel owners were sued in 2003 by OCLC (owners of the Dewey Decimal Classification system).",
          ),
        ),
    );
    const result = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: LIBRARY_HOTEL_SUBJECT_ID,
      wikipediaTag: "en:Library_Hotel_Bridge_Test_Overlap",
      placeName: "Library Hotel",
      address: "299 Madison Avenue",
      facts: [],
    });
    expect(result.jitOutcome).toBe("curatedSuccess");
    expect(
      result.narrationFacts?.some((f) => f.includes("Stephen B. Jacobs")),
    ).toBe(true);
    expect(result.bridgeOutcome).toBe("wikipedia_suppressed_overlap");
    expect(result.primaryStory).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("(5) a distinct, worthwhile Wikipedia unit becomes primaryStory while curated evidence remains supporting (Film Center)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          wikiFetchResponse(
            "Film Center Building",
            "The building later became associated with a brief industrial safety concern after a nitrate film fire broke out in a screening room during the 1930s, prompting the installation of new fireproofing standards throughout the Theater District.",
          ),
        ),
    );
    createMock
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ selected_indices: [1] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                angle: {
                  central_question:
                    "What happened in a screening room during the 1930s that changed fireproofing standards throughout the Theater District?",
                  perspective_shift:
                    "A nitrate film fire broke out in a screening room during the 1930s, after which new fireproofing standards appeared across the Theater District.",
                  source_unit_ids: ["u1"],
                },
              }),
            },
          },
        ],
      });

    const result = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: FILM_CENTER_SUBJECT_ID,
      wikipediaTag: "en:Film_Center_Building_Bridge_Test_Distinct",
      placeName: "Film Center Building",
      address: "630 Ninth Avenue",
      facts: [],
    });
    expect(result.jitOutcome).toBe("curatedSuccess");
    expect(result.bridgeOutcome).toBe("wikipedia_primary_retained");
    expect(result.primaryStory).toContain("nitrate film fire");
    expect(result.narrationFacts?.some((f) => f.includes("Jacques Kahn"))).toBe(
      true,
    );
  });

  it("(6) weaker/generic Wikipedia content does not displace Actors' Temple's curated story", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          wikiFetchResponse(
            "Actors' Temple",
            "The building is a five-story structure located on West 47th Street in Manhattan.",
          ),
        ),
    );
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              selected_indices: [],
              insufficient: true,
            }),
          },
        },
      ],
    });

    const result = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: ACTORS_TEMPLE_SUBJECT_ID,
      wikipediaTag: "en:Actors_Temple_Bridge_Test_Weak",
      placeName: "Actors' Temple",
      address: "339 West 47th Street",
      facts: [],
    });
    expect(result.jitOutcome).toBe("curatedSuccess");
    expect(
      result.narrationFacts?.some((f) =>
        f.includes("became known as the Actors' Temple"),
      ),
    ).toBe(true);
    expect(result.bridgeOutcome).toBe("wikipedia_insufficient");
    expect(result.primaryStory).toBeNull();
  });

  it("(7) already-admitted Wikipedia spans are subtracted before selection, so only genuinely new content can become primaryStory (Library Hotel)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          wikiFetchResponse(
            "Library Hotel",
            "The hotel was designed by architect Stephen B. Jacobs. Due to this classification scheme, the hotel owners were sued in 2003 by OCLC (owners of the Dewey Decimal Classification system). The hotel's lobby reading room displays donated volumes organized by the Dewey Decimal Classification system for guests to borrow.",
          ),
        ),
    );
    createMock
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ selected_indices: [1] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                angle: {
                  central_question:
                    "What is the Dewey Decimal Classification system doing in the hotel's lobby reading room?",
                  perspective_shift:
                    "The hotel's lobby reading room displays donated volumes organized by the Dewey Decimal Classification system, inviting guests to browse and borrow at their own pace.",
                  source_unit_ids: ["u1"],
                },
              }),
            },
          },
        ],
      });

    const result = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: LIBRARY_HOTEL_SUBJECT_ID,
      wikipediaTag: "en:Library_Hotel_Bridge_Test_Distinct",
      placeName: "Library Hotel",
      address: "299 Madison Avenue",
      facts: [],
    });
    expect(result.bridgeOutcome).toBe("wikipedia_primary_retained");
    expect(result.primaryStory).toContain("lobby reading room");
    expect(result.primaryStory).not.toContain("Stephen B. Jacobs");
    expect(result.primaryStory).not.toContain("sued in 2003");
  });

  it("(8) discover-time summary is demoted to supporting only when a Wikipedia primaryStory is retained", () => {
    const withPrimary = computeNarrationLeadAndSupport(
      "A theater building from the 1920s.",
      ["Curated supporting fact."],
      "A distinct Wikipedia primary story.",
    );
    expect(withPrimary.narrationLead).toBe(
      "A distinct Wikipedia primary story.",
    );
    expect(withPrimary.supportingNotes).toEqual([
      "A theater building from the 1920s.",
      "Curated supporting fact.",
    ]);

    const withoutPrimary = computeNarrationLeadAndSupport(
      "A theater building from the 1920s.",
      ["Curated supporting fact."],
      null,
    );
    expect(withoutPrimary.narrationLead).toBe(
      "A theater building from the 1920s.",
    );
    expect(withoutPrimary.supportingNotes).toEqual([
      "Curated supporting fact.",
    ]);
  });

  it("(9) no behavior change for ordinary no-curated Wikipedia JIT candidates (bridge does not apply)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          wikiFetchResponse(
            "Ordinary Place",
            "The building was converted from a warehouse into loft apartments in the 1980s, part of a broader wave of adaptive reuse along the waterfront.",
          ),
        ),
    );
    createMock
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ selected_indices: [1] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ selected_index: 1 }) } },
        ],
      });

    const result = await resolveNarrationEvidence({
      evidenceRef: undefined,
      candidateSource: "osm",
      subjectId: "way/bridge-test-9-not-curated",
      wikipediaTag: "en:Bridge_Test_9_Ordinary_Place",
      placeName: "Ordinary Place",
      address: undefined,
      facts: [],
    });
    expect(result.jitOutcome).toBe("wikipediaSuccess");
    expect(result.bridgeOutcome).toBeUndefined();
    expect(result.primaryStory).toBeNull();
    expect(
      result.narrationFacts?.some((f) => f.includes("adaptive reuse")),
    ).toBe(true);
  });
});
