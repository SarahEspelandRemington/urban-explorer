/**
 * Ephemeral New York narrative claim extraction — NYC narrative-source
 * portability proof. Offline/non-production, experimental — see
 * ../README.md.
 *
 * Thin wrapper around the shared ../narrative/narrativeExtractor.ts core,
 * same pattern as hiddencity/hiddenCityExtractor.ts (Task E consolidation):
 * all paragraph/sentence relevance scoping, address-vs-year disambiguation,
 * and sentence classification is delegated to the shared core unchanged.
 * Only Ephemeral-specific input/output shape and claim-id/sourceId/claimText
 * templating live here.
 *
 * Reuses Hidden City's already-evidenced classifierExtensions
 * (designedKeyword/commissionedByKeyword/renovatedOccupiedKeyword) since
 * Ephemeral's prose style (architecture-journalism-adjacent local history
 * writing) is the same register as Hidden City's, not PAB's register-listing
 * language the base classifier keywords were originally tuned for.
 */
import type { Claim, ProposedIdentityType, Source } from "../types";
import type { EphemeralArticle } from "./ephemeralAdapter";
import {
  extractNarrativeClaims,
  type ClassifierExtensions,
} from "../narrative/narrativeExtractor";

const CLASSIFIER_EXTENSIONS: ClassifierExtensions = {
  designedKeyword: true,
  commissionedByKeyword: true,
  renovatedOccupiedKeyword: true,
};

function articleId(article: EphemeralArticle): string {
  const m = article.url.match(/\/(\d{4})\/(\d{2})\/([^/]+)\/?$/);
  return m
    ? `${m[1]}-${m[2]}-${m[3]}`
    : article.url.replace(/[^a-z0-9]+/gi, "-");
}

export interface EphemeralExtractionInput {
  article: EphemeralArticle;
  placeKey: string;
  /** May be "" for a genuinely non-point/line-shaped claim (e.g. the Ninth Avenue El) — the shared core and downstream grounding both handle an empty address by relying on identity-anchor relevance only, never by guessing a point. */
  address: string;
  streetName: string;
  /** Identity anchor for paragraph relevance scoping — same role as HiddenCityExtractionInput.title. */
  title: string;
  proposedIdentityType: ProposedIdentityType;
}

/** Extracts every recognized claim from one Ephemeral New York article. Delegates all relevance-scoping/classification work to the shared narrative core; only Ephemeral-specific config/templating lives here. */
export function extractEphemeralClaims(
  input: EphemeralExtractionInput,
): Claim[] {
  const {
    article,
    placeKey,
    address,
    streetName,
    title,
    proposedIdentityType,
  } = input;
  const id = articleId(article);
  return extractNarrativeClaims(
    article.bodyText,
    {
      streetName,
      classifierExtensions: CLASSIFIER_EXTENSIONS,
    },
    {
      placeKey,
      address,
      title,
      proposedIdentityType,
      sourceId: `eny-${id}`,
      claimIdPrefix: `eny-${id}`,
      buildClaimText: (sentence) =>
        `Ephemeral New York's article "${article.title}" states about ${address || title}: "${sentence}"`,
    },
  );
}

/** One Source per Ephemeral article, capabilities derived from which claim types were actually extracted — same pattern as buildHiddenCitySource. Strength uniformly "medium": Ephemeral is an independent local-history narrative blog that cites archival photographs/newspapers/period sources in-text but has no formal citation/register apparatus, so capped at medium like Hidden City and Baldwin Park rather than granted "high" by default. */
export function buildEphemeralSource(
  article: EphemeralArticle,
  claims: Claim[],
): Source {
  const id = articleId(article);
  const claimTypes = [...new Set(claims.map((c) => c.claimType))];
  const capabilities: Source["capabilities"] = claimTypes.map((claimType) => ({
    claimType,
    strength: "medium",
    notes:
      "Independent local-history narrative blog (ephemeralnewyork.wordpress.com); cites archival photographs/newspapers/period sources in-text but has no formal citation/register apparatus, so capped at medium strength, same tier as Hidden City.",
  }));

  return {
    id: `eny-${id}`,
    title: `Ephemeral New York — ${article.title}`,
    url: article.url,
    sourceClass: "local-public-history-narrative",
    publicationDate: article.publishedAt ?? undefined,
    capabilities,
  };
}
