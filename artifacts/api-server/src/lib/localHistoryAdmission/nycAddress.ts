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
 */

export function normalizeStreet(street: string): string {
  return street
    .trim()
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
