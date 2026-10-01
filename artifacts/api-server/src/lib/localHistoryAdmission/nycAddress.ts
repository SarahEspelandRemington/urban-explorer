/**
 * Shared NYC address-only parsing utility for the Streetlit local-history
 * admission engine.
 *
 * Promoted (faithful port) from
 * experiments/hybrid-discovery-v0.1/shared/nycAddress.ts for production
 * offline batch-tool use.
 *
 * Extracted from ephemeral/ephemeralGrounding.ts and lpc/lpcGrounding.ts,
 * which each independently defined a byte-identical `normalizeStreet`/
 * `parseAddress` pair. Both copies used the regex `/^(\d+[A-Za-z]?)\s+(.*)$/`
 * for the housenumber token, which cannot match ANY NYC outer-borough
 * hyphenated housenumber format (e.g. Queens/Bronx/Staten Island's
 * "81-04", "80-19", "34-11" block-and-lot style addressing) — confirmed via
 * direct regex testing to return no match at all for these forms. LPC's
 * grounding rarely hit this path (BIN matching is tried first and almost
 * always succeeds for LPC records), which is why the bug was undetected
 * until an address-only narrative source (Forgotten New York) was tested
 * against real Queens addresses.
 *
 * Fix: the housenumber capture group now optionally includes a
 * `-digits` block suffix (`(?:-\d+)?`) before the existing optional trailing
 * letter, so "81-04 37th Avenue" parses to housenumber "81-04" — matching
 * `addr:housenumber` values as stored verbatim by OSM for these addresses
 * (confirmed live, e.g. way/250587791 tagged `addr:housenumber":"81-04"`).
 * Ordinary non-hyphenated addresses (e.g. "422 West 46th Street") are
 * unaffected — the hyphen group is optional and the plain-number path is
 * unchanged.
 *
 * Also normalizes spelled-out ordinal street/avenue names (e.g. "Ninth
 * Avenue") to the numeral form OSM's own `addr:street` tags use (e.g. "9th
 * Avenue") — confirmed live to be the actual root cause of a real
 * grounding false-negative for the Film Center Building (narrative source
 * text reads "630 Ninth Avenue"; the matching OSM way is tagged
 * `addr:street":"9th Avenue"`). This is a fixed, deterministic word-to-
 * numeral substitution, not fuzzy matching — an address already using
 * numeral form (e.g. "9th Avenue") is left byte-for-byte unaffected, since
 * the substitution regexes only match spelled-out ordinal words.
 */

const ORDINAL_ONES: Record<string, string> = {
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  sixth: "6th",
  seventh: "7th",
  eighth: "8th",
  ninth: "9th",
};
const ORDINAL_TEENS: Record<string, string> = {
  tenth: "10th",
  eleventh: "11th",
  twelfth: "12th",
  thirteenth: "13th",
  fourteenth: "14th",
  fifteenth: "15th",
  sixteenth: "16th",
  seventeenth: "17th",
  eighteenth: "18th",
  nineteenth: "19th",
};
const ORDINAL_TENS: Record<string, string> = {
  twentieth: "20th",
  thirtieth: "30th",
  fortieth: "40th",
  fiftieth: "50th",
  sixtieth: "60th",
  seventieth: "70th",
  eightieth: "80th",
  ninetieth: "90th",
};
const CARDINAL_TENS_VALUE: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const ORDINAL_ONE_VALUE: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
};
const ORDINAL_ONE_SUFFIX: Record<string, string> = {
  first: "st",
  second: "nd",
  third: "rd",
  fourth: "th",
  fifth: "th",
  sixth: "th",
  seventh: "th",
  eighth: "th",
  ninth: "th",
};
// A spelled-out ordinal word is only converted when it is immediately
// followed by a numbered-grid designator (Avenue/Street, or their
// abbreviations) — NYC's numbered avenues/streets are the only context
// where a spelled-out ordinal reliably means "Nth in the numbered grid".
// This is required: several real NYC streets are literal proper names that
// happen to use an ordinal-shaped word with a DIFFERENT suffix — e.g.
// Carroll Gardens, Brooklyn's "First Place"/"Second Place"/"Third Place"
// are proper names, never numeralized by OSM (`addr:street` stores them
// spelled out verbatim) — so the same word before "Place" (or "Lane",
// "Road", "Court", etc.) must NOT be rewritten.
const GRID_SUFFIX_LOOKAHEAD = `(?=\\s+(?:Avenue|Ave\\.?|Street|St\\.?)\\b)`;
const SIMPLE_ORDINAL_RE = new RegExp(
  `\\b(${[
    ...Object.keys(ORDINAL_ONES),
    ...Object.keys(ORDINAL_TEENS),
    ...Object.keys(ORDINAL_TENS),
  ].join("|")})\\b${GRID_SUFFIX_LOOKAHEAD}`,
  "gi",
);
const COMPOUND_ORDINAL_RE = new RegExp(
  `\\b(${Object.keys(CARDINAL_TENS_VALUE).join("|")})[\\s-](${Object.keys(ORDINAL_ONE_VALUE).join("|")})\\b${GRID_SUFFIX_LOOKAHEAD}`,
  "gi",
);

/** Converts spelled-out ordinal street/avenue names (e.g. "Ninth", "Forty-Second") to numeral form (e.g. "9th", "42nd") — only when immediately followed by "Avenue"/"Street" (see GRID_SUFFIX_LOOKAHEAD doc comment above). Already-numeral input, and ordinal words followed by any other suffix (e.g. "Place"), pass through unchanged. */
function normalizeSpelledOrdinals(street: string): string {
  return street
    .replace(COMPOUND_ORDINAL_RE, (_m, tensWord: string, oneWord: string) => {
      const tens = CARDINAL_TENS_VALUE[tensWord.toLowerCase()];
      const ones = ORDINAL_ONE_VALUE[oneWord.toLowerCase()];
      const suffix = ORDINAL_ONE_SUFFIX[oneWord.toLowerCase()];
      return `${tens + ones}${suffix}`;
    })
    .replace(SIMPLE_ORDINAL_RE, (m) => {
      const w = m.toLowerCase();
      return ORDINAL_ONES[w] ?? ORDINAL_TEENS[w] ?? ORDINAL_TENS[w] ?? m;
    });
}

export function normalizeStreet(street: string): string {
  return normalizeSpelledOrdinals(street.trim())
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\bAVENUE\b/, "AVE")
    .replace(/\bSTREET\b/, "ST")
    .replace(/\bWEST\b/, "W")
    .replace(/\bEAST\b/, "E")
    .replace(/\s+/g, " ");
}

export function parseAddress(
  address: string,
): { housenumber: string; street: string } | null {
  const m = address.match(/^(\d+(?:-\d+)?[A-Za-z]?)\s+(.*)$/);
  if (!m) return null;
  return { housenumber: m[1], street: normalizeStreet(m[2]) };
}
