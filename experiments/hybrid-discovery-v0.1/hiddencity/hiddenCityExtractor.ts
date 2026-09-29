/**
 * Hidden City narrative claim extraction — claim-extraction pilot for the
 * Spring Garden 400-1200 confidently-matched articles. Offline/non-
 * production, experimental — see ../README.md.
 *
 * Task E consolidation: the paragraph/sentence relevance scoping, address-
 * vs-year disambiguation, and sentence classification logic previously
 * duplicated here from baldwinParkExtractor.ts now live in the single
 * shared ../narrative/narrativeExtractor.ts core that both this file and
 * baldwinParkExtractor.ts delegate to. This file keeps only what is
 * genuinely Hidden-City-specific: its input/output shape, the articleId
 * helper (HiddenCityArticle has no natural slug the way a Baldwin Park page
 * does), and its exact existing claim-id/sourceId/claimText templates
 * ("hc-${articleId}", "Hidden City's article ... states about ...").
 *
 * v0.2 bounded adjustment (preserved unchanged by this consolidation):
 * classifySentence's construction-date/architect/relationship/event
 * triggers were broadened with source-agnostic keyword variants
 * ("designed", "designed by", "commissioned by", "renovated"/"renovation",
 * "occupied") discovered missing during the v0.1 pilot (Guild House's
 * architecture-journalism phrasing went unrecognized by the PAB-register-
 * tuned keyword set). These are now the shared core's opt-in
 * `classifierExtensions` flags (designedKeyword/commissionedByKeyword/
 * renovatedOccupiedKeyword), all enabled here and all still off by default
 * for Baldwin Park — so this file's validated v0.2 behavior is unchanged.
 * Likewise, the extra 6 GENERIC_TITLE_WORDS ("fund"/"safe"/"deposit"/
 * "trust"/"savings"/"national", added for the Northern Savings Fund's
 * multi-name PAB title) are now passed as `genericTitleWordExtensions`
 * onto the shared core's GENERIC_TITLE_WORDS_BASE, rather than a locally
 * duplicated full word list.
 *
 * One remaining source-specific note: HiddenCityArticle has no natural
 * "identity anchor" source the way a PAB record title does (Baldwin Park's
 * anchors come from the FROZEN PAB record's own title). Here, anchors are
 * derived from the grounded place's own title (e.g. "Guild House"), passed
 * in as this call's `title` — the same kind of source-supported identity
 * signal, just supplied explicitly since the caller already has it from
 * the grounded PAB place set.
 */
import type { Claim, ProposedIdentityType, Source } from "../types";
import type { HiddenCityArticle } from "./hiddenCityAdapter";
import {
  extractNarrativeClaims,
  type ClassifierExtensions,
} from "../narrative/narrativeExtractor";

const STREET_NAME = "Spring Garden";

/** Hidden City's already-evidenced extension onto the shared GENERIC_TITLE_WORDS_BASE — see module doc. */
const GENERIC_TITLE_WORD_EXTENSIONS = [
  "fund",
  "safe",
  "deposit",
  "trust",
  "savings",
  "national",
];

/** Hidden City's already-evidenced v0.2 classifier keyword broadenings — see module doc. Baldwin Park passes none of these (shared core defaults to all-off). */
const CLASSIFIER_EXTENSIONS: ClassifierExtensions = {
  designedKeyword: true,
  commissionedByKeyword: true,
  renovatedOccupiedKeyword: true,
};

function articleId(article: HiddenCityArticle): string {
  const m = article.url.match(/\/(\d{4})\/(\d{2})\/([^/]+)\/?$/);
  return m
    ? `${m[1]}-${m[2]}-${m[3]}`
    : article.url.replace(/[^a-z0-9]+/gi, "-");
}

export interface HiddenCityExtractionInput {
  article: HiddenCityArticle;
  placeKey: string;
  address: string;
  /** Grounded place's own title (e.g. "Guild House") — used only to derive source-supported identity anchors for paragraph relevance scoping, same role as PAB's title in baldwinParkExtractor.ts. */
  title: string;
  proposedIdentityType: ProposedIdentityType;
}

/** Extracts every recognized claim from one already-matched Hidden City article, attributed to the SAME placeKey as the PAB record whose corridor address the article was matched against. Delegates the relevance-scoping/classification work to the shared narrative core (see ../narrative/narrativeExtractor.ts) with Hidden City's evidenced genericTitleWordExtensions/classifierExtensions; only Hidden-City-specific config/templating lives here. */
export function extractHiddenCityClaims(
  input: HiddenCityExtractionInput,
): Claim[] {
  const { article, placeKey, address, title, proposedIdentityType } = input;
  const id = articleId(article);
  return extractNarrativeClaims(
    article.bodyText,
    {
      streetName: STREET_NAME,
      genericTitleWordExtensions: GENERIC_TITLE_WORD_EXTENSIONS,
      classifierExtensions: CLASSIFIER_EXTENSIONS,
    },
    {
      placeKey,
      address,
      title,
      proposedIdentityType,
      sourceId: `hc-${id}`,
      claimIdPrefix: `hc-${id}`,
      buildClaimText: (sentence) =>
        `Hidden City's article "${article.title}" states about ${address}: "${sentence}"`,
    },
  );
}

/** One Source per Hidden City article, capabilities derived from which claim types were actually extracted — same pattern as buildBaldwinParkSource. Strength uniformly "medium": Hidden City is professional narrative journalism (named authors, cited archives/interviews) but without PAB's formal citation/register apparatus, so capped at medium like Baldwin Park rather than granted "high" by default. */
export function buildHiddenCitySource(
  article: HiddenCityArticle,
  claims: Claim[],
): Source {
  const id = articleId(article);
  const claimTypes = [...new Set(claims.map((c) => c.claimType))];
  const capabilities: Source["capabilities"] = claimTypes.map((claimType) => ({
    claimType,
    strength: "medium",
    notes:
      "Professional local narrative journalism (hiddencityphila.org); no formal citation/register apparatus, so capped at medium strength.",
  }));

  return {
    id: `hc-${id}`,
    title: `Hidden City Philadelphia — ${article.title}${article.author ? ` (by ${article.author})` : ""}`,
    url: article.url,
    sourceClass: "local-public-history-narrative",
    publicationDate: article.publishedAt ?? undefined,
    capabilities,
  };
}
