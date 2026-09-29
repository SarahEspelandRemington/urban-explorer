/**
 * Hidden City Philadelphia (hiddencityphila.org) retrieval adapter prototype.
 * Offline/non-production, experimental — see ../README.md.
 *
 * Task F: retrieval only. Enumerates articles via the site's own sitemap
 * (its source-native enumeration mechanism, not generic web search), fetches
 * each article's title/url/publishedAt/author/bodyText, and extracts explicit
 * Philadelphia street-address mentions from the body text. Does NOT match
 * articles to PAB places or extract Streetlit claims — that is
 * hiddenCityMatcher.ts (place matching) and a future Stage 2 claim extractor
 * (explicitly out of scope for this task).
 *
 * Retrieval strategy (confirmed against the live site 2026-09-16):
 * 1. https://hiddencityphila.org/sitemap.xml is a sitemap index with 5 child
 *    sitemaps: sitemap-misc.xml (2 URLs, not articles), post-sitemap.xml
 *    (1000), post-sitemap2.xml (1000), post-sitemap3.xml (710), and
 *    page-sitemap.xml (static pages, excluded — not articles). The 3
 *    post-sitemap*.xml files are this source's own article-enumeration
 *    mechanism: 2710 articles total.
 * 2. Each article page is server-rendered WordPress HTML (no headless
 *    rendering needed). Reliable fields, confirmed against a real sampled
 *    article:
 *    - title: <meta property="og:title" content="..."> (the raw <title> tag
 *      is polluted by inline SVG icon <title> elements, e.g. "Asset 2").
 *      Falls back to <h1 class="entry-title"> if og:title is absent.
 *    - publishedAt: <meta property="article:published_time" content="...">
 *      (ISO 8601).
 *    - author: <a ... class="author">by NAME</a> anchor text, "by " prefix
 *      stripped.
 *    - bodyText: the <div class="entry-content"> ... </div> block, cut off
 *      before <div id="comments" ...> if present, so reader comments never
 *      pollute address extraction.
 */

const SITEMAP_INDEX_URL = "https://hiddencityphila.org/sitemap.xml";
const FETCH_HEADERS = { "User-Agent": "streetlit-experimental-harness/0.1" };
const ARTICLE_SITEMAP_NAME_RE = /post-sitemap\d*\.xml/;

export interface HiddenCityArticle {
  url: string;
  title: string;
  publishedAt: string | null;
  author: string | null;
  bodyText: string;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

/** Follows the site's own sitemap-index -> post-sitemap*.xml chain to enumerate every article URL. Excludes sitemap-misc.xml and page-sitemap.xml, which carry non-article static pages. */
export async function fetchHiddenCityArticleList(): Promise<string[]> {
  const indexXml = await fetchText(SITEMAP_INDEX_URL);
  const childSitemaps = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => ARTICLE_SITEMAP_NAME_RE.test(u));
  if (childSitemaps.length === 0)
    throw new Error(
      "Hidden City sitemap index returned no post-sitemap child URLs.",
    );

  const urls: string[] = [];
  for (const sitemapUrl of childSitemaps) {
    const xml = await fetchText(sitemapUrl);
    urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }
  if (urls.length === 0)
    throw new Error("Hidden City post-sitemaps returned no article URLs.");
  return urls;
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
    .replace(/&#8220;/gi, '"')
    .replace(/&#8221;/gi, '"')
    .replace(/&#8211;/gi, "–")
    .replace(/&#8212;/gi, "—")
    .replace(/&#39;/gi, "'");
}

function htmlFragmentToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      // WordPress image-caption paragraphs (e.g. <p id="caption-attachment-73244"
      // class="wp-caption-text">...</p>) are photo credits/captions, not article
      // body prose, and must not enter claim extraction as narrative sentences.
      .replace(
        /<(figcaption|p)\b[^>]*class="[^"]*\bwp-caption-text\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(/<(br|\/p|\/div|\/blockquote|\/li|\/h[1-6])\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function extractTitle(html: string): string {
  const og = html.match(/<meta property="og:title" content="([^"]*)"/i);
  if (og) return decodeEntities(og[1]).trim();
  const h1 = html.match(
    /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
  );
  return h1 ? htmlFragmentToPlainText(h1[1]) : "";
}

function extractPublishedAt(html: string): string | null {
  const m = html.match(
    /<meta property="article:published_time" content="([^"]*)"/i,
  );
  return m ? m[1] : null;
}

function extractAuthor(html: string): string | null {
  const m = html.match(
    /<a[^>]*class="[^"]*\bauthor\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
  );
  if (!m) return null;
  const text = htmlFragmentToPlainText(m[1]);
  return text.replace(/^by\s+/i, "").trim() || null;
}

function extractBodyText(html: string): string {
  const start = html.search(
    /<div[^>]*class="[^"]*\bentry-content\b[^"]*"[^>]*>/i,
  );
  if (start === -1) return "";
  const rest = html.slice(start);
  const commentsIdx = rest.search(/<div[^>]*id="comments"/i);
  const fragment = commentsIdx === -1 ? rest : rest.slice(0, commentsIdx);
  return htmlFragmentToPlainText(fragment);
}

/** Fetches and reduces one Hidden City article to its structured fields. */
export async function fetchHiddenCityArticle(
  url: string,
): Promise<HiddenCityArticle> {
  const html = await fetchText(url);
  return {
    url,
    title: extractTitle(html),
    publishedAt: extractPublishedAt(html),
    author: extractAuthor(html),
    bodyText: extractBodyText(html),
  };
}

export interface AddressMention {
  raw: string;
  houseNumber: string;
  streetName: string;
}

// Named-street Philadelphia address: house number (or hyphenated range) + optional
// directional prefix + street name (1-3 capitalized words) + a recognized street-type suffix.
const NAMED_STREET_ADDRESS_RE =
  /\b(\d{3,5}(?:-\d{2,5})?)\s+((?:(?:North|South|East|West)\s+)?[A-Z][A-Za-z'.]*(?:\s+[A-Z][A-Za-z'.]*){0,2}\s+(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Place|Pl\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Terrace|Ter\.?|Parkway|Pkwy\.?|Walk))\b/g;

// Numbered/ordinal-street Philadelphia address: house number + optional directional +
// ordinal street number (e.g. "20th Street").
const ORDINAL_STREET_ADDRESS_RE =
  /\b(\d{3,5}(?:-\d{2,5})?)\s+((?:(?:North|South|East|West)\s+)?\d+(?:st|nd|rd|th)\s+(?:Street|St\.?))\b/g;

/**
 * Extracts explicit Philadelphia street-address mentions (house number +
 * street name) from free text, without relying on generic web search — this
 * is a plain regex scan of the article's own body text. Two patterns are
 * combined: named streets (e.g. "1701 Spring Garden Street") and
 * numbered/ordinal streets (e.g. "1600 20th Street"). Known limitation: this
 * only catches mentions that include a house number. Cross-street-only
 * descriptions common in narrative journalism (e.g. "at Broad and Hamilton")
 * have no house number and are not captured here.
 */
export function extractAddressMentions(text: string): AddressMention[] {
  const mentions: AddressMention[] = [];
  for (const re of [NAMED_STREET_ADDRESS_RE, ORDINAL_STREET_ADDRESS_RE]) {
    for (const m of text.matchAll(re)) {
      mentions.push({
        raw: `${m[1]} ${m[2]}`,
        houseNumber: m[1],
        streetName: m[2].trim(),
      });
    }
  }
  return mentions;
}
