/**
 * Forgotten New York (forgotten-ny.com) retrieval adapter.
 *
 * Promoted (faithful port) from
 * experiments/hybrid-discovery-v0.1/forgottenny/forgottenNyAdapter.ts for
 * production offline batch-tool use.
 *
 * Retrieval strategy (confirmed live 2026-09-22, not assumed from Ephemeral
 * New York's WordPress.com behavior):
 * 1. This is a SELF-HOSTED WordPress site (Yoast SEO plugin) with a full,
 *    unbounded post-sitemap chain (post-sitemap.xml .. post-sitemap6.xml,
 *    spanning 1999-2026) AND a live, unauthenticated WP REST API
 *    (`/wp-json/wp/v2/...`, confirmed via the `Link: <.../wp-json/>` response
 *    header). Unlike Ephemeral New York's capped ~100-URL sitemap, this is a
 *    genuinely scalable full-archive enumeration mechanism.
 * 2. Best enumeration mechanism found: `/wp-json/wp/v2/posts?tags={tagId}` —
 *    Forgotten NY tags nearly every post with an editorially-assigned
 *    neighborhood tag (e.g. tag 208 = "Jackson Heights", 29 posts). This is a
 *    STABLE, GENERIC mechanism ("fetch posts by neighborhood tag"), not
 *    Jackson-Heights-specific — the same call pattern generalizes to any NYC
 *    neighborhood Forgotten NY has tagged. `/wp-json/wp/v2/search?search=` is
 *    also live and useful as a supplementary check (confirmed to surface ~1
 *    genuine hit missed by the tag, alongside some substring false positives
 *    on "Heights").
 * 3. The REST API returns full clean post HTML directly in
 *    `content.rendered` — no HTML-page scraping needed at all (a genuine
 *    improvement over both Hidden City's and Ephemeral's scraped-HTML
 *    approach). Metadata (`date`, `slug`, `link`, `title.rendered`,
 *    `categories`, `tags`, `author`) is all structured JSON. No comments
 *    section or share-widget markup is present in `content.rendered` to
 *    strip (unlike Ephemeral's Jetpack flair cutoff) — only inline
 *    `<figure>` image blocks (photo captions/credits) and NextGEN Gallery
 *    shortcode placeholder text (`ngg_shortcode_N_placeholder`, left
 *    unrendered by the API) need stripping so they don't pollute claim
 *    extraction as prose sentences.
 */

const FETCH_HEADERS = { "User-Agent": "streetlit-local-history-admission/1.0" };
const API_BASE = "https://forgotten-ny.com/wp-json/wp/v2";

export interface ForgottenNyArticle {
  id: number;
  url: string;
  title: string;
  publishedAt: string | null;
  bodyText: string;
}

interface WpPost {
  id: number;
  link: string;
  date: string;
  title: { rendered: string };
  content: { rendered: string };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json() as Promise<T>;
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

/** Strips NextGEN Gallery shortcode placeholders (left unrendered by the REST API — never real prose) and <figure> caption/credit blocks, then reduces to plain text. */
function htmlToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
      .replace(/ngg_shortcode_\d+_placeholder/gi, " ")
      .replace(/<(br|\/p|\/div|\/blockquote|\/li|\/h[1-6])\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function toArticle(post: WpPost): ForgottenNyArticle {
  return {
    id: post.id,
    url: post.link,
    title: decodeEntities(post.title.rendered).trim(),
    publishedAt: post.date ? `${post.date}Z` : null,
    bodyText: htmlToPlainText(post.content.rendered),
  };
}

/** Fetches one Forgotten New York post by its numeric WP post id and reduces it to structured fields. */
export async function fetchForgottenNyArticle(
  postId: number,
): Promise<ForgottenNyArticle> {
  const post = await fetchJson<WpPost>(`${API_BASE}/posts/${postId}`);
  return toArticle(post);
}

export interface ForgottenNyTag {
  id: number;
  name: string;
  count: number;
}

/** Looks up a WP post_tag term by its exact editorial name (e.g. "Jackson Heights"). Returns null if no such tag exists — callers should not assume every neighborhood has one. */
export async function findForgottenNyTag(
  name: string,
): Promise<ForgottenNyTag | null> {
  const results = await fetchJson<ForgottenNyTag[]>(
    `${API_BASE}/tags?search=${encodeURIComponent(name)}`,
  );
  return (
    results.find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? null
  );
}

/**
 * Enumerates every post under one editorially-assigned neighborhood tag —
 * the primary, stable, neighborhood-agnostic enumeration mechanism for this
 * source (see module doc). Paginates via `page`/`per_page` until an empty
 * page is returned.
 */
export async function fetchForgottenNyArticlesByTag(
  tagId: number,
  perPage = 50,
): Promise<ForgottenNyArticle[]> {
  const articles: ForgottenNyArticle[] = [];
  for (let page = 1; ; page++) {
    const posts = await fetchJson<WpPost[]>(
      `${API_BASE}/posts?tags=${tagId}&per_page=${perPage}&page=${page}`,
    ).catch((err) => {
      // WP REST API returns HTTP 400 for a page number past the last page.
      if (String(err).includes("400")) return [] as WpPost[];
      throw err;
    });
    if (posts.length === 0) break;
    articles.push(...posts.map(toArticle));
    if (posts.length < perPage) break;
  }
  return articles;
}

/**
 * Supplementary full-text search (`/wp-json/wp/v2/search`) — confirmed live
 * to surface real articles the tag mechanism can occasionally miss, at the
 * cost of some substring false positives (e.g. "University Heights",
 * "Prospect Heights" for a "Jackson Heights" query). Callers must apply
 * their own relevance check to results; this function does not filter.
 */
export async function searchForgottenNyArticles(
  query: string,
): Promise<{ id: number; title: string; url: string }[]> {
  return fetchJson(
    `${API_BASE}/search?search=${encodeURIComponent(query)}&per_page=20`,
  );
}
