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

import {
  hasMinimumNarrationEvidence,
  resolveNarrationEvidence,
  runNarrationJitEvidence,
} from "../routes/explore/index";

// Real approved curated entry (Green Room) from curatedLocalHistory.ts —
// reused here rather than a synthetic fixture so these tests exercise the
// actual production registry lookup, not a stand-in.
const GREEN_ROOM_SUBJECT_ID = "way/250863827";

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
  createMock.mockReset();
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
