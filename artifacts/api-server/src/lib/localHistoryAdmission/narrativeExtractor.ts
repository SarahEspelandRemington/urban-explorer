/**
 * Shared narrative claim-extraction + relevance core for the Streetlit
 * local-history admission engine.
 *
 * Promoted (faithful port) from
 * experiments/hybrid-discovery-v0.1/narrative/narrativeExtractor.ts for
 * production offline batch-tool use. AddressRange/rangesOverlap are now
 * imported from ./addressRange (extracted from baldwinParkMatcher.ts, whose
 * other contents remain Baldwin-Park-specific and stay experimental) rather
 * than from the still-experimental baldwinpark/ directory. All other logic
 * is unchanged, including ownContextNames, multi-word identity-anchor
 * phrase-grouping, the NYC hyphenated-housenumber relevance regex, the
 * smart-quote-tolerant anchor matcher, and the urban-remnant classifier.
 *
 * This module is the single shared implementation of the paragraph/sentence
 * target-place relevance scoping, address-vs-year disambiguation, and
 * sentence classification logic that baldwinParkExtractor.ts and
 * hiddenCityExtractor.ts previously duplicated byte-for-byte (aside from two
 * narrow, already-evidenced divergences — see below). It implements the
 * "shared narrative extraction/relevance machinery" called for by the
 * revised Narrative-Source Adapter Contract, so that extractBaldwinParkClaims
 * and extractHiddenCityClaims are now thin per-source wrappers that supply
 * only genuinely source-specific configuration and claim-identity/claimText
 * templating.
 *
 * Two deliberate parameterization points, both following the contract's
 * "shared baseline + narrow, evidenced extension" principle (not per-source
 * vocabulary packs):
 *
 * 1. `genericTitleWordExtensions` — GENERIC_TITLE_WORDS_BASE is the shared
 *    34-word baseline (identical to both sources' prior copies). Hidden
 *    City's extra 6 words (fund/safe/deposit/trust/savings/national),
 *    evidenced specifically by the Northern Savings Fund's multi-name PAB
 *    title, are passed as an extension list rather than folded into the
 *    baseline or hardcoded here.
 *
 * 2. `classifierExtensions` — classifySentence's construction-date/
 *    architect/relationship/event triggers have one already-evidenced
 *    broadened variant (the v0.2 "designed"/"designed by"/"commissioned
 *    by"/"renovated"/"renovation"/"occupied" keywords added for Hidden
 *    City's Guild House architecture-journalism phrasing). Baldwin Park's
 *    validated behavior depends on these NOT being active for its corpus
 *    (preserving its existing behavior exactly), so they are opt-in flags,
 *    off by default, rather than a single unconditionally-broadened cascade.
 *
 * `streetName` is a required config field so no corridor name is hardcoded
 * in this module — the prior "Spring Garden" literal is now the caller's
 * only configuration value. AddressRange/rangesOverlap themselves were
 * already street-name-agnostic (imported from the frozen baldwinParkMatcher.ts,
 * unchanged) and are reused here rather than duplicated.
 *
 * Explicitly NOT moved here (out of Task E's scope): CMS/HTML parsing
 * (stays in each adapter), page/article-to-place matching — Baldwin Park's
 * binary dominant-subject heuristic and Hidden City's graded evidence-tier
 * model remain source-specific and are not retrofit or merged, per the
 * contract and this task's explicit instruction. Source construction
 * (buildBaldwinParkSource/buildHiddenCitySource) also stays in each
 * extractor file — their wording, sourceClass notes, and publicationDate
 * handling are source-specific presentation, not shared relevance logic.
 */
import type {
  Claim,
  ClaimType,
  EpistemicMarker,
  ProposedIdentityType,
} from "./types";
import { type AddressRange, rangesOverlap } from "./addressRange";

/**
 * Sanitizes a placeKey into an id-safe token for inclusion in a claim's id.
 * Bug fix (Hybrid Discovery v1): a claim's id previously depended only on
 * claimIdPrefix (source-derived) + paragraph/sentence/claimType — never on
 * the target placeKey. Since the SAME source page/article can legitimately
 * be dominant-matched against more than one distinct placeKey (e.g. two PAB
 * database records for the same real-world building), two separate
 * extractNarrativeClaims calls for that one page could previously produce
 * claims with byte-identical ids but different placeKeys. Including the
 * target placeKey in the id guarantees distinct ids per distinct target
 * place while leaving sourceIds/supportingSpan/claimText (source provenance
 * and evidentiary identity) untouched.
 */
function placeKeyIdToken(placeKey: string): string {
  return placeKey.replace(/[^a-zA-Z0-9]+/g, "-");
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function splitSentencesInParagraph(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

/** Shared baseline of generic structural words that appear in many PAB record titles but never identify a specific place — excluded so identity anchors are limited to likely proper nouns (surnames, distinctive institution names). Identical to both sources' prior individually-duplicated copies. */
export const GENERIC_TITLE_WORDS_BASE: ReadonlySet<string> = new Set([
  "residence",
  "mansion",
  "house",
  "building",
  "company",
  "hospital",
  "bank",
  "stable",
  "street",
  "spring",
  "garden",
  "the",
  "and",
  "of",
  "society",
  "educational",
  "missionary",
  "college",
  "state",
  "pennsylvania",
  "hall",
  "home",
  "church",
  "chapel",
  "school",
  "institute",
  "club",
  "apartments",
  "apartment",
  "theater",
  "theatre",
  "hotel",
  "works",
  "shop",
  "store",
  "park",
  "philadelphia",
]);

/**
 * Extracts likely proper-noun identity anchors from a source-supported title
 * (a PAB record title for Baldwin Park, a grounded place's own title for
 * Hidden City) — see module doc for why this is a source-supported signal,
 * not an invented one. `extraGenericWords` merges narrow, already-evidenced
 * per-source extensions onto the shared baseline (e.g. Hidden City's fund/
 * safe/deposit/trust/savings/national).
 *
 * Groups CONTIGUOUS runs of non-generic title words into a single combined
 * phrase anchor, rather than returning each surviving word as an
 * independent anchor. A generic word or a non-adjacent gap (any character
 * other than whitespace between two matched words, e.g. an un-matched
 * lowercase connector like "of") breaks a run. Single-non-generic-word
 * titles ("Stetson Residence" -> "Stetson", "Guild House" -> "Guild") are
 * unaffected, since a run of length one is unchanged by grouping.
 *
 * Fixes a real misattribution bug found in the NYC Forgotten New York
 * source-native proof: the old per-word behavior gave a 4-word title like
 * "Jackson Heights Post Office" four INDEPENDENT single-word anchors
 * ("Jackson", "Heights", "Post", "Office"), each of which could false-
 * trigger paragraph relevance on any unrelated mention of that one common
 * word (e.g. "Jackson Avenue", an unrelated old street name in the same
 * multi-subject article) — which then wrongly attached a neighboring
 * subject's (Robert Morris Apartments') fact to this candidate via the
 * forward-continuation mechanism. Grouping into one "Jackson Heights Post
 * Office" phrase anchor requires the full phrase, which is what the source
 * prose actually contains verbatim when it is genuinely about this place.
 */
function extractIdentityAnchors(
  title: string,
  extraGenericWords: readonly string[] = [],
): string[] {
  const genericWords =
    extraGenericWords.length === 0
      ? GENERIC_TITLE_WORDS_BASE
      : new Set([...GENERIC_TITLE_WORDS_BASE, ...extraGenericWords]);

  const phrases: string[] = [];
  let current: string[] = [];
  let prevEnd: number | null = null;
  for (const m of title.matchAll(/[A-Z][a-zA-Z']{3,}/g)) {
    const word = m[0];
    const start = m.index ?? 0;
    const end = start + word.length;
    const adjacentToPrev =
      prevEnd !== null && /^\s*$/.test(title.slice(prevEnd, start));
    const isGeneric = genericWords.has(word.toLowerCase());
    if (isGeneric || !adjacentToPrev) {
      if (current.length > 0) phrases.push(current.join(" "));
      current = [];
    }
    if (!isGeneric) current.push(word);
    prevEnd = end;
  }
  if (current.length > 0) phrases.push(current.join(" "));

  return [...new Set(phrases)];
}

/** Normalizes straight vs. typographic apostrophes (a common CMS "smart quotes" auto-conversion, e.g. WordPress rendering a manually-typed "Jahn's" as "Jahn's" with a right single quotation mark) so anchor matching isn't defeated by a character-encoding difference alone. General text-normalization fix, not source-specific — found blocking Forgotten New York's "Jahn's" identity anchor against its own smart-quoted prose. */
const APOSTROPHE_CHAR_CLASS = "['\u2018\u2019]";

/** Anchors may now be multi-word phrases (see extractIdentityAnchors) — internal whitespace is let flex the same way streetNamePattern's does, so "Jackson Heights Post Office" matches across a double space or line-wrapped whitespace in source prose. */
function mentionsAnchor(paragraph: string, anchor: string): boolean {
  const pattern = anchor
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/['\u2018\u2019]/g, APOSTROPHE_CHAR_CLASS)
    .replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${pattern}\\b`).test(paragraph);
}

const CONTINUATION_REFERENCE_RE =
  /\b(the house|the building|the mansion|the residence|the property|the site|the structure|this house|this building|this mansion|this residence|this property|it|its|this)\b/i;
const OTHER_NAMED_PLACE_RE =
  /\b[A-Z][a-zA-Z]+ (?:Park|Estate|Manor|Heights|Village|Township)\b/;
const OTHER_STREET_RE =
  /\b[A-Z][a-zA-Z]+ (?:Street|Road|Avenue|Boulevard|Lane|Drive|Place)\b/;
const SURVEY_OR_LIST_RE =
  /\b(there (?:have|has) been|since the [a-z-]+ century|the following|other (?:properties|buildings|churches|institutions|residences)|nearby (?:properties|buildings))\b/i;
const INSTITUTION_INTRO_RE =
  /\bThe\s+[A-Z][a-zA-Z']+(?:\s+[A-Z][a-zA-Z']+){0,4}\s+(?:Church|Hospital|Institute|Company|Foundry|Factory|School|Theatre|Theater|Society|Club|Bank)\b/;
const DIRECTIONAL_RELATIVE_LOCATION_RE =
  /\bjust\s+(?:west|east|north|south)\s+of\b|\bcatty-corner\s+(?:to|from)\b|\bacross\s+(?:the\s+street\s+)?from\b|\bnext\s+door\s+to\b/i;

/**
 * Vanished urban-scale pattern language: a road/street/rail line/trolley or
 * streetcar line/canal/stream/creek/waterway/alley/right-of-way that a
 * sentence or paragraph both names (VANISHED_URBAN_OBJECT_RE) and states no
 * longer exists in some form (VANISHED_URBAN_FATE_RE) — demolished, removed,
 * filled in, paved over, closed, abandoned, or "has left little trace".
 * Defined here, ahead of pivotsAwayFromTarget/continuesTargetSubject (which
 * reference it), rather than only near the urban-remnant classifier further
 * below, since it is now also a general relevance-scoping signal: historical/
 * vanished-feature language, even without a pronoun, is evidence a paragraph
 * is still explaining the target's present form rather than introducing an
 * unrelated place — see pivotsAwayFromTarget's doc below.
 */
const VANISHED_URBAN_OBJECT_RE =
  /\b(?:road|street|avenue|lane|highway|turnpike|rail(?:road)?\s*line|trolley\s*line|streetcar\s*line|track|canal|stream|creek|brook|waterway|alley|right-of-way)\b/i;
const VANISHED_URBAN_FATE_RE =
  /\bhas left little trace\b|\bleft no trace\b|\bno longer (?:exists?|survives?)\b|\blong since disappeared\b|\bis long gone\b|\bfell into disuse\b|\bwas (?:demolished|removed|filled in|paved over|abandoned|closed)\b|\bwere (?:demolished|removed)\b|\bceased to (?:exist|be important)\b|\berased from the map\b|\bsince (?:removed|demolished|filled in|paved over)\b/i;

function isVanishedUrbanPatternSentence(sentence: string): boolean {
  return (
    VANISHED_URBAN_FATE_RE.test(sentence) &&
    VANISHED_URBAN_OBJECT_RE.test(sentence)
  );
}

/**
 * Same object+fate co-occurrence test as isVanishedUrbanPatternSentence, but
 * scoped to a SINGLE sentence within `text` rather than `text` as one blob.
 * Required because `text` is sometimes a whole paragraph (pivotsAwayFromTarget
 * is called with either a single sentence or a full paragraph, depending on
 * caller) — testing object/fate presence against the whole paragraph string
 * lets an unrelated object mention in one sentence and an unrelated fate
 * mention in a different sentence combine into a false match, even when
 * neither individually describes a vanished urban feature (found in a real
 * Baldwin Park regression: a paragraph mentioning "...Arch Street..." in one
 * sentence and "...was demolished..." in a later sentence about a wholly
 * different building). Splitting into sentences first and requiring BOTH
 * halves in the SAME sentence closes that gap while leaving true single-
 * sentence-call behavior unchanged (splitting a single sentence is a no-op).
 */
function hasVanishedUrbanPatternInText(text: string): boolean {
  return splitSentencesInParagraph(text).some(isVanishedUrbanPatternSentence);
}

/** Escapes a street name for regex use and lets internal whitespace flex (e.g. multi-word names). */
function streetNamePattern(streetName: string): string {
  return streetName
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
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

/** Matches either a plain 3-5 digit housenumber (the original, Philadelphia-corridor-calibrated form) or a NYC outer-borough block-and-lot housenumber (e.g. "81-04": a 1-2 digit block + hyphen + 1-4 digit lot). The plain-only form excluded every Queens/Bronx/Staten Island block-style address from relevance-scoping entirely, independent of (and blocking downstream of) the Part 1 grounding-parser fix. General, not source-specific — both forms are tried at every match site. */
const HOUSENUMBER_GROUP_RE = "(?:\\d{1,2}-\\d{1,4}|\\d{3,5})";

/** Every house-number-range mention of the given street in a text — the streetName-parameterized generalization of baldwinParkMatcher.ts's SPRING_GARDEN_MENTION_RE-based springGardenMentions. */
function streetMentions(text: string, streetName: string): AddressRange[] {
  const re = new RegExp(
    `\\b(${HOUSENUMBER_GROUP_RE})(-\\d{1,4})?\\s+${streetNamePattern(streetName)}\\b`,
    "gi",
  );
  const ranges: AddressRange[] = [];
  for (const m of text.matchAll(re)) {
    const raw = m[2] ? `${m[1]}${m[2]}` : m[1];
    const range = expandHouseNumberRange(raw);
    if (range) ranges.push(range);
  }
  return ranges;
}

/** Parses "1901 SPRING GARDEN ST" into a house-number range for the given street — the streetName-parameterized generalization of baldwinParkMatcher.ts's parseCorridorAddress. */
function parseAddressOnStreet(
  address: string,
  streetName: string,
): AddressRange | null {
  const m = address.match(
    new RegExp(`^(\\d[\\d-]*)\\s+${streetNamePattern(streetName)}\\b`, "i"),
  );
  if (!m) return null;
  return expandHouseNumberRange(m[1]);
}

/**
 * `ownContextNames` (e.g. a candidate's own containing neighborhood) are
 * stripped before testing OTHER_NAMED_PLACE_RE only. Fixes a real false-
 * positive found in the FNY source-native hardening pass: OTHER_NAMED_PLACE_RE
 * matches any "[Capitalized word] Heights/Park/Estate/..." phrase as if it
 * introduced a DIFFERENT competing named place, but a sentence that merely
 * mentions the target's OWN containing neighborhood (e.g. "Andrew Jackson has
 * nothing to do with Jackson Heights", where "Jackson Heights" is the
 * neighborhood the target candidate itself sits in, not a different subject)
 * is not actually pivoting away. General, not FNY/NYC-specific: any candidate
 * whose containing-neighborhood name happens to end in one of
 * OTHER_NAMED_PLACE_RE's generic suffix words would hit this. `ownContextNames`
 * defaults to empty, so callers that don't supply it (Baldwin Park, Hidden
 * City, Ephemeral) are byte-identical to prior behavior. Only OTHER_NAMED_PLACE_RE
 * is affected — OTHER_STREET_RE/SURVEY_OR_LIST_RE/INSTITUTION_INTRO_RE keep
 * testing the original (street-mentions-only-stripped) text, so a genuine
 * pivot to a different named place, a different street, a survey/list
 * sentence, or an institution-intro sentence is still caught unchanged.
 *
 * A second, separate exemption applies only to OTHER_STREET_RE: a named
 * street/road is treated as a potentially explanatory object of the target's
 * own vanished-urban-pattern backstory, not automatically a competing place,
 * when the given text exhibits vanished-urban-scale-pattern language in a
 * single sentence (hasVanishedUrbanPatternInText — e.g. "has left little
 * trace", "fell into disuse", "was demolished"). Real example: Forgotten New
 * York's "Crooked House" states, in one sentence, that "the road cutting
 * northeast, Trains Meadow Road, has left little trace" — that named road is
 * the explanatory object for the target's present diagonal orientation, not
 * a different subject. This exemption is deliberately scoped to a SAME-
 * SENTENCE object+fate pairing (see hasVanishedUrbanPatternInText) rather
 * than "anywhere in this text" — an earlier, looser paragraph-wide version of
 * this exemption caused a real Baldwin Park regression, where an unrelated
 * "...Arch Street..." mention in one sentence and an unrelated "...was
 * demolished..." mention in a later sentence of the same paragraph (both
 * describing a wholly different building) combined into a false exemption.
 * The exemption only suppresses OTHER_STREET_RE; a paragraph or sentence
 * naming another street with no same-sentence vanished-urban-pattern language
 * (a genuine pivot to a different, still-existing place) is unaffected and
 * still flagged.
 */
function pivotsAwayFromTarget(
  text: string,
  streetName: string,
  ownContextNames: readonly string[] = [],
): boolean {
  const withoutTargetStreetMentions = text.replace(
    new RegExp(streetNamePattern(streetName), "gi"),
    "",
  );
  const withoutOwnContextNames = ownContextNames.reduce(
    (acc, name) => acc.replace(new RegExp(streetNamePattern(name), "gi"), ""),
    withoutTargetStreetMentions,
  );
  const explainsVanishedUrbanPattern = hasVanishedUrbanPatternInText(text);
  return (
    OTHER_NAMED_PLACE_RE.test(withoutOwnContextNames) ||
    (!explainsVanishedUrbanPattern &&
      OTHER_STREET_RE.test(withoutTargetStreetMentions)) ||
    SURVEY_OR_LIST_RE.test(text) ||
    INSTITUTION_INTRO_RE.test(text)
  );
}

/**
 * A paragraph continues the target's subject either via an explicit
 * pronoun/demonstrative reference (CONTINUATION_REFERENCE_RE — "it", "the
 * house", etc.) or via vanished-urban-pattern language on its own
 * (hasVanishedUrbanPatternInText) — historical/explanatory backstory about a
 * vanished road, rail line, or similar urban-scale feature does not always
 * re-use a pronoun for the target itself (e.g. "the road ceased to be
 * important and fell into disuse" refers to the vanished road, not the
 * target, but is still part of the target's own explanatory context, not a
 * subject change). Either signal must still clear pivotsAwayFromTarget.
 */
function continuesTargetSubject(
  paragraph: string,
  streetName: string,
  ownContextNames: readonly string[] = [],
): boolean {
  return (
    (CONTINUATION_REFERENCE_RE.test(paragraph) ||
      hasVanishedUrbanPatternInText(paragraph)) &&
    !pivotsAwayFromTarget(paragraph, streetName, ownContextNames)
  );
}

/**
 * Per-paragraph target-place relevance — see baldwinParkExtractor.ts's
 * original module doc (preserved unchanged in that file) for the full
 * false-positive history this logic fixes.
 *
 * Two, deliberately separate, extension mechanisms past the anchor paragraph:
 *
 * 1. The original single-hop pronoun/demonstrative continuation (unchanged
 *    distance — exactly one paragraph past the anchor). Kept bounded to one
 *    hop deliberately: a real production regression was found (Baldwin
 *    Park's Stetson Mansion page) where generalizing this into an unbounded
 *    chain let a long run of loosely pronoun-linked biographical paragraphs
 *    about the same person's OTHER buildings (a factory, a retail store —
 *    neither pivot-flagged by the existing heuristics, since they name no
 *    competing address on the target's street) drift into the target's own
 *    claim set. That single-hop distance limit is a load-bearing part of the
 *    existing false-positive protection, not an arbitrary technical limit.
 * 2. A separate, unbounded vanished-urban-pattern chain: starting just past
 *    the anchor, keeps scanning forward (skipping over intervening neutral
 *    paragraphs) and marks each paragraph relevant ONLY if that paragraph
 *    contains at least one individual sentence that is itself a vanished-
 *    urban-pattern sentence (hasVanishedUrbanPatternInText — states both a
 *    road/rail/etc. object and its vanished fate in the SAME sentence),
 *    stopping immediately at the first paragraph that mentions another
 *    address on the target's own street or otherwise pivots away. This is
 *    deliberately narrower than (1): it only ever marks paragraphs that are
 *    themselves substantively part of the target's own vanished-feature
 *    backstory (e.g. Forgotten New York's "Crooked House": the vanished-road
 *    paragraphs a few paragraphs after the anchor), not any paragraph merely
 *    reachable by a chain of pronouns. Checking per-sentence rather than the
 *    whole paragraph blob matters: a real Baldwin Park regression showed a
 *    paragraph with an unrelated object word in one sentence and an unrelated
 *    fate word in another sentence (different building entirely) otherwise
 *    matching as a false positive.
 */
function computeParagraphRelevance(
  paragraphs: string[],
  target: AddressRange | null,
  identityAnchors: string[],
  streetName: string,
  ownContextNames: readonly string[] = [],
): { relevant: boolean[]; hasDirectMention: boolean[] } {
  const mentionsTarget: boolean[] = [];
  const mentionsOtherAddress: boolean[] = [];
  for (const paragraph of paragraphs) {
    const addressMentions = streetMentions(paragraph, streetName);
    const hasTargetAddress = target
      ? addressMentions.some((m) => rangesOverlap(m, target))
      : false;
    const hasOtherAddress = target
      ? addressMentions.some((m) => !rangesOverlap(m, target))
      : addressMentions.length > 0;
    const hasIdentityAnchor = identityAnchors.some((anchor) =>
      mentionsAnchor(paragraph, anchor),
    );
    mentionsTarget.push(hasTargetAddress || hasIdentityAnchor);
    mentionsOtherAddress.push(hasOtherAddress);
  }

  const relevant = paragraphs.map(() => false);
  for (let i = 0; i < paragraphs.length; i++) {
    if (!mentionsTarget[i]) continue;
    relevant[i] = true;

    if (
      i + 1 < paragraphs.length &&
      !mentionsOtherAddress[i + 1] &&
      continuesTargetSubject(paragraphs[i + 1], streetName, ownContextNames)
    ) {
      relevant[i + 1] = true;
    }

    for (let j = i + 1; j < paragraphs.length; j++) {
      if (mentionsOtherAddress[j]) break;
      if (pivotsAwayFromTarget(paragraphs[j], streetName, ownContextNames))
        break;
      if (hasVanishedUrbanPatternInText(paragraphs[j])) {
        relevant[j] = true;
      }
    }
  }
  return { relevant, hasDirectMention: mentionsTarget };
}

/**
 * Sentence-level target-subject relevance within an already paragraph-
 * relevant paragraph — see baldwinParkExtractor.ts's original module doc for
 * the full false-positive history.
 *
 * Each sentence's own pivotsAwayFromTarget check is self-contained (no
 * paragraph-wide vanished-urban-pattern flag shared across sentences) — an
 * earlier version threaded a per-paragraph flag into every sentence's check,
 * but that let one sentence's genuine vanished-urban-pattern language (e.g.
 * a real road that "has left little trace") exempt an unrelated OTHER_STREET_RE
 * match in a DIFFERENT sentence of the same paragraph naming an unconnected
 * street, a real Baldwin Park regression. Real-world vanished-feature prose
 * (e.g. Crooked House's "the road cutting northeast, Trains Meadow Road, has
 * left little trace") states the object and fate together in one sentence,
 * so no cross-sentence sharing is needed for the target case this exists for.
 */
function computeSentenceRelevance(
  sentences: string[],
  target: AddressRange | null,
  identityAnchors: string[],
  paragraphHasDirectMention: boolean,
  streetName: string,
  ownContextNames: readonly string[] = [],
): boolean[] {
  let onTarget = !paragraphHasDirectMention;
  const relevant: boolean[] = [];
  for (const sentence of sentences) {
    const addressMentions = streetMentions(sentence, streetName);
    const hasTargetAddress = target
      ? addressMentions.some((m) => rangesOverlap(m, target))
      : false;
    const hasOtherAddress = target
      ? addressMentions.some((m) => !rangesOverlap(m, target))
      : addressMentions.length > 0;
    const introducesOtherSubject =
      hasOtherAddress ||
      pivotsAwayFromTarget(sentence, streetName, ownContextNames);
    const hasIdentityAnchor = identityAnchors.some((anchor) =>
      mentionsAnchor(sentence, anchor),
    );
    const locatesOtherSubjectRelativeToTarget =
      DIRECTIONAL_RELATIVE_LOCATION_RE.test(sentence);

    if (locatesOtherSubjectRelativeToTarget) {
      onTarget = false;
    } else if (hasTargetAddress) {
      onTarget = true;
    } else if (introducesOtherSubject) {
      onTarget = false;
    } else if (hasIdentityAnchor) {
      onTarget = true;
    }
    // else: no explicit signal in this sentence — inherit the prior state unchanged (bounded discourse continuation).

    relevant.push(onTarget);
  }

  return relevant;
}

const YEAR_RE = /\b(1[5-9]\d{2}|20\d{2})\b/g;
const STREET_SUFFIX_RE =
  "(?:Street|St\\.?|Road|Rd\\.?|Avenue|Ave\\.?|Boulevard|Blvd\\.?|Lane|Ln\\.?|Drive|Dr\\.?|Place|Pl\\.?|Court|Ct\\.?|Way|Terrace|Circle|Highway|Pike|Turnpike)";
const ADDRESS_NUMBER_RE = new RegExp(
  `\\b\\d{2,6}(?=(?:-\\d{1,4})?\\s+(?:[A-Z][a-zA-Z'.-]*\\s+){0,3}${STREET_SUFFIX_RE}\\b)`,
  "g",
);
const ADDRESS_NUMBER_LIST_RE = new RegExp(
  `\\b\\d{2,6}(?:\\s*,\\s*\\d{2,6})*\\s+and\\s+\\d{2,6}(?=(?:-\\d{1,4})?\\s+(?:[A-Z][a-zA-Z'.-]*\\s+){0,3}${STREET_SUFFIX_RE}\\b)`,
  "g",
);
const ADDRESS_RANGE_TO_RE = /\baddress(?:es)?\s+\d{2,6}\s+to\s+\d{2,6}\b/gi;
const ELLIPTICAL_ADDRESS_CONTEXT_RE =
  /\b(?:of|at|in front of|behind|next to|beside)\s*$/i;

/** streetName-parameterized generalizations of baldwinParkMatcher.ts's SPRING_GARDEN_ADDRESS_NUMBER_RE / SPRING_GARDEN_ADDRESS_NUMBER_LIST_RE, built per extraction call rather than as a module-level constant since streetName is now a runtime config value. */
function buildStreetAddressNumberRegex(streetName: string): RegExp {
  return new RegExp(
    `\\b\\d{3,5}(?=(?:-\\d{1,4})?\\s+${streetNamePattern(streetName)}\\b)`,
    "g",
  );
}
function buildStreetAddressNumberListRegex(streetName: string): RegExp {
  return new RegExp(
    `\\b\\d{2,6}(?:\\s*,\\s*\\d{2,6})*\\s+and\\s+\\d{2,6}(?=(?:-\\d{1,4})?\\s+${streetNamePattern(streetName)}\\b)`,
    "g",
  );
}

function extractYears(
  sentence: string,
  target: AddressRange | null,
  streetName: string,
): string[] {
  const addressNumberIndices = new Set<number | undefined>();
  const addSingle = (re: RegExp) => {
    for (const m of sentence.matchAll(re)) addressNumberIndices.add(m.index);
  };
  const addList = (re: RegExp) => {
    for (const m of sentence.matchAll(re)) {
      const base = m.index ?? 0;
      for (const numMatch of m[0].matchAll(/\d{2,6}/g)) {
        addressNumberIndices.add(base + (numMatch.index ?? 0));
      }
    }
  };
  addSingle(ADDRESS_NUMBER_RE);
  addSingle(buildStreetAddressNumberRegex(streetName));
  addList(ADDRESS_NUMBER_LIST_RE);
  addList(buildStreetAddressNumberListRegex(streetName));
  addList(ADDRESS_RANGE_TO_RE);

  return [...sentence.matchAll(YEAR_RE)]
    .filter((m) => {
      if (addressNumberIndices.has(m.index)) return false;
      if (target) {
        const value = parseInt(m[0], 10);
        if (value >= target.low && value <= target.high) {
          const before = sentence.slice(0, m.index ?? 0).trimEnd();
          if (ELLIPTICAL_ADDRESS_CONTEXT_RE.test(before)) return false;
        }
      }
      return true;
    })
    .map((m) => m[0]);
}

const NAME_CAPTURE = "([A-Z][a-zA-Z.'&-]+(?:\\s+[A-Z][a-zA-Z.'&-]+){0,4})";

function extractNamesAfter(sentence: string, triggers: RegExp[]): string[] {
  const names: string[] = [];
  for (const trigger of triggers) {
    const m = sentence.match(trigger);
    if (m && m[1]) names.push(m[1].trim().replace(/[.,;]+$/, ""));
  }
  return names;
}

const LEGEND_RE = /\blegend\b|\btradition (?:holds|says)\b|\bfolklore\b/i;
const HEDGE_RE =
  /\breportedly\b|\bsaid to have\b|\baccording to local (?:lore|tradition|legend)\b|\bbelieved to\b|\bit is said\b|\bpurportedly\b/i;

/**
 * Place-name-origin/naming-myth correction pattern — reuses the existing
 * `legend-tradition` claim type (already recognized as story-bearing by the
 * production worthiness gate, artifacts/api-server/src/lib/
 * localHistoryAdmission/worthiness.ts) rather than adding a new ClaimType.
 * This is a genuinely recurring local-history story shape, not a one-off:
 * confirmed present across at least 6 of the 30 Jackson Heights Forgotten
 * New York articles surveyed in the source-native discovery proof (e.g. "The
 * Andrew Jackson"/"Leverich Cemetery"'s "everyone assumes the neighborhood
 * is named for President Jackson, but it's actually named for turnpike
 * developer John C. Jackson" correction). A popular misconception about a
 * place's namesake, corrected by the documented true origin, is
 * semantically a naming tradition/folklore claim even when the source is
 * confidently correcting it, not merely repeating it — the same category of
 * story LEGEND_RE/HEDGE_RE already recognize for epistemic-marker purposes.
 * General wording, not Jackson-Heights- or NYC-specific.
 */
const NAME_ORIGIN_MYTH_RE =
  /\bmisnomer\b|\bhas nothing to do with\b|\bis not named for\b|\bnot named for\b|\berroneously (?:named|believed|thought)\b|\bmistakenly (?:believe[sd]?|thought)\b|\bcommonly (?:believed|thought|assumed)\b|\bcontrary to (?:popular )?belief\b|\bpopularly (?:believed|thought|assumed)\b|\bwidely (?:believed|assumed|thought)\b/i;

/**
 * `urban-remnant` claim type: a present-day physical characteristic that is
 * evidence of a specific vanished urban-scale pattern or feature (a
 * demolished street, a removed rail line, a filled stream/canal, an earlier
 * parcel boundary or street-grid pattern) — e.g. Forgotten New York's
 * "Crooked House" (diagonal building orientation caused by the former Trains
 * Meadow Road). General vocabulary, not tied to any one building, street, or
 * source. Deliberately narrow: an old/odd-shaped building or lot with no
 * identified cause, or mere decorative/stylistic evocation of the past
 * (e.g. Tudor Revival styling), does not qualify — see REMNANT_PRESENT_FORM_RE/
 * VANISHED_URBAN_*_RE docs below for exactly what each half of the invariant
 * requires.
 *
 * Present-day physical form half of the invariant: a diagonal/angled/askew
 * orientation, a lot-line/property-line/party-wall angle, curb/paving
 * geometry, a footprint, or a low point/dip in the street grid. Does NOT
 * include generic age/condition/style words (old, unusual, historic,
 * charming) — those alone never establish a physical remnant.
 */
const REMNANT_PRESENT_FORM_RE =
  /\bdiagonal(?:ly)?\b|\bat an angle\b|\baskew\b|\b(?:lot|property|parcel) (?:line|boundary)\b|\bparty wall\b|\bcurb(?:s|ing)?\b|\bpaving\b|\bfootprint\b|\blow point\b|\bdip in the (?:street|grade|land)\b/i;

// Vanished urban-scale pattern half of the invariant (VANISHED_URBAN_OBJECT_RE
// / VANISHED_URBAN_FATE_RE / isVanishedUrbanPatternSentence) is defined
// earlier in this file, above pivotsAwayFromTarget, since it is now also a
// relevance-scoping signal — see that definition's doc comment. Requiring
// both halves in the SAME sentence (isVanishedUrbanPatternSentence) excludes
// a bare mention of an existing, still-present road/rail/waterway.

function detectEpistemicMarkers(
  sentence: string,
): EpistemicMarker[] | undefined {
  if (LEGEND_RE.test(sentence)) return ["legend-or-tradition"];
  if (HEDGE_RE.test(sentence)) return ["hedged"];
  return undefined;
}

/**
 * Opt-in, already-evidenced classifier keyword broadenings. All default to
 * false/off, which reproduces baldwinParkExtractor.ts's original (pre-v0.2)
 * behavior exactly. Hidden City enables all three (its v0.2 bounded fix —
 * see hiddenCityExtractor.ts). Kept as separate named flags, not one bundled
 * switch, so a future source can adopt only the subset its own corpus
 * evidences, per the contract's "narrow extensions, not vocabulary packs"
 * principle.
 */
export interface ClassifierExtensions {
  /** Recognizes "designed" (construction-date trigger) and "designed by" (architect trigger) — evidenced by Hidden City's Guild House architecture-journalism phrasing. */
  designedKeyword?: boolean;
  /** Recognizes "commissioned by" as a relationship trigger (+ name extraction). */
  commissionedByKeyword?: boolean;
  /** Recognizes "renovated"/"renovation"/"occupied" as event triggers. */
  renovatedOccupiedKeyword?: boolean;
}

interface SentenceClassification {
  claimType: ClaimType;
  relatedEntities?: string[];
  dateRange?: Claim["dateRange"];
}

/**
 * Context computed once per extraction call (not per sentence) — whether a
 * vanished-urban-pattern sentence (isVanishedUrbanPatternSentence) exists
 * ANYWHERE among this candidate's relevance-scoped sentences, even if not in
 * the same sentence as the present-day physical form. Lets the Tier-2
 * cross-sentence urban-remnant fallback below recognize cases like Crooked
 * House, where the diagonal-orientation sentence and the vanished-road
 * sentence are in separate paragraphs of the same article.
 */
interface RemnantContext {
  vanishedCauseElsewhere: boolean;
}

/** Deterministic, order-sensitive keyword/pattern classification of one sentence. Returns null when no recognized claim-bearing pattern is present. Identical cascade/ordering to both sources' prior individually-duplicated copies; `ext` gates only the specific keyword variants that were previously a Hidden-City-only divergence. */
function classifySentence(
  sentence: string,
  target: AddressRange | null,
  streetName: string,
  ext: ClassifierExtensions,
  remnantContext: RemnantContext = { vanishedCauseElsewhere: false },
): SentenceClassification | null {
  const years = extractYears(sentence, target, streetName);

  // Tier 1: both halves of the urban-remnant invariant (present physical
  // form + vanished urban-scale cause) stated in the SAME sentence. Checked
  // before demolition/legend so a sentence like "The house sits at an angle
  // because the road it once fronted was removed decades ago" is classified
  // as urban-remnant rather than misrouted elsewhere.
  if (
    REMNANT_PRESENT_FORM_RE.test(sentence) &&
    isVanishedUrbanPatternSentence(sentence)
  ) {
    return {
      claimType:
        LEGEND_RE.test(sentence) || HEDGE_RE.test(sentence)
          ? "legend-tradition"
          : "urban-remnant",
      dateRange: years[0]
        ? { start: `${years[0]}-01-01`, precise: false }
        : undefined,
    };
  }

  if (/\bdemolish|\brazed\b|\btorn down\b|\bdemolition\b/i.test(sentence)) {
    return {
      claimType: "demolition",
      dateRange: years[0]
        ? { start: `${years[0]}-01-01`, precise: true }
        : undefined,
    };
  }

  if (NAME_ORIGIN_MYTH_RE.test(sentence)) {
    return {
      claimType: "legend-tradition",
      dateRange: years[0]
        ? { start: `${years[0]}-01-01`, precise: false }
        : undefined,
    };
  }

  const constructionDateRe = ext.designedKeyword
    ? /\bbuilt\b|\bconstructed\b|\bconstruction of\b|\bdesigned\b/i
    : /\bbuilt\b|\bconstructed\b|\bconstruction of\b/i;
  if (constructionDateRe.test(sentence) && years.length > 0) {
    const architects = extractNamesAfter(sentence, [
      new RegExp(`architect\\s+${NAME_CAPTURE}`, "i"),
      new RegExp(`designed by\\s+${NAME_CAPTURE}`, "i"),
      new RegExp(`built by\\s+${NAME_CAPTURE}`, "i"),
      new RegExp(`builder\\s+${NAME_CAPTURE}`, "i"),
    ]);
    return {
      claimType: "construction-date",
      relatedEntities: architects.length ? architects : undefined,
      dateRange: { start: `${years[0]}-01-01`, precise: true },
    };
  }

  const architectRe = ext.designedKeyword
    ? /\barchitect\b|\bdesigned by\b/i
    : /\barchitect\b/i;
  if (architectRe.test(sentence)) {
    const architects = extractNamesAfter(sentence, [
      new RegExp(`architect\\s+${NAME_CAPTURE}`, "i"),
      new RegExp(`designed by\\s+${NAME_CAPTURE}`, "i"),
    ]);
    if (architects.length > 0) {
      return {
        claimType: "architect",
        relatedEntities: architects,
        dateRange: years[0]
          ? { start: `${years[0]}-01-01`, precise: true }
          : undefined,
      };
    }
  }

  const relationshipRe = ext.commissionedByKeyword
    ? /\bowned by\b|\bpurchased\b|\bsold to\b|\boccupied by\b|\btenant\b|\bclient\b|\bcommissioned by\b/i
    : /\bowned by\b|\bpurchased\b|\bsold to\b|\boccupied by\b|\btenant\b|\bclient\b/i;
  if (relationshipRe.test(sentence)) {
    const triggers = [
      new RegExp(`owned by\\s+${NAME_CAPTURE}`, "i"),
      new RegExp(`purchased by\\s+${NAME_CAPTURE}`, "i"),
      new RegExp(`sold to\\s+${NAME_CAPTURE}`, "i"),
      new RegExp(`occupied by\\s+${NAME_CAPTURE}`, "i"),
    ];
    if (ext.commissionedByKeyword)
      triggers.push(new RegExp(`commissioned by\\s+${NAME_CAPTURE}`, "i"));
    const people = extractNamesAfter(sentence, triggers);
    return {
      claimType: "relationship",
      relatedEntities: people.length ? people : undefined,
      dateRange: years[0]
        ? { start: `${years[0]}-01-01`, precise: true }
        : undefined,
    };
  }

  if (/\bfounded\b|\bestablished\b|\borganized\b/i.test(sentence)) {
    const orgs = extractNamesAfter(sentence, [
      new RegExp(`founded\\s+${NAME_CAPTURE}`, "i"),
    ]);
    return {
      claimType: "institutional-founding",
      relatedEntities: orgs.length ? orgs : undefined,
      dateRange: years[0]
        ? { start: `${years[0]}-01-01`, precise: true }
        : undefined,
    };
  }

  const fromToYears = sentence.match(
    /\bfrom\s+(1[5-9]\d{2}|20\d{2})\s+to\s+(1[5-9]\d{2}|20\d{2})\b/i,
  );
  if (
    /\bformerly\b|\bbecame\b|\bconverted (?:to|into)\b|\bconversion (?:to|into)\b|\bonce (?:a|an|housed|home to)\b/i.test(
      sentence,
    ) ||
    fromToYears
  ) {
    return {
      claimType: "use-history",
      dateRange: fromToYears
        ? {
            start: `${fromToYears[1]}-01-01`,
            end: `${fromToYears[2]}-01-01`,
            precise: true,
          }
        : years[0]
          ? { start: `${years[0]}-01-01`, precise: false }
          : undefined,
    };
  }

  const eventRe = ext.renovatedOccupiedKeyword
    ? /\bsold\b|\bsell(?:ing)?\b|\bacquired\b|\bmoved\b|\bopened\b|\bclosed\b|\brenovated\b|\brenovation\b|\boccupied\b/i
    : /\bsold\b|\bsell(?:ing)?\b|\bacquired\b|\bmoved\b|\bopened\b|\bclosed\b/i;
  if (eventRe.test(sentence) && years.length > 0) {
    return {
      claimType: "event",
      dateRange: { start: `${years[0]}-01-01`, precise: true },
    };
  }

  if (/\bborn\b|\bdied\b|\bb\.\s*\d{4}\b|\bd\.\s*\d{4}\b/i.test(sentence)) {
    return {
      claimType: "biographical",
      dateRange: years[0]
        ? { start: `${years[0]}-01-01`, precise: false }
        : undefined,
    };
  }

  if (
    /\$[\d,]+/.test(sentence) &&
    /\bpurchase price\b|\bgrant\b|\bsales? price\b|\bpaid\b/i.test(sentence)
  ) {
    return {
      claimType: "statistic",
      dateRange: years[0]
        ? { start: `${years[0]}-01-01`, precise: true }
        : undefined,
    };
  }

  // Tier 2: this sentence states only the present-day physical form (e.g.
  // Crooked House's diagonal orientation), with the vanished urban-scale
  // cause stated elsewhere in the same candidate's relevance-scoped text
  // (remnantContext.vanishedCauseElsewhere, precomputed by
  // extractNarrativeClaims). Placed last so it only fires when nothing else
  // in the cascade already classified the sentence.
  if (REMNANT_PRESENT_FORM_RE.test(sentence)) {
    if (remnantContext.vanishedCauseElsewhere) {
      return {
        claimType:
          LEGEND_RE.test(sentence) || HEDGE_RE.test(sentence)
            ? "legend-tradition"
            : "urban-remnant",
      };
    }
    return null;
  }

  return null;
}

export interface NarrativeExtractionConfig {
  /** The corridor street name this extraction call is scoped to (e.g. "Spring Garden"). No street name is hardcoded anywhere in this module. */
  streetName: string;
  /** Narrow, already-evidenced per-source extensions merged onto GENERIC_TITLE_WORDS_BASE — see module doc. */
  genericTitleWordExtensions?: readonly string[];
  /** Opt-in classifier keyword broadenings — see ClassifierExtensions doc. Defaults to all-off, reproducing Baldwin Park's original behavior. */
  classifierExtensions?: ClassifierExtensions;
}

export interface NarrativeClaimContext {
  placeKey: string;
  address: string;
  /** Source-supported title used only to derive identity anchors (e.g. PAB's "Stetson Residence", or a grounded place's own title) — not otherwise used or asserted. */
  title: string;
  proposedIdentityType: ProposedIdentityType;
  /** This claim batch's single Source id (e.g. "bp-${slug}", "hc-${articleId}"). */
  sourceId: string;
  /** Prefix for each claim's id, before "-p{p}s{s}-{claimType}" is appended (e.g. "bp-${slug}", "hc-${articleId}"). */
  claimIdPrefix: string;
  /** Builds each claim's human-readable claimText from its supporting sentence — kept caller-supplied so each source's existing exact wording ("Baldwin Park's page ... states about ...", "Hidden City's article ... states about ...") is preserved unchanged. */
  buildClaimText: (sentence: string) => string;
  /**
   * Optional name(s) of a place the TARGET itself is genuinely contained by
   * or otherwise inseparably associated with (e.g. its containing
   * neighborhood) — see pivotsAwayFromTarget's doc for the false-positive
   * this exists to prevent. Defaults to none, so existing callers that don't
   * supply it are unaffected. Not a general "ignore this word" escape hatch:
   * only suppresses OTHER_NAMED_PLACE_RE, and only for exact mentions of the
   * supplied name(s) — a sentence naming a genuinely different place is
   * unaffected and still pivots away as before.
   */
  ownContextNames?: readonly string[];
}

/**
 * Extracts every recognized claim from one already-matched narrative page/
 * article's plain body text, attributed to the given place. This is the
 * single shared implementation of the relevance-scoping + classification
 * pipeline previously duplicated in baldwinParkExtractor.ts and
 * hiddenCityExtractor.ts — see module doc for what stayed source-specific.
 */
export function extractNarrativeClaims(
  bodyText: string,
  config: NarrativeExtractionConfig,
  context: NarrativeClaimContext,
): Claim[] {
  const { streetName, genericTitleWordExtensions, classifierExtensions } =
    config;
  const {
    placeKey,
    address,
    title,
    proposedIdentityType,
    sourceId,
    claimIdPrefix,
    buildClaimText,
    ownContextNames,
  } = context;
  const sourceIds = [sourceId];
  const paragraphs = splitIntoParagraphs(bodyText);
  const target = parseAddressOnStreet(address, streetName);
  const identityAnchors = extractIdentityAnchors(
    title,
    genericTitleWordExtensions ?? [],
  );
  const { relevant: paragraphRelevant, hasDirectMention } =
    computeParagraphRelevance(
      paragraphs,
      target,
      identityAnchors,
      streetName,
      ownContextNames ?? [],
    );

  // Pre-scan: does a vanished-urban-pattern sentence (isVanishedUrbanPatternSentence)
  // exist anywhere among this candidate's relevance-scoped sentences? Computed
  // once up front, over the same paragraph/sentence relevance scoping as the
  // classification pass below, so the Tier-2 cross-sentence urban-remnant
  // fallback in classifySentence stays bounded to text already established
  // as relevant to this one candidate — not the whole raw article.
  let vanishedCauseElsewhere = false;
  paragraphs.forEach((paragraph, pIdx) => {
    if (!paragraphRelevant[pIdx]) return;
    const sentences = splitSentencesInParagraph(paragraph);
    const sentenceRelevant = computeSentenceRelevance(
      sentences,
      target,
      identityAnchors,
      hasDirectMention[pIdx],
      streetName,
      ownContextNames ?? [],
    );
    sentences.forEach((sentence, sIdx) => {
      if (!sentenceRelevant[sIdx]) return;
      if (isVanishedUrbanPatternSentence(sentence)) {
        vanishedCauseElsewhere = true;
      }
    });
  });

  const claims: Claim[] = [];
  const seen = new Set<string>();

  paragraphs.forEach((paragraph, pIdx) => {
    if (!paragraphRelevant[pIdx]) return;
    const sentences = splitSentencesInParagraph(paragraph);
    const sentenceRelevant = computeSentenceRelevance(
      sentences,
      target,
      identityAnchors,
      hasDirectMention[pIdx],
      streetName,
      ownContextNames ?? [],
    );
    sentences.forEach((sentence, sIdx) => {
      if (!sentenceRelevant[sIdx]) return;
      if (seen.has(sentence)) return;
      seen.add(sentence);
      const classification = classifySentence(
        sentence,
        target,
        streetName,
        classifierExtensions ?? {},
        { vanishedCauseElsewhere },
      );
      if (!classification) return;

      claims.push({
        id: `${claimIdPrefix}-${placeKeyIdToken(placeKey)}-p${pIdx}s${sIdx}-${classification.claimType}`,
        placeKey,
        address,
        proposedIdentityType,
        sourceIds,
        supportingSpan: sentence,
        claimType: classification.claimType,
        claimText: buildClaimText(sentence),
        relatedEntities: classification.relatedEntities,
        dateRange: classification.dateRange,
        epistemicMarkers: detectEpistemicMarkers(sentence),
        extractionMethod: "direct-source-text",
      });
    });
  });

  return claims;
}
