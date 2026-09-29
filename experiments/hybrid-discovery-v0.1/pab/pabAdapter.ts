/**
 * PAB (Philadelphia Architects and Buildings) retrieval adapter prototype.
 * Offline/non-production, experimental — see ../README.md.
 *
 * Narrow and retrieval-only: this module fetches and parses PAB's own
 * street-address search results into structured retrieval records. It does
 * NOT interpret, classify, or turn records into Streetlit claims — that is
 * pabInterpreter.ts / pabClaimExtractor.ts, deliberately kept separate.
 *
 * Retrieval strategy (confirmed against the live site 2026-09-14):
 * 1. PAB's own documented address-search behavior (see
 *    /pab/help/address_formats.cfm) is that omitting a house number from a
 *    street-address search returns every record on that street. This is the
 *    core enumeration mechanism used here, not a generic web search.
 * 2. The search form (search_location.cfm) sits behind a "My PAB"
 *    registration prompt for anonymous requests. PAB itself exposes an
 *    explicit guest-bypass query param (?IgnoreRegistration=1) on that same
 *    URL, which this adapter uses rather than attempting to defeat or work
 *    around the gate in any other way.
 * 3. A successful POST redirects (302) to a stable, bookmarkable GET URL:
 *    search_address_results.cfm?StreetAddress=...&SearchCity=...&SearchState=...
 *    &SearchCountry=...&UnlinkedOnly=1. Node's built-in fetch (undici) issues
 *    plain HTTP/1.1 requests and follows redirects by default, so the
 *    curl-specific "HTTP/2 default -> 411 Length Required" workaround
 *    encountered during manual investigation with curl does not apply here;
 *    no explicit HTTP/1.1 forcing call is required with fetch, but this is
 *    documented because the underlying PAB behavior is the same regardless
 *    of client.
 */

const PAB_ORIGIN = "https://www.philadelphiabuildings.org";
const SEARCH_URL = `${PAB_ORIGIN}/pab/app/search_location.cfm?IgnoreRegistration=1`;

export interface PabAdapterInput {
  street: string;
  city: string;
  /** PAB's numeric state dropdown code. Defaults to "1" (Pennsylvania). */
  stateCode?: string;
  /** PAB's numeric country dropdown code. Defaults to "1" (United States). */
  countryCode?: string;
  /** Inclusive lower bound on house number, for corridor filtering. */
  lowerBound?: number;
  /** Inclusive upper bound on house number, for corridor filtering. */
  upperBound?: number;
}

export interface PabRetrievalRecord {
  pabId: string;
  url: string;
  title: string;
  /** Every address span PAB lists for this record, not just the first. */
  addressBlock: string[];
  /** Subset of addressBlock that fell inside the requested corridor bounds. */
  matchedCorridorAddresses: string[];
}

export interface PabAdapterResult {
  /** Total unique PAB records returned by the street-only search, before corridor filtering. */
  totalRetrieved: number;
  /** Records with at least one address inside the requested corridor bounds. */
  records: PabRetrievalRecord[];
  /** The stable results-page URL actually fetched, for provenance/reproducibility. */
  resultsUrl: string;
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "");
}

/** Splits the raw results HTML into one chunk per record, tolerant of row-class/attribute variation. */
function splitIntoRowChunks(html: string): string[] {
  return html.split(/(?=<a href="\/pab\/app\/pj_display\.cfm\/\d+">)/);
}

const ADDRESS_LINE_RE =
  /\d[\d\-]*\s+[A-Z0-9.]+(?:\s+[A-Z0-9.]+){0,4}\s+(?:ST|AVE|BLVD|PL|RD|DR|LN|CT|TER|PKWY)\b\.?/g;

function parseRowChunk(chunk: string): PabRetrievalRecord | null {
  const idMatch = chunk.match(/<a href="\/pab\/app\/pj_display\.cfm\/(\d+)">/);
  if (!idMatch) return null;
  const pabId = idMatch[1];
  const cleaned = stripScripts(chunk);
  const titleMatch = cleaned.match(/<b>([^<]+)<\/b><\/a>/);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // The full address block (all spans, including corner/cross-street
  // addresses) runs from the end of the title anchor to the "Philadelphia,
  // PA" city marker. Reading the FULL block here — not just the first
  // address span — is what keeps corner properties like Polonia Federal
  // Savings Bank (filed under both a Spring Garden and a cross-street
  // address in the same row) from being silently dropped.
  const afterTitleIdx = cleaned.indexOf("</a>");
  const cityIdx = cleaned.indexOf("Philadelphia, PA");
  let addressBlock: string[] = [];
  if (afterTitleIdx !== -1 && cityIdx !== -1 && cityIdx > afterTitleIdx) {
    const addrRaw = cleaned.slice(afterTitleIdx, cityIdx);
    const plain = addrRaw
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    addressBlock = [...plain.matchAll(ADDRESS_LINE_RE)].map((m) => m[0].trim());
  }

  return {
    pabId,
    url: `${PAB_ORIGIN}/pab/app/pj_display.cfm/${pabId}`,
    title,
    addressBlock,
    matchedCorridorAddresses: [],
  };
}

/** Matches "<number(-number)> <STREET NAME>" against a target street and inclusive house-number bounds. */
function matchesCorridor(
  address: string,
  streetPattern: RegExp,
  lowerBound?: number,
  upperBound?: number,
): boolean {
  const m = address.match(/^(\d+)(?:-(\d+))?\s+(.*)$/);
  if (!m) return false;
  if (!streetPattern.test(m[3])) return false;
  if (lowerBound === undefined && upperBound === undefined) return true;
  const num = parseInt(m[1], 10);
  if (lowerBound !== undefined && num < lowerBound) return false;
  if (upperBound !== undefined && num > upperBound) return false;
  return true;
}

/**
 * Retrieves and parses PAB's street-only search results for a corridor.
 * Retrieval-only: returns structured records, never Streetlit claims.
 */
export async function retrievePabCorridor(
  input: PabAdapterInput,
): Promise<PabAdapterResult> {
  const stateCode = input.stateCode ?? "1";
  const countryCode = input.countryCode ?? "1";

  const body = new URLSearchParams({
    SearchAddress: input.street, // house number deliberately omitted — PAB's own street-enumeration behavior
    SearchCity: input.city,
    SearchState: stateCode,
    SearchCountry: countryCode,
    UnlinkedOnly: "1",
    SearchButton: "Search",
  });

  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "follow",
  });

  const html = await res.text();

  if (
    !res.url.includes("search_address_results.cfm") ||
    !html.includes("pj_display.cfm")
  ) {
    throw new Error(
      `PAB search did not resolve to the expected results page (landed on ${res.url}). ` +
        `The guest-bypass/redirect path may have changed — this adapter does not fall back to scraping an unexpected page shape.`,
    );
  }

  const chunks = splitIntoRowChunks(html);
  const seen = new Set<string>();
  const all: PabRetrievalRecord[] = [];
  for (const chunk of chunks) {
    const record = parseRowChunk(chunk);
    if (!record || seen.has(record.pabId)) continue;
    seen.add(record.pabId);
    all.push(record);
  }

  const streetPattern = new RegExp(
    `^${input.street.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?$`,
    "i",
  );
  const withCorridorMatches = all.map((record) => ({
    ...record,
    matchedCorridorAddresses: record.addressBlock.filter((a) =>
      matchesCorridor(a, streetPattern, input.lowerBound, input.upperBound),
    ),
  }));

  const records =
    input.lowerBound === undefined && input.upperBound === undefined
      ? withCorridorMatches
      : withCorridorMatches.filter(
          (r) => r.matchedCorridorAddresses.length > 0,
        );

  return { totalRetrieved: all.length, records, resultsUrl: res.url };
}
