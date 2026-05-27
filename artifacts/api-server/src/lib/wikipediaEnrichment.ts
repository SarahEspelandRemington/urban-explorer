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
