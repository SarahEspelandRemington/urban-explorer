/**
 * Ephemeral New York (ephemeralnewyork.wordpress.com) retrieval adapter —
 * NYC narrative-source portability proof (Ephemeral New York, first NYC
 * narrative-source case). Offline/non-production, experimental — see
 * ../README.md.
 *
 * Retrieval strategy (confirmed against the live site 2026-09-20, NOT
 * assumed from Hidden City's WordPress behavior):
 * 1. This is a WordPress.com-hosted blog, not self-hosted WordPress, and its
 *    theme differs from hiddenCityAdapter.ts's target in real ways (see
 *    below). Its /sitemap.xml root is a flat `<urlset>` (no `<sitemapindex>`,
 *    no post-sitemap*.xml chain the way Hidden City had) and is capped at
 *    roughly the ~100 most-recently-modified URLs — confirmed live, NOT a
 *    full ~15+ year archive enumeration mechanism the way Hidden City's
 *    post-sitemap chain was. Do not assume it can enumerate the full corpus.
 * 2. This module instead uses the site's own native on-site search
 *    (`/?s=QUERY&paged=N` — WordPress.com's built-in core search, confirmed
 *    live to be plain server-rendered HTML, no JS rendering required) as the
 *    enumeration mechanism for this bounded proof. This is a real,
 *    source-native feature of the site (not generic external web search),
 *    scoped per corridor-relevant query term rather than a full-corpus
 *    crawl — an intentional, documented scope choice for a single bounded
 *    corridor proof, not a limitation being hidden.
 * 3. Each article page is server-rendered HTML. Reliable fields, confirmed
 *    against multiple sampled corridor articles:
 *    - title: `<meta property="og:title" content="...">` (present on every
 *      sampled article; no fallback needed).
 *    - publishedAt: `<meta property="article:published_time" content="...">`
 *      (ISO 8601).
 *    - author: none. This is a single-author blog with no byline markup
 *      anywhere on the page (confirmed live) — always null.
 *    - bodyText: the `<div class="entry">` block — this theme's own
 *      convention, NOT "entry-content" as in hiddenCityAdapter.ts's target
 *      theme. Cut off before the Jetpack share/like/related-posts widget
 *      (`id="jp-post-flair"`), which reliably follows the last real
 *      paragraph and precedes tags/postmeta/comments. `wp-block-image`
 *      `<figure>` blocks (photo captions/credits) are stripped entirely so
 *      they never enter claim extraction as narrative sentences — the same
 *      caption-pollution problem hiddenCityAdapter.ts's wp-caption-text
 *      stripping addressed, just this theme's different markup for it.
 */

const FETCH_HEADERS = { "User-Agent": "streetlit-experimental-harness/0.1" };
const SEARCH_BASE = "https://ephemeralnewyork.wordpress.com/?s=";

export interface EphemeralArticle {
  url: string;
  title: string;
  publishedAt: string | null;
  bodyText: string;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#8217;/gi, "'")
    .replace(/&#8216;/gi, "'")
    .replace(/&#8220;/gi, '"')
    .replace(/&#8221;/gi, '"')
    .replace(/&#8211;/gi, "–")
    .replace(/&#8212;/gi, "—")
    .replace(/&#8230;/gi, "…")
    .replace(/&#39;/gi, "'");
}

function htmlFragmentToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      // wp-block-image figures/figcaptions are photo credits/captions, not
      // article body prose — must not enter claim extraction as sentences.
      .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
      .replace(/<(br|\/p|\/div|\/blockquote|\/li|\/h[1-6])\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function extractTitle(html: string): string {
  const og = html.match(/<meta property="og:title" content="([^"]*)"/i);
  return og ? decodeEntities(og[1]).trim() : "";
}

function extractPublishedAt(html: string): string | null {
  const m = html.match(
    /<meta property="article:published_time" content="([^"]*)"/i,
  );
  return m ? m[1] : null;
}

function extractBodyText(html: string): string {
  const start = html.search(/<div class="entry">/i);
  if (start === -1) return "";
  const rest = html.slice(start);
  const flairIdx = rest.search(/id="jp-post-flair"/i);
  const fragment = flairIdx === -1 ? rest : rest.slice(0, flairIdx);
  return htmlFragmentToPlainText(fragment);
}

/** Fetches and reduces one Ephemeral New York article to its structured fields. */
export async function fetchEphemeralArticle(
  url: string,
): Promise<EphemeralArticle> {
  const html = await fetchText(url);
  return {
    url,
    title: extractTitle(html),
    publishedAt: extractPublishedAt(html),
    bodyText: extractBodyText(html),
  };
}

export interface EphemeralSearchHit {
  url: string;
  title: string;
}

const SEARCH_RESULT_RE =
  /<h3><a href="(https:\/\/ephemeralnewyork\.wordpress\.com\/[^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/gi;

async function fetchSearchPage(
  query: string,
  page: number,
): Promise<EphemeralSearchHit[]> {
  const url = `${SEARCH_BASE}${encodeURIComponent(query)}${page > 1 ? `&paged=${page}` : ""}`;
  const html = await fetchText(url);
  const hits: EphemeralSearchHit[] = [];
  for (const m of html.matchAll(SEARCH_RESULT_RE)) {
    hits.push({ url: m[1], title: htmlFragmentToPlainText(m[2]) });
  }
  return hits;
}

/**
 * Enumerates every distinct article the site's own search returns for one
 * query term, following `&paged=N` (confirmed live: 10 results/page) until
 * an empty page or maxPages is reached. This is the source-native
 * enumeration mechanism for this bounded corridor proof — see module doc
 * for why Hidden City's sitemap-chain mechanism does not generalize here.
 */
export async function searchEphemeralArticles(
  query: string,
  maxPages = 3,
): Promise<EphemeralSearchHit[]> {
  const seen = new Map<string, EphemeralSearchHit>();
  for (let page = 1; page <= maxPages; page++) {
    const hits = await fetchSearchPage(query, page);
    if (hits.length === 0) break;
    for (const hit of hits) seen.set(hit.url, hit);
  }
  return [...seen.values()];
}
