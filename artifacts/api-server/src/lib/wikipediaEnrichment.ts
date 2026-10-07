/**
 * Wikipedia enrichment helpers — pure functions only, no side effects.
 *
 * fetchWikipediaSummary lives in routes/explore/index.ts alongside the
 * other network-fetching + in-memory-cache helpers (fetchWikipediaPhoto
 * etc.). These pure utilities are in a separate file so they can be imported
 * and unit-tested without pulling in the full route module.
 */

/** Structured result from the Wikipedia REST v1 summary API. */
export interface WikipediaSummary {
  /** Canonical article title (may differ from the OSM tag slug after redirects). */
  title: string;
  /** Plain-text extract (one or two paragraphs). */
  extract: string;
  /** Short Wikidata-derived description when present (e.g. "historic house in Philadelphia"). */
  description?: string;
  /** Thumbnail image URL when present. */
  thumbnailUrl?: string;
  /** Canonical desktop article URL when present. */
  articleUrl?: string;
  /** Wikipedia language code used for the fetch (e.g. "en", "de"). */
  lang: string;
  /**
   * Provenance: how the article title was identified. "osmTag" means the
   * candidate carried an explicit OSM `wikipedia` tag; "wikidataSitelink"
   * means the tag was absent and the title was resolved from the
   * candidate's `wikidata` entity's explicit `enwiki` sitelink. Absent for
   * summaries built outside the candidate-resolution path (e.g. tests).
   */
  resolvedVia?: "osmTag" | "wikidataSitelink";
}

/**
 * Parse an OSM `wikipedia` tag value (e.g. `en:Bergdoll_Mansion`) into
 * a `{ lang, title }` pair.
 *
 * Returns `null` for malformed values:
 *  - no `:` separator
 *  - language code is not 2–3 lowercase ASCII letters
 *  - empty title after the colon
 */
export function parseWikipediaOsmTag(
  value: string,
): { lang: string; title: string } | null {
  if (!value || typeof value !== "string") return null;
  const colonIndex = value.indexOf(":");
  if (colonIndex < 1) return null;
  const lang = value.slice(0, colonIndex).trim().toLowerCase();
  const title = value
    .slice(colonIndex + 1)
    .trim()
    .replace(/ /g, "_");
  if (!lang || !title) return null;
  if (!/^[a-z]{2,3}$/.test(lang)) return null;
  return { lang, title };
}

/** Validates an OSM `wikidata` tag value: a bare Wikidata entity QID (e.g. `Q4891444`). */
export function isValidWikidataId(value: string | undefined): value is string {
  return typeof value === "string" && /^Q\d{1,12}$/.test(value);
}

/**
 * Extract the explicit English Wikipedia (`enwiki`) sitelink title from a
 * Wikidata `Special:EntityData/{id}.json` response, if present.
 *
 * Returns `null` for any shape that doesn't contain a valid `enwiki`
 * sitelink title — malformed, missing, or unexpected-shape responses fail
 * closed rather than guessing. Never inspects other sitelinks or falls back
 * to name-based matching.
 */
export function extractEnwikiSitelinkTitle(
  wikidataId: string,
  raw: unknown,
): string | null {
  if (!raw || typeof raw !== "object") return null;
  const entities = (raw as { entities?: unknown }).entities;
  if (!entities || typeof entities !== "object") return null;
  const entity = (entities as Record<string, unknown>)[wikidataId];
  if (!entity || typeof entity !== "object") return null;
  const sitelinks = (entity as { sitelinks?: unknown }).sitelinks;
  if (!sitelinks || typeof sitelinks !== "object") return null;
  const enwiki = (sitelinks as Record<string, unknown>).enwiki;
  if (!enwiki || typeof enwiki !== "object") return null;
  const title = (enwiki as { title?: unknown }).title;
  if (typeof title !== "string" || title.trim().length === 0) return null;
  return title;
}

/** Abbreviations whose trailing period should not be treated as a sentence end. */
const SENTENCE_SPLIT_ABBREVIATIONS = new Set([
  "u.s.",
  "u.k.",
  "u.s.a.",
  "d.c.",
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "jr.",
  "sr.",
  "st.",
  "ave.",
  "no.",
  "vs.",
  "etc.",
  "rev.",
  "gen.",
  "sen.",
  "rep.",
  "ft.",
  "mt.",
  "approx.",
  "inc.",
  "co.",
  "ltd.",
  "prof.",
  "capt.",
  "col.",
  "lt.",
]);

/**
 * Protects a "Firstname M. Lastname" personal-name middle initial (e.g.
 * "Stephen B. Jacobs", "Joe E. Lewis") from being misread by
 * `Intl.Segmenter` as a sentence end. Requires a capitalized word
 * immediately before the initial (the likely first name) AND a capitalized
 * word immediately after (the likely surname) — a genuine single-letter
 * sentence ending such as "...the letter A. The next chapter..." does not
 * match (the preceding word "letter" is lowercase), so ordinary sentence
 * boundaries still split normally. The following capitalized word is also
 * checked against SENTENCE_STARTER_STOPWORDS below to catch the remaining
 * ambiguous case where the preceding word IS capitalized but the period is
 * still a genuine sentence end (e.g. "Students lived in Dorm B. The
 * dormitory was razed in 1970.") — a real surname never collides with that
 * stoplist. Ported from the identical, already-shipped fix in
 * ../localHistoryAdmission/narrativeExtractor.ts's splitSentencesInParagraph
 * (commit 6f6b00e) — same proven pattern; this file's Intl.Segmenter-based
 * splitter has the same failure mode via an independent implementation.
 */
const SENTENCE_STARTER_STOPWORDS: ReadonlySet<string> = new Set([
  "The",
  "This",
  "That",
  "These",
  "Those",
  "It",
  "They",
  "He",
  "She",
  "We",
  "You",
  "I",
  "There",
  "In",
  "On",
  "At",
  "After",
  "Before",
  "During",
  "Each",
  "Every",
  "Both",
  "Due",
  "According",
  "Following",
  "However",
  "Meanwhile",
  "Today",
  "Later",
  "Eventually",
  "Subsequently",
]);
const MIDDLE_INITIAL_RE = /\b([A-Z][a-z]+)\s([A-Z])\.\s(?=([A-Z][a-z]+)\b)/g;
/** Placeholder swapped in for a protected middle-initial's period so
 *  `Intl.Segmenter` does not treat it as sentence-ending punctuation;
 *  restored to "." immediately after segmentation. */
const PROTECTED_PERIOD = "\u0000";

/**
 * Split a block of source text (e.g. an A3-selected Wikipedia paragraph) into
 * source-bounded sentence-level units, using the platform's built-in
 * `Intl.Segmenter` (no new NLP dependency). A rich source sentence containing
 * multiple facts is kept as one unit — this only splits on true sentence
 * boundaries (with an abbreviation-aware merge pass and a middle-initial
 * protection pass) and, secondarily, on semicolons joining independent
 * clauses. A clause with no letters at all (standalone junk/residue) is
 * always dropped as noise; a clause under 20 characters that DOES contain
 * letters is reattached to the preceding clause within the same sentence
 * rather than dropped, so a short-but-real mid-sentence fact (e.g. "...;
 * graphic art studios; ...") is never silently lost. A short clause with no
 * preceding clause to reattach to (e.g. an ordinary short sentence with no
 * semicolons) is unchanged, pre-existing behavior: still dropped as noise.
 */
export function splitIntoSentenceUnits(text: string): string[] {
  if (!text) return [];
  const protectedText = text.replace(
    MIDDLE_INITIAL_RE,
    (match, firstName: string, initial: string, nextWord: string) =>
      SENTENCE_STARTER_STOPWORDS.has(nextWord)
        ? match
        : `${firstName} ${initial}${PROTECTED_PERIOD} `,
  );
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  const raw = [...seg.segment(protectedText)].map((s) =>
    s.segment.replaceAll(PROTECTED_PERIOD, "."),
  );

  const merged: string[] = [];
  for (const piece of raw) {
    if (merged.length > 0) {
      const prevTrimmed = merged[merged.length - 1].trimEnd();
      const lastWord = prevTrimmed.split(/\s+/).pop() ?? "";
      if (SENTENCE_SPLIT_ABBREVIATIONS.has(lastWord.toLowerCase())) {
        merged[merged.length - 1] += piece;
        continue;
      }
    }
    merged.push(piece);
  }

  const units: string[] = [];
  for (const sentence of merged) {
    const parts: string[] = [];
    for (const rawPart of sentence.split(/;\s+/)) {
      const trimmed = rawPart.trim().replace(/[;\s]+$/, "");
      if (!/[A-Za-z]/.test(trimmed)) continue; // standalone junk/residue: always dropped
      if (trimmed.length < 20 && parts.length > 0) {
        // Too short to stand alone, but this clause came from inside an
        // otherwise valid multi-clause sentence — reattach it to the
        // preceding clause instead of silently dropping it.
        parts[parts.length - 1] += `; ${trimmed}`;
        continue;
      }
      parts.push(trimmed);
    }
    for (const part of parts) {
      if (part.length < 20) continue;
      units.push(part);
    }
  }
  return units;
}

/**
 * Build the prompt block injected into `buildDetailUserTurn` when a
 * Wikipedia summary has been successfully fetched.
 *
 * Kept as a pure function so the prompt contract is independently testable.
 * The block is clearly labelled to help the LLM distinguish fetched Wikipedia
 * prose (factual grounding it may quote/paraphrase) from OSM structured tags.
 */
export function buildWikiPromptBlock(summary: WikipediaSummary): string {
  const descLine = summary.description
    ? `\nDescription: ${summary.description}`
    : "";
  return (
    `WIKIPEDIA SOURCE CONTENT (fetched from ${summary.lang}.wikipedia.org — article: "${summary.title}"):\n` +
    `${summary.extract}${descLine}\n\n` +
    `Use this as factual grounding for your response. You may reference, quote, or paraphrase this content. ` +
    `Do not invent claims that go beyond the facts stated above and the OSM tags. ` +
    `Only Wikipedia was consulted — do not claim to have fetched Wikidata content.`
  );
}
