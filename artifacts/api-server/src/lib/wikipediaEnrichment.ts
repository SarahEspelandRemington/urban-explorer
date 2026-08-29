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
 * Split a block of source text (e.g. an A3-selected Wikipedia paragraph) into
 * source-bounded sentence-level units, using the platform's built-in
 * `Intl.Segmenter` (no new NLP dependency). A rich source sentence containing
 * multiple facts is kept as one unit — this only splits on true sentence
 * boundaries (with an abbreviation-aware merge pass) and, secondarily, on
 * semicolons joining independent clauses. Fragments under 20 characters or
 * with no letters are dropped as noise.
 */
export function splitIntoSentenceUnits(text: string): string[] {
  if (!text) return [];
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  const raw = [...seg.segment(text)].map((s) => s.segment);

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
    for (const part of sentence.split(/;\s+/)) {
      const trimmed = part.trim().replace(/[;\s]+$/, "");
      if (trimmed.length < 20) continue;
      if (!/[A-Za-z]/.test(trimmed)) continue;
      units.push(trimmed);
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
