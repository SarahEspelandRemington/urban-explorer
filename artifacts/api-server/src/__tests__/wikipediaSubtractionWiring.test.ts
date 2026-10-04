import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ pool: {}, db: {} }));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));
vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  textToSpeech: vi.fn(),
}));

import { applyAdmittedWikipediaSubtraction } from "../routes/explore/index";
import type { WikipediaSummary } from "../lib/wikipediaEnrichment";

// Real production registry entries — reused rather than synthetic fixtures
// so these tests exercise the actual promoted/curated data, not a stand-in.
const LIBRARY_HOTEL_SUBJECT_ID = "way/265875639"; // GENERATED_LOCAL_HISTORY, has wikipediaSupportingSpans
const GREEN_ROOM_SUBJECT_ID = "way/250863827"; // CURATED_LOCAL_HISTORY, hand-authored, no wikipediaSupportingSpans
const NO_ENTRY_SUBJECT_ID = "way/999999999"; // not present in either registry

// Same real, trimmed plaintext extract used in wikipediaContentSubtraction.test.ts
// (fetched live 2026-10-02).
const LIBRARY_HOTEL_EXTRACT = `Library Hotel is a 60-room boutique hotel in Midtown Manhattan, New York City. It is located at 299 Madison Avenue (at 41st Street), near Bryant Park, the New York Public Library Main Branch, and Grand Central Terminal. The hotel was designed by architect Stephen B. Jacobs.
Each of the Library Hotel's ten guest floors is themed after a major category of the Dewey Decimal Classification. The 5th floor, for example, is the 500s (the Sciences). Each room is a subcategory or genre, such as Mathematics (Room 500.001) or Botany (Room 500.004). Dewey categories 000, 100, and 200 are placed on the 10th, 11th, and 12th floors, respectively. There are 50-100 books and decorations in each room that accompany the theme, for a total of 6,000 books throughout the hotel.
Due to this classification scheme, the hotel owners were sued in 2003 by OCLC (owners of the Dewey Decimal Classification system). OCLC subsequently reached an agreement with the hotel owners, thus enabling the hotel to continue using the Dewey system.`;

const OCLC_SENTENCE =
  "Due to this classification scheme, the hotel owners were sued in 2003 by OCLC (owners of the Dewey Decimal Classification system).";

function wikiSummary(extract: string): WikipediaSummary {
  return { title: "Library Hotel", extract, lang: "en" };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyAdmittedWikipediaSubtraction — Library Hotel (promoted, has wikipediaSupportingSpans)", () => {
  it("removes the admitted OCLC lawsuit sentence from the wikiMap entry", () => {
    const wikiMap = new Map<string, WikipediaSummary>([
      [LIBRARY_HOTEL_SUBJECT_ID, wikiSummary(LIBRARY_HOTEL_EXTRACT)],
    ]);
    applyAdmittedWikipediaSubtraction(wikiMap);
    const extract = wikiMap.get(LIBRARY_HOTEL_SUBJECT_ID)?.extract ?? "";
    expect(extract).not.toContain(OCLC_SENTENCE);
    expect(extract).not.toContain("sued in 2003");
  });

  it("preserves Dewey theming material", () => {
    const wikiMap = new Map<string, WikipediaSummary>([
      [LIBRARY_HOTEL_SUBJECT_ID, wikiSummary(LIBRARY_HOTEL_EXTRACT)],
    ]);
    applyAdmittedWikipediaSubtraction(wikiMap);
    const extract = wikiMap.get(LIBRARY_HOTEL_SUBJECT_ID)?.extract ?? "";
    expect(extract).toContain(
      "Each of the Library Hotel's ten guest floors is themed after a major category of the Dewey Decimal Classification.",
    );
    expect(extract).toContain("the 500s (the Sciences)");
  });

  it("preserves the unclaimed OCLC agreement follow-up sentence", () => {
    const wikiMap = new Map<string, WikipediaSummary>([
      [LIBRARY_HOTEL_SUBJECT_ID, wikiSummary(LIBRARY_HOTEL_EXTRACT)],
    ]);
    applyAdmittedWikipediaSubtraction(wikiMap);
    const extract = wikiMap.get(LIBRARY_HOTEL_SUBJECT_ID)?.extract ?? "";
    expect(extract).toContain(
      "OCLC subsequently reached an agreement with the hotel owners, thus enabling the hotel to continue using the Dewey system.",
    );
  });

  it("now that the shared sentence-splitter's middle-initial bug is fixed, the complete architect sentence (no longer a truncated 'Stephen B.' fragment) is correctly subtracted too, same as the OCLC sentence", () => {
    const wikiMap = new Map<string, WikipediaSummary>([
      [LIBRARY_HOTEL_SUBJECT_ID, wikiSummary(LIBRARY_HOTEL_EXTRACT)],
    ]);
    applyAdmittedWikipediaSubtraction(wikiMap);
    const extract = wikiMap.get(LIBRARY_HOTEL_SUBJECT_ID)?.extract ?? "";
    expect(extract).not.toContain(
      "The hotel was designed by architect Stephen B. Jacobs.",
    );
    expect(extract).not.toContain("Stephen B.");
  });

  it("the shared wikiMap entry both downstream consumers (plain fallback + A3 selector input) would read already reflects the subtraction", () => {
    // formatForCopy's fallback reads wikiSummary.extract, and the A3
    // selector (selectEvidenceParagraphs) reads summary.extract from the
    // exact same wikiMap.get(c.osmId) value — there is only one Map and one
    // entry per osmId, so this single assertion covers both call sites.
    const wikiMap = new Map<string, WikipediaSummary>([
      [LIBRARY_HOTEL_SUBJECT_ID, wikiSummary(LIBRARY_HOTEL_EXTRACT)],
    ]);
    applyAdmittedWikipediaSubtraction(wikiMap);
    const sharedEntry = wikiMap.get(LIBRARY_HOTEL_SUBJECT_ID);
    expect(sharedEntry?.extract).not.toContain(OCLC_SENTENCE);
  });
});

describe("applyAdmittedWikipediaSubtraction — no curated entry", () => {
  it("leaves the wikiMap entry completely unchanged (same object reference) when no curated entry exists", () => {
    const original = wikiSummary(LIBRARY_HOTEL_EXTRACT);
    const wikiMap = new Map<string, WikipediaSummary>([
      [NO_ENTRY_SUBJECT_ID, original],
    ]);
    applyAdmittedWikipediaSubtraction(wikiMap);
    expect(wikiMap.get(NO_ENTRY_SUBJECT_ID)).toBe(original);
    expect(wikiMap.get(NO_ENTRY_SUBJECT_ID)?.extract).toContain(OCLC_SENTENCE);
  });
});

describe("applyAdmittedWikipediaSubtraction — existing non-Wikipedia curated entry (Green Room)", () => {
  it("leaves the wikiMap entry unchanged because the curated entry has no wikipediaSupportingSpans", () => {
    const original = wikiSummary(LIBRARY_HOTEL_EXTRACT);
    const wikiMap = new Map<string, WikipediaSummary>([
      [GREEN_ROOM_SUBJECT_ID, original],
    ]);
    applyAdmittedWikipediaSubtraction(wikiMap);
    expect(wikiMap.get(GREEN_ROOM_SUBJECT_ID)).toBe(original);
  });
});

describe("applyAdmittedWikipediaSubtraction — shared fetch-cache safety", () => {
  it("does not mutate the original fetched summary object in place; only the wikiMap entry is replaced with a clone", () => {
    const original = wikiSummary(LIBRARY_HOTEL_EXTRACT);
    const wikiMap = new Map<string, WikipediaSummary>([
      [LIBRARY_HOTEL_SUBJECT_ID, original],
    ]);
    applyAdmittedWikipediaSubtraction(wikiMap);

    // The original object (as if shared with the in-memory Wikipedia fetch
    // cache used by other requests) must be untouched.
    expect(original.extract).toBe(LIBRARY_HOTEL_EXTRACT);
    expect(original.extract).toContain(OCLC_SENTENCE);

    // The wikiMap entry itself must be a different object, carrying the
    // subtracted extract.
    const replaced = wikiMap.get(LIBRARY_HOTEL_SUBJECT_ID);
    expect(replaced).not.toBe(original);
    expect(replaced?.extract).not.toContain(OCLC_SENTENCE);
  });
});
