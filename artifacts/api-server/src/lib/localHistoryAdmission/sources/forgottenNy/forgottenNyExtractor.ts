/**
 * Forgotten New York narrative claim extraction.
 *
 * Promoted (faithful port) from
 * experiments/hybrid-discovery-v0.1/forgottenny/forgottenNyExtractor.ts for
 * production offline batch-tool use.
 *
 * Thin wrapper around the shared ../../narrativeExtractor.ts core, same
 * pattern the experiment used for Ephemeral/Hidden City: all paragraph/
 * sentence relevance scoping, address-vs-year disambiguation, and sentence
 * classification is delegated to the shared core unchanged. Only Forgotten-
 * NY-specific input/output shape and claim-id/sourceId/claimText templating
 * live here.
 *
 * Reuses the same classifierExtensions as Ephemeral/Hidden City
 * (designedKeyword/commissionedByKeyword/renovatedOccupiedKeyword) — Forgotten
 * NY's prose register (first-person urban-history essay, architectural/
 * developer-history detail) is the same family as Hidden City's and
 * Ephemeral's, not PAB's register-listing language.
 */
import type { Claim, ProposedIdentityType, Source } from "../../types";
import type { ForgottenNyArticle } from "./forgottenNyAdapter";
import {
  extractNarrativeClaims,
  type ClassifierExtensions,
} from "../../narrativeExtractor";

const CLASSIFIER_EXTENSIONS: ClassifierExtensions = {
  designedKeyword: true,
  commissionedByKeyword: true,
  renovatedOccupiedKeyword: true,
};

function articleId(article: ForgottenNyArticle): string {
  return `${article.id}`;
}

export interface ForgottenNyExtractionInput {
  article: ForgottenNyArticle;
  placeKey: string;
  /** May be "" for a genuinely non-point/multi-place/line-shaped article — the shared core and downstream grounding both handle an empty address by relying on identity-anchor relevance only, never by guessing a point. Same contract as EphemeralExtractionInput.address. */
  address: string;
  streetName: string;
  /** Identity anchor for paragraph relevance scoping — same role as EphemeralExtractionInput.title. For a multi-subject survey article, callers should call this once PER subject with that subject's own name as the anchor, not once for the whole article. */
  title: string;
  proposedIdentityType: ProposedIdentityType;
  /** Passed through to NarrativeClaimContext.ownContextNames — see its doc. E.g. the neighborhood a subject genuinely sits in (Jackson Heights), so a sentence merely naming that neighborhood isn't treated as pivoting to a different subject. Optional, defaults to none. */
  ownContextNames?: readonly string[];
}

/** Extracts every recognized claim from one Forgotten New York article, scoped to one named subject. Delegates all relevance-scoping/classification work to the shared narrative core; only Forgotten-NY-specific config/templating lives here. */
export function extractForgottenNyClaims(
  input: ForgottenNyExtractionInput,
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
      sourceId: `fny-${id}`,
      claimIdPrefix: `fny-${id}-${placeKey}`,
      buildClaimText: (sentence) =>
        `Forgotten New York's article "${article.title}" states about ${address || title}: "${sentence}"`,
      ownContextNames,
    },
  );
}

/** One Source per Forgotten New York article, capabilities derived from which claim types were actually extracted for a given subject — same pattern as buildEphemeralSource/buildHiddenCitySource. Strength uniformly "medium": Forgotten NY is an independent long-running local-history publication that cites period maps, historians (e.g. James Riker), archival photographs, and named secondary sources (e.g. Daniel Karatzas's "Jackson Heights: A Garden in the City") in-text, but has no formal citation/register apparatus, so capped at medium like Hidden City and Ephemeral rather than granted "high" by default. */
export function buildForgottenNySource(
  article: ForgottenNyArticle,
  claims: Claim[],
): Source {
  const id = articleId(article);
  const claimTypes = [...new Set(claims.map((c) => c.claimType))];
  const capabilities: Source["capabilities"] = claimTypes.map((claimType) => ({
    claimType,
    strength: "medium",
    notes:
      "Independent long-running local-history publication (forgotten-ny.com); cites period maps, named historians, and archival photographs in-text but has no formal citation/register apparatus, so capped at medium strength, same tier as Hidden City and Ephemeral New York.",
  }));

  return {
    id: `fny-${id}`,
    title: `Forgotten New York — ${article.title}`,
    url: article.url,
    sourceClass: "local-public-history-narrative",
    publicationDate: article.publishedAt ?? undefined,
    capabilities,
  };
}
