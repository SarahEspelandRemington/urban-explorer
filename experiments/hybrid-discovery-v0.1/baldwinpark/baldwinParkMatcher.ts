/**
 * Baldwin Park page matcher — Task F Stage 1 (place-driven narrative
 * retrieval). Offline/non-production, experimental — see ../README.md.
 *
 * Matches a PAB-grounded corridor place to Baldwin Park pages using the
 * PAB record's own grounded corridor address as the required, primary
 * match signal — never a name/theme match alone, per the task's "join
 * must be place-based, not theme-based" instruction. A page must contain
 * an exact (non-fuzzy) occurrence of the same Spring Garden house-number
 * range, with the same odd/even side-of-street parity, to be considered a
 * match — mirroring pabGrounding.ts's own address-range-overlap +
 * same-side-of-street-parity approach exactly (frozen file, logic
 * duplicated here rather than imported since pabGrounding.ts does not
 * export it).
 */
import type { BaldwinParkPage } from "./baldwinParkAdapter";

export interface AddressRange {
  low: number;
  high: number;
}

function expandHouseNumberRange(raw: string): AddressRange | null {
  const m = raw.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const low = parseInt(m[1], 10);
  if (!m[2]) return { low, high: low };
  let highRaw = m[2];
  if (highRaw.length < m[1].length) {
    highRaw = m[1].slice(0, m[1].length - highRaw.length) + highRaw;
  }
  const high = parseInt(highRaw, 10);
  return { low, high: high >= low ? high : low };
}

function rangeParity(low: number, high: number): "odd" | "even" | "mixed" {
  const lowOdd = low % 2 === 1;
  const highOdd = high % 2 === 1;
  if (lowOdd !== highOdd) return "mixed";
  return lowOdd ? "odd" : "even";
}

/** Same fallback behavior as pabGrounding.ts's elementsAtAddress: don't invent a parity assumption for a mixed range, just allow the overlap. Exported for reuse by baldwinParkExtractor.ts's Stage 2 sentence-level relevance scoping, so the address-overlap definition stays identical between page matching and claim attribution. */
export function rangesOverlap(a: AddressRange, b: AddressRange): boolean {
  if (a.high < b.low || a.low > b.high) return false;
  const aParity = rangeParity(a.low, a.high);
  const bParity = rangeParity(b.low, b.high);
  if (aParity === "mixed" || bParity === "mixed") return true;
  return aParity === bParity;
}

const SPRING_GARDEN_MENTION_RE = /\b(\d{3,5})(-\d{1,4})?\s+Spring\s+Garden\b/gi;

/** Every distinct Spring Garden house-number range literally mentioned in a page's plain text. Exported for reuse by baldwinParkExtractor.ts. */
export function springGardenMentions(text: string): AddressRange[] {
  const ranges: AddressRange[] = [];
  for (const m of text.matchAll(SPRING_GARDEN_MENTION_RE)) {
    const raw = m[2] ? `${m[1]}${m[2]}` : m[1];
    const range = expandHouseNumberRange(raw);
    if (range) ranges.push(range);
  }
  return ranges;
}

/** Parses "1901 SPRING GARDEN ST" / "2133-2135 SPRING GARDEN ST" into a house-number range. Returns null for non-Spring-Garden addresses (this experiment's corridor is Spring Garden St only). */
export function parseCorridorAddress(address: string): AddressRange | null {
  const m = address.match(/^(\d[\d-]*)\s+SPRING GARDEN\b/i);
  if (!m) return null;
  return expandHouseNumberRange(m[1]);
}

export interface BaldwinParkPageMatch {
  page: BaldwinParkPage;
  matchedRange: AddressRange;
  isDominantSubject: boolean;
}

/** Groups a page's raw address mentions into distinct (non-overlapping) ranges with a mention count each — used to find which single address a page is actually profiling, as opposed to a one-off incidental cross-reference to a neighboring address (e.g. "he had previously lived across the street at 1910 Spring Garden Street" on a page whose real subject is 1901 Spring Garden Street). */
function distinctMentionCounts(
  text: string,
): { range: AddressRange; count: number }[] {
  const groups: { range: AddressRange; count: number }[] = [];
  for (const m of springGardenMentions(text)) {
    const existing = groups.find((g) => rangesOverlap(g.range, m));
    if (existing) existing.count += 1;
    else groups.push({ range: m, count: 1 });
  }
  return groups;
}

/**
 * Finds every Baldwin Park page containing an exact, address-range-overlapping
 * mention of the given target corridor address. Address overlap is the
 * required signal — a page is never matched on name/theme alone, and a
 * disagreeing address never gets a pass from a matching name elsewhere.
 *
 * `isDominantSubject` is true only when the target address is the single
 * most-mentioned Spring Garden address range on the page (ties count as not
 * dominant) — this is the page's actual subject, as opposed to a page whose
 * real subject is a different address that merely name-checks the target
 * address in passing. A page mentioning more than one distinct Spring
 * Garden address also requires the winning count to be at least 3:
 * confirmed against this experiment's actual matches, every legitimate
 * single-building profile page mentions its subject address >=3 times
 * (e.g. 21, 19, 15, 11, 8, 6, 5, 3 — a real narrative repeatedly refers to
 * its subject), whereas a broad multi-building survey page (e.g.
 * "Architecture in the Neighborhood", 9 distinct addresses each mentioned
 * once) can spuriously "win" a 2-vs-1 tie-break with no real dominant
 * subject at all. Pages that only ever mention a single Spring Garden
 * address are exempt from this minimum (there is no competing address to
 * resolve ambiguity against). Whole-page claim extraction (Stage 2) is only
 * run for dominant-subject matches, to avoid bleeding claims about a
 * different building into this place; non-dominant matches are still
 * reported (as a confirmed but non-extractable page/place match), not
 * silently dropped.
 */
export function findBaldwinParkMatches(
  targetAddress: string,
  pages: BaldwinParkPage[],
): BaldwinParkPageMatch[] {
  const target = parseCorridorAddress(targetAddress);
  if (!target) return [];
  const matches: BaldwinParkPageMatch[] = [];
  for (const page of pages) {
    const groups = distinctMentionCounts(page.plainText);
    const matchedGroup = groups.find((g) => rangesOverlap(g.range, target));
    if (!matchedGroup) continue;
    const maxCount = Math.max(...groups.map((g) => g.count));
    const tiedLeaders = groups.filter((g) => g.count === maxCount).length;
    const isDominantSubject =
      matchedGroup.count === maxCount &&
      tiedLeaders === 1 &&
      (groups.length === 1 || maxCount >= 3);
    matches.push({ page, matchedRange: matchedGroup.range, isDominantSubject });
  }
  return matches;
}
