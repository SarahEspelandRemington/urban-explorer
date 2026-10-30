import { describe, expect, it } from "vitest";
import {
  buildCopyGenRequest,
  buildCopyGenSystemPrompt,
  buildOsmAddr,
  formatCandidateForCopyGen,
  parseCopyGenResponseContent,
  sanitizeOSMText,
  WIKIPEDIA_GROUNDING_ENVELOPE_CHARS,
  WIKIPEDIA_GROUNDING_ENVELOPE_CHARS_LEGACY,
  COPY_GEN_MAX_COMPLETION_TOKENS,
  COPY_GEN_MODEL,
  type CopyGenCandidateInput,
} from "./copyGenRequestBuilder";
import { OSM_COPY_RULES } from "./osmTrustLevel";
import { CURATED_COPY_RULES } from "./curatedLocalHistory";
import type { WikipediaSummary } from "./wikipediaEnrichment";

// ---------------------------------------------------------------------------
// Reference ("legacy") implementation — a faithful, standalone reconstruction
// of the pre-extraction inline construction that used to live directly in
// routes/explore/index.ts (formatForCopy + the copy-gen system/user message
// assembly), reproduced here verbatim from the pre-extraction source so
// these tests can prove the new module is byte-for-byte equivalent to what
// production actually shipped, not just internally self-consistent.
// ---------------------------------------------------------------------------

const LEGACY_HINT_TAGS = [
  "historic",
  "description",
  "heritage:description",
  "start_date",
  "wikidata",
  "wikipedia",
  "operator",
  "denomination",
  "alt_name",
  "architect",
  "building:material",
  "building:levels",
] as const;

function legacyBuildOsmAddr(tags: Record<string, string>): string {
  const num = tags["addr:housenumber"] ?? "";
  const street = tags["addr:street"] ?? "";
  if (num && street) return `${num} ${street}`.trim();
  if (street) return street;
  return "";
}

function legacySanitizeOSMText(raw: string, maxLen = 80): string {
  return raw
    .replace(/[\n\r\t]/g, " ")
    .replace(
      /[^\x20-\x7E\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/g,
      "",
    )
    .trim()
    .slice(0, maxLen);
}

function legacyFormatForCopy(
  p: CopyGenCandidateInput,
  computeOsmTrustLevelFn: (tags: Record<string, string>) => string,
  getApprovedCuratedEntryFn: (osmId: string) => any,
  wikiSummary?: WikipediaSummary | null,
  enhancedWikipediaContent?: string,
  isPrimaryUnit?: boolean,
  // Sources the current constant rather than a frozen literal (2026-10-29):
  // this "legacy" truncation behavior is still an evolving part of
  // production, not a one-time extraction snapshot, so this reference must
  // track WIKIPEDIA_GROUNDING_ENVELOPE_CHARS_LEGACY's current value by
  // default — non-Walk-Mode discover requests never pass an explicit cap.
  wikipediaFallbackCap: number = WIKIPEDIA_GROUNDING_ENVELOPE_CHARS_LEGACY,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: p.osmId,
    name: p.name,
    type: p.type,
    trustLevel: computeOsmTrustLevelFn(p.tags),
  };
  const addr = legacyBuildOsmAddr(p.tags);
  if (addr) obj.address = addr;
  for (const key of LEGACY_HINT_TAGS) {
    const val = p.tags[key];
    if (val) obj[key] = legacySanitizeOSMText(val, 120);
  }
  if (enhancedWikipediaContent) {
    obj.wikipediaContent = enhancedWikipediaContent;
    if (isPrimaryUnit) obj.wikipediaUnitOnly = true;
  } else if (wikiSummary?.extract) {
    obj.wikipediaContent = wikiSummary.extract.slice(0, wikipediaFallbackCap);
  }
  const curatedEntry = getApprovedCuratedEntryFn(p.osmId);
  if (curatedEntry) {
    obj.curatedContent = curatedEntry.evidence.text;
    obj.curatedClaimScope = curatedEntry.evidence.claimScope;
    obj.curatedTrust = curatedEntry.evidence.curatedTrust;
  }
  return obj;
}

function legacyBuildSystemPrompt(): string {
  const copyResponseShapeHint = `Respond in JSON: {"results":[{"id":"...","summary":"One sentence.","facts":["...","..."],"tags":["3-5 relevant tags"],"yearBuilt":"1920s or omit","confidence":"high|medium|low"}]}`;

  return `You are a hyper-local urban historian writing brief copy for real places sourced from OpenStreetMap.

MANDATORY RULES:
1. Return exactly the same number of results as candidates provided.
2. The "id" in each result MUST exactly match the "id" in the corresponding candidate. Do NOT change, reorder, add, or remove any place.
3. Do NOT modify the name, latitude, longitude, or address of any place.
4. Do NOT invent a place that was not in the candidates list.
5–8. COPY RULES — apply based on the "trustLevel" field on each candidate:

${OSM_COPY_RULES.osm_enriched}

${OSM_COPY_RULES.osm_standard}

${OSM_COPY_RULES.osm_bare}

Flag any claim not directly supported by the candidate's tags with "Reportedly" or "According to local accounts."
9. NEVER write raw GPS coordinates in any text field.
10. DISPLAY TAGS — the "tags" array must contain only short, human-readable descriptor phrases a general audience would understand (e.g. "historic mansion", "place of worship", "Victorian building", "art deco", "immigrant heritage"). NEVER put raw database identifiers, Wikidata IDs (e.g. Q4891444), Wikipedia slugs, OSM field names (wikidata, wikipedia, building:levels, denomination, operator), key:value pairs, or any technical metadata in tags. Tags are user-visible copy, not metadata echo.
11. WIKIPEDIA CONTENT — when a candidate includes a "wikipediaContent" field, use it as factual grounding for the summary and facts. Write from it directly: you may quote or paraphrase. Do not invent claims beyond what it states. Do not mention Wikipedia or the article by name in the copy — just write good historical prose informed by the content. Standalone attribution facts — "designed by architect X", "built in year Y", "listed on the National Register", "in a Beaux Arts style" — are NOT sufficient on their own for a discovery-worthy summary. Only use them to anchor a broader story: explain why the architect matters, what else they built, who commissioned the building and why, or what notable events occurred here. If the Wikipedia content contains only architectural metadata with no narrative context (no notable people, no events, no transformation over time), reflect that in a lower-confidence summary rather than dressing up dry facts as a compelling discovery.
11a. SINGLE-UNIT WIKIPEDIA CONTENT — when a candidate's "wikipediaContent" is accompanied by "wikipediaUnitOnly": true, that field contains exactly one complete, already-selected source unit, not an excerpt of a larger passage. Write the summary and facts using ONLY what that unit states. Do not import facts from outside it, add causes, motives, or consequences it doesn't state, or infer a relationship to other information about the place. Do not construct a narrative arc beyond what the unit itself supports. Facts may restate or lightly rephrase the unit, but must not introduce anything beyond it — an empty facts array is acceptable rather than padding with unrelated OSM tag data.
12. CURATED LOCAL-HISTORY CONTENT — when a candidate includes a "curatedContent" field, curatedContent contains human-vetted evidence whose permitted claim strength is governed by "curatedTrust" and limited to the scope declared in "curatedClaimScope", independently of the candidate's OSM "trustLevel". Apply the rule below matching the candidate's curatedTrust value:

${CURATED_COPY_RULES.high}
${CURATED_COPY_RULES.medium}
${CURATED_COPY_RULES.low}

This rule 12 permission is independent of, and takes precedence over, the trustLevel-based restrictions in rules 5-8 (including the osm_bare restriction against dates, founding claims, and former-use claims) for claims that fall inside curatedClaimScope specifically. Rules 5-8 continue to govern any claim NOT grounded in curatedContent, including for osm_bare candidates — they do not forbid the specific claims inside curatedClaimScope that curatedContent supports. Outside the declared curatedClaimScope, "wikipediaContent" (if present) may still supplement with additional grounded, non-conflicting context. If "wikipediaContent" directly conflicts with a claim inside curatedClaimScope, follow curatedContent and omit the conflicting Wikipedia detail entirely — do not blend the two versions, average them, or present both as equally valid. As with rule 11, do not mention "curated," "verified," Wikipedia, or any source by name — write unified historical prose.

${copyResponseShapeHint}`;
}

function legacyBuildRequest(params: {
  candidates: CopyGenCandidateInput[];
  computeOsmTrustLevelFn: (tags: Record<string, string>) => string;
  getApprovedCuratedEntryFn: (osmId: string) => any;
  wikiMap: Map<string, WikipediaSummary | null | undefined>;
  selectorEnhancedWikiContent: Map<string, string>;
  selectorSingleUnitOsmIds: Set<string>;
  locationHint: string;
  wikipediaFallbackCap?: number;
}) {
  const {
    candidates,
    computeOsmTrustLevelFn,
    getApprovedCuratedEntryFn,
    wikiMap,
    selectorEnhancedWikiContent,
    selectorSingleUnitOsmIds,
    locationHint,
    wikipediaFallbackCap,
  } = params;
  return {
    model: "gpt-4.1-mini",
    max_completion_tokens: 3000,
    messages: [
      {
        role: "system" as const,
        content: legacyBuildSystemPrompt(),
      },
      {
        role: "user" as const,
        content: `Write historical copy for these real nearby places from OpenStreetMap near ${locationHint}:\n${JSON.stringify(
          candidates.map((c) =>
            legacyFormatForCopy(
              c,
              computeOsmTrustLevelFn,
              getApprovedCuratedEntryFn,
              wikiMap.get(c.osmId),
              selectorEnhancedWikiContent.get(c.osmId),
              selectorSingleUnitOsmIds.has(c.osmId),
              wikipediaFallbackCap,
            ),
          ),
        )}`,
      },
    ],
    response_format: { type: "json_object" as const },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import { computeOsmTrustLevel } from "./osmTrustLevel";
import { getApprovedCuratedEntry } from "./curatedLocalHistory";

const ENRICHED_CANDIDATE: CopyGenCandidateInput = {
  osmId: "way/111",
  name: "Grand Historic Theatre",
  type: "theatre",
  tags: {
    wikidata: "Q12345",
    wikipedia: "en:Grand Historic Theatre",
    historic: "yes",
    architect: "Herbert J. Krapp",
    "addr:housenumber": "252",
    "addr:street": "West 45th Street",
  },
};

const THIN_BUILDING_CANDIDATE: CopyGenCandidateInput = {
  osmId: "way/222",
  name: "Unnamed Building",
  type: "building",
  tags: {
    building: "yes",
    height: "29.56",
    source: "City of Philadelphia",
  },
};

// Real production registry entry, reused per-repo convention (see
// wikipediaSubtractionWiring.test.ts) rather than a synthetic curated fixture.
const CURATED_CANDIDATE: CopyGenCandidateInput = {
  osmId: "way/250863827",
  name: "The Green Room",
  type: "bar",
  tags: { amenity: "bar" },
};

const MULTI_CANDIDATES: CopyGenCandidateInput[] = [
  ENRICHED_CANDIDATE,
  THIN_BUILDING_CANDIDATE,
  CURATED_CANDIDATE,
];

function wikiSummary(extract: string): WikipediaSummary {
  return { title: "Grand Historic Theatre", extract, lang: "en" };
}

describe("formatCandidateForCopyGen — parity with pre-extraction formatForCopy", () => {
  it("matches for an enriched OSM/Wikipedia candidate", () => {
    const wiki = wikiSummary(
      "A long Wikipedia extract about this theatre. ".repeat(50),
    );
    const actual = formatCandidateForCopyGen(ENRICHED_CANDIDATE, wiki);
    const expected = legacyFormatForCopy(
      ENRICHED_CANDIDATE,
      computeOsmTrustLevel,
      getApprovedCuratedEntry,
      wiki,
    );
    expect(actual).toEqual(expected);
  });

  it("matches for a thin/bare building candidate", () => {
    const actual = formatCandidateForCopyGen(THIN_BUILDING_CANDIDATE);
    const expected = legacyFormatForCopy(
      THIN_BUILDING_CANDIDATE,
      computeOsmTrustLevel,
      getApprovedCuratedEntry,
    );
    expect(actual).toEqual(expected);
  });

  it("matches for a curated-rule candidate (real registry entry)", () => {
    const actual = formatCandidateForCopyGen(CURATED_CANDIDATE);
    const expected = legacyFormatForCopy(
      CURATED_CANDIDATE,
      computeOsmTrustLevel,
      getApprovedCuratedEntry,
    );
    expect(actual).toEqual(expected);
    // Sanity: this fixture actually exercises the curatedContent branch.
    expect(actual.curatedContent).toBeDefined();
  });

  it("matches with evidence-selector enhanced content + primary-unit flag", () => {
    const actual = formatCandidateForCopyGen(
      ENRICHED_CANDIDATE,
      null,
      "A single selected sentence unit.",
      true,
    );
    const expected = legacyFormatForCopy(
      ENRICHED_CANDIDATE,
      computeOsmTrustLevel,
      getApprovedCuratedEntry,
      null,
      "A single selected sentence unit.",
      true,
    );
    expect(actual).toEqual(expected);
  });

  it("truncates wikipediaContent at WIKIPEDIA_GROUNDING_ENVELOPE_CHARS_LEGACY (1,000) by default — non-Walk-Mode discover requests pass no explicit cap", () => {
    const longExtract = "x".repeat(6000);
    const actual = formatCandidateForCopyGen(
      ENRICHED_CANDIDATE,
      wikiSummary(longExtract),
    );
    expect(actual.wikipediaContent).toHaveLength(
      WIKIPEDIA_GROUNDING_ENVELOPE_CHARS_LEGACY,
    );
    expect(WIKIPEDIA_GROUNDING_ENVELOPE_CHARS_LEGACY).toBe(1_000);
  });

  it("truncates wikipediaContent at WIKIPEDIA_GROUNDING_ENVELOPE_CHARS (4,000) when Walk Mode passes the raised cap explicitly", () => {
    const longExtract = "x".repeat(6000);
    const actual = formatCandidateForCopyGen(
      ENRICHED_CANDIDATE,
      wikiSummary(longExtract),
      undefined,
      undefined,
      WIKIPEDIA_GROUNDING_ENVELOPE_CHARS,
    );
    expect(actual.wikipediaContent).toHaveLength(
      WIKIPEDIA_GROUNDING_ENVELOPE_CHARS,
    );
    expect(WIKIPEDIA_GROUNDING_ENVELOPE_CHARS).toBe(4_000);
  });
});

describe("buildCopyGenSystemPrompt — parity with pre-extraction inline system prompt", () => {
  it("matches byte-for-byte", () => {
    expect(buildCopyGenSystemPrompt()).toBe(legacyBuildSystemPrompt());
  });
});

describe("buildCopyGenRequest — parity with pre-extraction inline request construction", () => {
  function runParity(
    candidates: CopyGenCandidateInput[],
    wikipediaFallbackCap?: number,
  ) {
    const wikiMap = new Map<string, WikipediaSummary | null | undefined>([
      [
        ENRICHED_CANDIDATE.osmId,
        wikiSummary("Some real Wikipedia extract text."),
      ],
    ]);
    const selectorEnhancedWikiContent = new Map<string, string>();
    const selectorSingleUnitOsmIds = new Set<string>();
    const locationHint = "Midtown Manhattan";

    const actual = buildCopyGenRequest({
      candidates,
      wikiMap,
      selectorEnhancedWikiContent,
      selectorSingleUnitOsmIds,
      locationHint,
      wikipediaFallbackCap,
    });
    const expected = legacyBuildRequest({
      candidates,
      computeOsmTrustLevelFn: computeOsmTrustLevel,
      getApprovedCuratedEntryFn: getApprovedCuratedEntry,
      wikiMap,
      selectorEnhancedWikiContent,
      selectorSingleUnitOsmIds,
      locationHint,
      wikipediaFallbackCap,
    });
    return { actual, expected };
  }

  it("matches for a single enriched candidate", () => {
    const { actual, expected } = runParity([ENRICHED_CANDIDATE]);
    expect(actual).toEqual(expected);
  });

  it("matches for a thin/bare building candidate", () => {
    const { actual, expected } = runParity([THIN_BUILDING_CANDIDATE]);
    expect(actual).toEqual(expected);
  });

  it("matches for a curated-rule candidate", () => {
    const { actual, expected } = runParity([CURATED_CANDIDATE]);
    expect(actual).toEqual(expected);
  });

  it("matches for multi-candidate ordering (order preserved, not resorted)", () => {
    const { actual, expected } = runParity(MULTI_CANDIDATES);
    expect(actual).toEqual(expected);
    // Explicit order-preservation proof, independent of deep equality above.
    const actualIds = JSON.parse(
      actual.messages[1].content.split(":\n")[1],
    ).map((c: { id: string }) => c.id);
    expect(actualIds).toEqual(MULTI_CANDIDATES.map((c) => c.osmId));
  });

  it("matches when wikipediaFallbackCap is passed explicitly (Walk Mode's raised envelope)", () => {
    const longExtract = "y".repeat(6000);
    const wikiMap = new Map<string, WikipediaSummary | null | undefined>([
      [ENRICHED_CANDIDATE.osmId, wikiSummary(longExtract)],
    ]);
    const selectorEnhancedWikiContent = new Map<string, string>();
    const selectorSingleUnitOsmIds = new Set<string>();
    const locationHint = "Midtown Manhattan";

    const actual = buildCopyGenRequest({
      candidates: [ENRICHED_CANDIDATE],
      wikiMap,
      selectorEnhancedWikiContent,
      selectorSingleUnitOsmIds,
      locationHint,
      wikipediaFallbackCap: WIKIPEDIA_GROUNDING_ENVELOPE_CHARS,
    });
    const expected = legacyBuildRequest({
      candidates: [ENRICHED_CANDIDATE],
      computeOsmTrustLevelFn: computeOsmTrustLevel,
      getApprovedCuratedEntryFn: getApprovedCuratedEntry,
      wikiMap,
      selectorEnhancedWikiContent,
      selectorSingleUnitOsmIds,
      locationHint,
      wikipediaFallbackCap: WIKIPEDIA_GROUNDING_ENVELOPE_CHARS,
    });
    expect(actual).toEqual(expected);
    // Sanity: this actually exercises the raised 4,000-char cap, not the
    // 1,000-char default.
    const parsedCandidate = JSON.parse(
      actual.messages[1].content.split(":\n")[1],
    )[0];
    expect((parsedCandidate.wikipediaContent as string).length).toBe(
      WIKIPEDIA_GROUNDING_ENVELOPE_CHARS,
    );
  });

  it("exposes the exact production model/token-limit/response-format parameters", () => {
    const { actual } = runParity([ENRICHED_CANDIDATE]);
    expect(actual.model).toBe("gpt-4.1-mini");
    expect(actual.model).toBe(COPY_GEN_MODEL);
    expect(actual.max_completion_tokens).toBe(3000);
    expect(actual.max_completion_tokens).toBe(COPY_GEN_MAX_COMPLETION_TOKENS);
    expect(actual.response_format).toEqual({ type: "json_object" });
  });
});

describe("parseCopyGenResponseContent — parity with pre-extraction inline parsing", () => {
  it("parses a valid results array", () => {
    const content = JSON.stringify({
      results: [{ id: "way/1", summary: "s", facts: ["f"] }],
    });
    expect(parseCopyGenResponseContent(content)).toEqual([
      { id: "way/1", summary: "s", facts: ["f"] },
    ]);
  });

  it("returns [] for undefined/null/empty content, matching the legacy `if (copyContent)` guard", () => {
    expect(parseCopyGenResponseContent(undefined)).toEqual([]);
    expect(parseCopyGenResponseContent(null)).toEqual([]);
    expect(parseCopyGenResponseContent("")).toEqual([]);
  });

  it("returns [] when results is missing or not an array", () => {
    expect(parseCopyGenResponseContent(JSON.stringify({}))).toEqual([]);
    expect(
      parseCopyGenResponseContent(JSON.stringify({ results: "not-an-array" })),
    ).toEqual([]);
  });

  it("throws on malformed JSON, matching the legacy (uncaught) JSON.parse behavior", () => {
    expect(() => parseCopyGenResponseContent("{not valid json")).toThrow();
  });
});

describe("buildOsmAddr / sanitizeOSMText — parity with pre-extraction local functions", () => {
  it("buildOsmAddr matches legacy for housenumber+street, street-only, and empty", () => {
    expect(
      buildOsmAddr({ "addr:housenumber": "5", "addr:street": "Main St" }),
    ).toBe(
      legacyBuildOsmAddr({ "addr:housenumber": "5", "addr:street": "Main St" }),
    );
    expect(buildOsmAddr({ "addr:street": "Main St" })).toBe(
      legacyBuildOsmAddr({ "addr:street": "Main St" }),
    );
    expect(buildOsmAddr({})).toBe(legacyBuildOsmAddr({}));
  });

  it("sanitizeOSMText matches legacy for control chars, non-latin scripts, and truncation", () => {
    const raw = "Line one\nLine\ttwo\r 日本語 café — emoji🎉";
    expect(sanitizeOSMText(raw, 20)).toBe(legacySanitizeOSMText(raw, 20));
    expect(sanitizeOSMText(raw)).toBe(legacySanitizeOSMText(raw));
  });
});
