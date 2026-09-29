/**
 * Baldwin Park (baldwinparkphilly.org) retrieval adapter prototype.
 * Offline/non-production, experimental — see ../README.md.
 *
 * Narrow and retrieval-only, mirroring pabAdapter.ts's separation of concerns:
 * this module fetches the site's own page list (its Wix-generated sitemap)
 * and each page's own server-side-rendered HTML, then reduces each page to
 * plain text. It does NOT match pages to PAB places or extract Streetlit
 * claims — that is baldwinParkMatcher.ts / baldwinParkExtractor.ts.
 *
 * Retrieval strategy (confirmed against the live site 2026-09-14):
 * 1. The site's sitemap index at /sitemap.xml points to a single
 *    /pages-sitemap.xml listing every published page's canonical URL. This
 *    is the site's own enumeration mechanism, not a generic web search.
 * 2. Each page is a Wix Thunderbolt SPA, but the site renders full article
 *    text server-side into the initial HTML response (confirmed by
 *    inspecting raw fetch() output — no headless-browser rendering needed).
 *    Only script/style tags and markup are stripped to obtain plain text.
 */

const SITE_ORIGIN = "https://www.baldwinparkphilly.org";
const SITEMAP_INDEX_URL = `${SITE_ORIGIN}/sitemap.xml`;
const FETCH_HEADERS = { "User-Agent": "streetlit-experimental-harness/0.1" };

export interface BaldwinParkPage {
  url: string;
  slug: string;
  title: string;
  plainText: string;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  return res.text();
}

/** Follows the site's own sitemap-index -> pages-sitemap chain to enumerate every published page URL. */
export async function fetchBaldwinParkPageList(): Promise<string[]> {
  const indexXml = await fetchText(SITEMAP_INDEX_URL);
  const childSitemaps = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  );
  const pageSitemapUrl =
    childSitemaps.find((u) => u.includes("pages-sitemap.xml")) ??
    childSitemaps[0];
  if (!pageSitemapUrl)
    throw new Error(
      "Baldwin Park sitemap index returned no child sitemap URL.",
    );

  const pagesXml = await fetchText(pageSitemapUrl);
  const urls = [...pagesXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urls.length === 0)
    throw new Error("Baldwin Park pages-sitemap.xml returned no page URLs.");
  return urls;
}

function slugFromUrl(url: string): string {
  return url.replace(/\/+$/, "").split("/").pop() ?? url;
}

/** Strips a Wix page's HTML down to server-rendered plain text (same approach as pabInterpreter.ts's htmlToPlainText). */
function htmlToPlainText(html: string): string {
  const bodyStart = html.indexOf("</head>");
  const body = bodyStart === -1 ? html : html.slice(bodyStart);
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&ccedil;/gi, "ç")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function extractTitle(html: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].replace(/\s*\|\s*matthiasbaldwinpark\s*$/i, "").trim() : "";
}

/** Fetches and reduces one Baldwin Park page to plain text. */
export async function fetchBaldwinParkPage(
  url: string,
): Promise<BaldwinParkPage> {
  const html = await fetchText(url);
  return {
    url,
    slug: slugFromUrl(url),
    title: extractTitle(html),
    plainText: htmlToPlainText(html),
  };
}
