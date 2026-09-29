/**
 * Hidden City article -> grounded PAB place matcher. Offline/non-production,
 * experimental — see ../README.md.
 *
 * Task F: place matching only (no claim extraction). Deliberately does NOT
 * reuse baldwinParkMatcher.ts's binary "dominant subject" heuristic as-is —
 * that heuristic assumes Baldwin Park's corpus shape (one page = one
 * building profile, so a single competing address on the same page is a
 * strong signal the target is not the subject). Hidden City is long-form
 * journalism: a single article can legitimately survey many addresses along
 * a street (per this same corridor's own "Architecture in the Neighborhood"
 * false-positive problem on Baldwin Park), and a genuine profile of one
 * address may only name it a handful of times in prose rather than as a
 * repeated data field. Instead of one hard threshold, this module reports a
 * graded evidence signal per (article, place) pair — mention count, whether
 * the target address is the single most-mentioned Spring Garden address in
 * the article, how many distinct Spring Garden addresses the article
 * mentions at all (breadth-of-survey signal), and whether the article's own
 * title names the place — and leaves the strong/incidental judgment
 * externally inspectable rather than silently admitting or dropping matches.
 */
import type { HiddenCityArticle } from "./hiddenCityAdapter";
import {
  rangesOverlap,
  parseCorridorAddress,
  type AddressRange,
} from "../baldwinpark/baldwinParkMatcher";

export interface GroundedPlace {
  placeKey: string;
  address: string;
  title: string;
  proposedIdentityType: string;
}

const SPRING_GARDEN_MENTION_RE = /\b(\d{3,5})(-\d{1,4})?\s+Spring\s+Garden\b/gi;

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

/** Every Spring Garden house-number-range mention in an article's body text, in order of appearance. */
function springGardenMentionsInOrder(text: string): AddressRange[] {
  const ranges: AddressRange[] = [];
  for (const m of text.matchAll(SPRING_GARDEN_MENTION_RE)) {
    const raw = m[2] ? `${m[1]}${m[2]}` : m[1];
    const range = expandHouseNumberRange(raw);
    if (range) ranges.push(range);
  }
  return ranges;
}

/** Groups an article's Spring Garden mentions into distinct address ranges with a mention count each. */
function distinctSpringGardenCounts(
  text: string,
): { range: AddressRange; count: number }[] {
  const groups: { range: AddressRange; count: number }[] = [];
  for (const m of springGardenMentionsInOrder(text)) {
    const existing = groups.find((g) => rangesOverlap(g.range, m));
    if (existing) existing.count += 1;
    else groups.push({ range: m, count: 1 });
  }
  return groups;
}

/** Loose textual check for whether the article's own title names the place — either its street address or a distinctive word from its grounded title (ignoring generic words like "Street"/"Building"/"Residence"). */
function titleNamesPlace(articleTitle: string, place: GroundedPlace): boolean {
  const normalizedArticleTitle = articleTitle.toLowerCase();
  if (normalizedArticleTitle.includes(place.address.toLowerCase())) return true;
  const genericWords = new Set([
    "street",
    "st",
    "building",
    "residence",
    "house",
    "the",
    "of",
    "and",
    "spring",
    "garden",
  ]);
  const distinctiveWords = place.title
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !genericWords.has(w));
  return (
    distinctiveWords.length > 0 &&
    distinctiveWords.every((w) => normalizedArticleTitle.includes(w))
  );
}

export interface HiddenCityPlaceMatch {
  place: GroundedPlace;
  article: {
    url: string;
    title: string;
    publishedAt: string | null;
    author: string | null;
  };
  mentionCount: number;
  isMaxMentionedAddress: boolean;
  distinctSpringGardenAddressCount: number;
  titleNamesPlace: boolean;
  evidenceTier: "strong" | "weak-incidental";
}

/**
 * Matches one Hidden City article against the grounded PAB place set (Spring
 * Garden corridor addresses only — this experiment's test geography).
 * Returns one entry per grounded place whose address range overlaps at
 * least one Spring Garden mention in the article, with graded evidence
 * rather than a binary admit/reject.
 *
 * evidenceTier is "strong" when either (a) the article's own title names the
 * place, which is strong evidence regardless of in-body mention count, or
 * (b) the target address is mentioned at least twice AND is the single most-
 * mentioned Spring Garden address in the article (no tie). A lower bar than
 * Baldwin Park's >=3 threshold is used deliberately: long-form prose profiles
 * an address in narrative sentences, not as a repeated structured field, so
 * requiring 3+ mentions would likely under-count genuine matches. Everything
 * else — a single incidental mention, or a non-max mention count in a
 * multi-address survey paragraph — is reported as "weak-incidental" rather
 * than dropped, so a human/future-stage reviewer can see what was excluded
 * and why.
 */
export function matchHiddenCityArticleToPlaces(
  article: HiddenCityArticle,
  places: GroundedPlace[],
): HiddenCityPlaceMatch[] {
  const groups = distinctSpringGardenCounts(article.bodyText);
  if (groups.length === 0) return [];
  const maxCount = Math.max(...groups.map((g) => g.count));
  const tiedLeaders = groups.filter((g) => g.count === maxCount).length;

  const matches: HiddenCityPlaceMatch[] = [];
  for (const place of places) {
    const target = parseCorridorAddress(place.address);
    if (!target) continue;
    const matchedGroup = groups.find((g) => rangesOverlap(g.range, target));
    if (!matchedGroup) continue;

    const isMaxMentionedAddress =
      matchedGroup.count === maxCount && tiedLeaders === 1;
    const titleMatch = titleNamesPlace(article.title, place);
    const evidenceTier: "strong" | "weak-incidental" =
      titleMatch || (matchedGroup.count >= 2 && isMaxMentionedAddress)
        ? "strong"
        : "weak-incidental";

    matches.push({
      place,
      article: {
        url: article.url,
        title: article.title,
        publishedAt: article.publishedAt,
        author: article.author,
      },
      mentionCount: matchedGroup.count,
      isMaxMentionedAddress,
      distinctSpringGardenAddressCount: groups.length,
      titleNamesPlace: titleMatch,
      evidenceTier,
    });
  }
  return matches;
}
