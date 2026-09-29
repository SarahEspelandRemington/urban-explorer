/**
 * Baldwin Park narrative claim extraction — Task F Stage 2. Offline/
 * non-production, experimental — see ../README.md.
 *
 * Sentence-level, keyword/pattern-driven claim extraction from a single
 * Baldwin Park page already matched (Stage 1) to one specific PAB-grounded
 * corridor place. Every claim's supportingSpan is the exact source
 * sentence; claimText quotes that sentence directly rather than
 * paraphrasing or interpreting it, so no causal/relational meaning is
 * added beyond what the source itself states. No fuzzy/LLM extraction —
 * deterministic regex classification only, mirroring pabClaimExtractor.ts's
 * approach for the PAB side.
 *
 * Task E consolidation: the relevance-scoping/classification machinery
 * itself now lives in ../narrative/narrativeExtractor.ts (the shared core
 * both this file and hiddenCityExtractor.ts delegate to). This file keeps
 * only what is genuinely Baldwin-Park-specific: its input/output shape,
 * "Spring Garden" as this corridor's streetName config, and its exact
 * existing claim-id/sourceId/claimText templates ("bp-${slug}", "Baldwin
 * Park's page ... states about ..."). Baldwin Park uses no
 * genericTitleWordExtensions or classifierExtensions — it is the shared
 * core's unextended baseline, reproducing its pre-Task-E behavior exactly.
 * The false-positive history below (Jane Jacobs, Piasecki Helicopters,
 * Stetson/Idro, La Milagrosa) documents WHY the shared relevance logic is
 * shaped the way it is; the logic itself is no longer duplicated here.
 *
 * SENTENCE-LEVEL TARGET-PLACE RELEVANCE (added after Task F's initial run
 * surfaced two false-positive shapes): a page being the page-level dominant
 * subject for a target address (Stage 1) does not mean every sentence on
 * that page is actually about that address. Two concrete failures: (1)
 * `jane-jacobs-and-baldwin-park` name-checked "the Stetson Mansion at 1717
 * Spring Garden Street" once, as an illustrative example inside an
 * unrelated rental-statistics methodology discussion, and had no other
 * connection to 1717 anywhere else on the page; (2) `piasecki-helicopters`
 * legitimately profiles 2008 Spring Garden Street (the Pitcairn family
 * mansion) in one section, but a sentence about a different historical
 * marker at "1937 Callowhill Street," several paragraphs away in an
 * unrelated section about helicopter history generally, was still
 * attributed to 2008 Spring Garden.
 *
 * Fix: claim attribution is scoped to PARAGRAPHS, not the whole page.
 * A paragraph is target-relevant when it explicitly mentions the target
 * address (via the same address-range-overlap logic as Stage 1's matcher)
 * or an identity anchor already resolved to that place by PAB (the source-
 * supported alternate/historic identity signal — e.g. a PAB record titled
 * "Stetson Residence" makes "Stetson" an anchor, so a paragraph naming "the
 * Stetson Mansion" counts even without repeating the street address). A
 * single immediately-following paragraph also inherits relevance, but only
 * when it shows positive continuation evidence (an anaphoric reference with
 * no competing subject signal — see continuesTargetSubject below), not
 * merely by being adjacent.
 *
 * WITHIN-PARAGRAPH SENTENCE-LEVEL RELEVANCE (added after a paragraph-level
 * scope proved too coarse): a paragraph can legitimately mention the target
 * place while also containing sentences about a different building, person,
 * or general survey content. Two confirmed leaks: `stetson-mansion`'s
 * paragraph opens on Stetson/1717 context but pivots to his separate Elkins
 * Park home ("Idro"), and a later sentence about that OTHER house ("The
 * house was sold ... and razed") was still attributed to 1717; `la-
 * milagrosa-chapel`'s multi-church survey paragraph names four unrelated
 * churches before finally naming 1903 Spring Garden Street in its last
 * sentence, and the unrelated-church sentences were still attributed to
 * 1903. Fix: within a paragraph already scoped as relevant, each sentence
 * tracks its own "current subject" — see computeSentenceRelevance below —
 * so a paragraph's relevance no longer blanket-covers every sentence in it.
 */
import type { Claim, ProposedIdentityType, Source } from "../types";
import type { BaldwinParkPage } from "./baldwinParkAdapter";
import { extractNarrativeClaims } from "../narrative/narrativeExtractor";

/** This corridor's street name — the only per-source config Baldwin Park supplies to the shared narrative extraction core (see ../narrative/narrativeExtractor.ts). */
const STREET_NAME = "Spring Garden";

export interface BaldwinParkExtractionInput {
  page: BaldwinParkPage;
  placeKey: string;
  address: string;
  /** PAB's own title for this place (e.g. "Stetson Residence") — used only to derive source-supported identity anchors for paragraph relevance scoping; not otherwise used or asserted. */
  title: string;
  proposedIdentityType: ProposedIdentityType;
}

/** Extracts every recognized claim from one already-matched Baldwin Park page, all attributed to the SAME placeKey as the PAB record whose corridor address the page was matched against (the place-based join happens here, at claim-construction time — see baldwinParkMatcher.ts). Delegates the relevance-scoping/classification work to the shared narrative core (see ../narrative/narrativeExtractor.ts); only Baldwin-Park-specific config/templating lives here. */
export function extractBaldwinParkClaims(
  input: BaldwinParkExtractionInput,
): Claim[] {
  const { page, placeKey, address, title, proposedIdentityType } = input;
  return extractNarrativeClaims(
    page.plainText,
    { streetName: STREET_NAME },
    {
      placeKey,
      address,
      title,
      proposedIdentityType,
      sourceId: `bp-${page.slug}`,
      claimIdPrefix: `bp-${page.slug}`,
      buildClaimText: (sentence) =>
        `Baldwin Park's page "${page.title}" states about ${address}: "${sentence}"`,
    },
  );
}

/** One Source per Baldwin Park page, with capabilities derived from which claim types were actually extracted from it — not hand-authored per page, mirroring pabClaimExtractor.ts's chronologyCapabilityFlags pattern. Strength is uniformly "medium": an approved local-public-history-narrative source, but without PAB's formal citation/register apparatus, so never granted "high" by default. */
export function buildBaldwinParkSource(
  page: BaldwinParkPage,
  claims: Claim[],
): Source {
  const claimTypes = [...new Set(claims.map((c) => c.claimType))];
  const capabilities: Source["capabilities"] = claimTypes.map((claimType) => ({
    claimType,
    strength: "medium",
    notes:
      "Local public-history narrative source (baldwinparkphilly.org); no formal citation apparatus, so capped at medium strength.",
  }));

  return {
    id: `bp-${page.slug}`,
    title: `Baldwin Park — ${page.title || page.slug}`,
    url: page.url,
    sourceClass: "local-public-history-narrative",
    capabilities,
  };
}
