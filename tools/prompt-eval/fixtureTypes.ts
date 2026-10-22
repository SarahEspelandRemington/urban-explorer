/**
 * Fixture shape for tools/prompt-eval (Task M, Phase 4).
 *
 * A fixture freezes every input the production payload shaper
 * (formatCandidateForCopyGen, invoked inside buildCopyGenRequest) reads:
 * candidate order/tags/trust-level-bearing fields, the already-selected
 * Wikipedia text for each candidate (never re-selected here — no live
 * OSM/Wikipedia calls happen in this tool), and any curated text (curated
 * evidence itself is looked up by osmId from the real curatedLocalHistory
 * registry inside formatCandidateForCopyGen, so a fixture only needs to
 * supply a real, registered osmId to exercise that path — see
 * fixtures/example-curated.json).
 *
 * Plain JSON on disk; loadFixture.ts converts the Map/Set-shaped fields
 * (wiki, selectorEnhancedWikiContent, selectorSingleUnitOsmIds) into the
 * exact shapes buildCopyGenRequest's CopyGenRequestParams expects.
 */
import type { CopyGenCandidateInput } from "../../artifacts/api-server/src/lib/copyGenRequestBuilder";

export interface EvalFixtureWikiEntry {
  title: string;
  extract: string;
  lang: string;
}

export interface EvalFixture {
  /** Human-readable fixture name, used in result filenames/records. */
  name: string;
  locationHint: string;
  candidates: CopyGenCandidateInput[];
  /** osmId -> frozen Wikipedia summary (or null), keyed exactly like wikiMap. */
  wiki?: Record<string, EvalFixtureWikiEntry | null>;
  /** osmId -> frozen A3-selector evidence text. */
  selectorEnhancedWikiContent?: Record<string, string>;
  /** osmIds whose selectorEnhancedWikiContent is a single sentence-level unit. */
  selectorSingleUnitOsmIds?: string[];
}
