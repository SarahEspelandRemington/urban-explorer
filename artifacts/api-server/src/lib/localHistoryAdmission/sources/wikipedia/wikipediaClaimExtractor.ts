/**
 * Wikipedia narrative claim extraction.
 *
 * Added for the offline Wikipedia -> structured Claim proof (see
 * experiments/wikipedia-claim-extraction-v0/). Thin wrapper around the
 * shared ../../narrativeExtractor.ts core, same pattern as
 * ../forgottenNy/forgottenNyExtractor.ts: all paragraph/sentence relevance
 * scoping, address-vs-year disambiguation, and sentence classification is
 * delegated to the shared core unchanged. Only Wikipedia-specific
 * input/output shape, section-heading cleanup, and claim-id/sourceId/
 * claimText templating live here.
 *
 * Deliberately takes an already-fetched Wikipedia summary (the same shape
 * production's fetchWikipediaSummaryForCandidate in routes/explore/index.ts
 * already resolves, via either the direct wikipedia= tag or the wikidata=
 * enwiki-sitelink fallback) rather than performing its own retrieval. This
 * module is offline-only: it is not wired into that live resolution path or
 * into copy generation.
 */
import type { Claim, ProposedIdentityType, Source } from "../../types";
import {
  extractNarrativeClaims,
  type ClassifierExtensions,
} from "../../narrativeExtractor";

// Same register as Forgotten NY/Hidden City/Ephemeral: encyclopedic prose
// naming who designed/commissioned/renovated a place, not PAB's
// register-listing language.
const CLASSIFIER_EXTENSIONS: ClassifierExtensions = {
  designedKeyword: true,
  commissionedByKeyword: true,
  renovatedOccupiedKeyword: true,
};

export interface WikipediaArticleSummary {
  /** Canonical Wikipedia page title actually resolved (post-redirect). */
  title: string;
  /** Full plaintext extract (action=query&prop=extracts&explaintext=1) — same shape as WikipediaSummary.extract in routes/explore/index.ts. */
  extract: string;
  lang: string;
  articleUrl?: string;
}

export interface WikipediaClaimExtractionInput {
  article: WikipediaArticleSummary;
  placeKey: string;
  /** May be "" for a subject the article never ties to one exact address — the shared core and downstream grounding both handle an empty address by relying on identity-anchor relevance only. Same contract as ForgottenNyExtractionInput.address. */
  address: string;
  streetName: string;
  /** Identity anchor for paragraph relevance scoping — same role as ForgottenNyExtractionInput.title. */
  title: string;
  proposedIdentityType: ProposedIdentityType;
  ownContextNames?: readonly string[];
}

function wikiSourceId(article: WikipediaArticleSummary): string {
  const slug = article.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `wiki-${article.lang}-${slug}`;
}

/**
 * Strips MediaWiki section-heading lines ("== History ==", "== References
 * ==", etc.) from a plaintext extract. explaintext extracts are not HTML —
 * the only non-prose markup present is these heading lines, which would
 * otherwise reach the shared sentence splitter as meaningless fragments.
 * Section bodies (including a References/External links body, which in an
 * explaintext extract is usually empty or bare link text) are left
 * untouched; the shared core's own classifySentence already declines to
 * classify non-sentence fragments, so no further filtering is required.
 */
function stripSectionHeadings(extract: string): string {
  return extract
    .split("\n")
    .filter((line) => !/^=+\s*.*?\s*=+$/.test(line.trim()))
    .join("\n");
}

/**
 * Extracts every recognized claim from one Wikipedia article's plaintext
 * extract, scoped to one named subject. Delegates all relevance-scoping/
 * classification work to the shared narrative core; only Wikipedia-specific
 * config/templating lives here.
 */
export function extractWikipediaClaims(
  input: WikipediaClaimExtractionInput,
): Claim[] {
  const {
    article,
    placeKey,
    address,
    streetName,
    title,
    proposedIdentityType,
    ownContextNames,
  } = input;
  const sourceId = wikiSourceId(article);
  const bodyText = stripSectionHeadings(article.extract);
  return extractNarrativeClaims(
    bodyText,
    {
      streetName,
      classifierExtensions: CLASSIFIER_EXTENSIONS,
    },
    {
      placeKey,
      address,
      title,
      proposedIdentityType,
      sourceId,
      claimIdPrefix: `${sourceId}-${placeKey}`,
      buildClaimText: (sentence) =>
        `Wikipedia's article "${article.title}" states about ${address || title}: "${sentence}"`,
      ownContextNames,
    },
  );
}

/**
 * One Source per Wikipedia article, capabilities derived from which claim
 * types were actually extracted for a given subject — same pattern as
 * buildForgottenNySource. Strength uniformly "medium": a conservative
 * default for a narrative extract with no attached citation apparatus
 * (explaintext strips <ref> markers), same tier as the pipeline's other
 * narrative sources, rather than assuming Wikipedia's general reputation
 * makes any given extracted sentence more reliable than an equivalent FNY/
 * Hidden City/Ephemeral sentence.
 */
export function buildWikipediaSource(
  article: WikipediaArticleSummary,
  claims: Claim[],
): Source {
  const sourceId = wikiSourceId(article);
  const claimTypes = [...new Set(claims.map((c) => c.claimType))];
  const capabilities: Source["capabilities"] = claimTypes.map((claimType) => ({
    claimType,
    strength: "medium",
    notes:
      "Wikipedia article plaintext extract (action=query&prop=extracts&explaintext=1) with no attached citation apparatus in this form, so capped at medium strength, same tier as the pipeline's other narrative sources.",
  }));

  return {
    id: sourceId,
    title: `Wikipedia — ${article.title}`,
    url:
      article.articleUrl ??
      `https://${article.lang}.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
    sourceClass: "wikipedia-wikidata",
    capabilities,
  };
}
