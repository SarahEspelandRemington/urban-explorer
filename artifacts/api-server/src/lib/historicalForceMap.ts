/**
 * Deterministic lookup from raw OSM `wikidata` / `wikipedia` tags to a
 * `historicalForce` identifier — a stable slug for a historical industry,
 * institution, or piece of infrastructure whose evidence is still visible in
 * today's city (e.g. a factory complex, a former penitentiary, a water
 * system).
 *
 * Pure, synchronous, zero external calls. Not read by any prompt, ranking,
 * filtering, or narration logic today — this is tag-attachment only, for a
 * future consuming feature to build on.
 *
 * Q-IDs and Wikipedia identifiers below are only added when verified against
 * a source already in the repo. Unverified entries are left as commented-out
 * placeholders rather than guessed — a wrong Q-ID would silently mis-tag an
 * unrelated place.
 */

import { parseWikipediaOsmTag } from "./wikipediaEnrichment";

/** Wikidata Q-ID → historicalForce identifier. */
export const WIKIDATA_HISTORICAL_FORCE_MAP: Record<string, string> = {
  // Baldwin Locomotive Works
  // TODO(sarah): verify Wikidata Q-ID — no verified ID found in repo.
  // Eastern State Penitentiary
  // TODO(sarah): verify Wikidata Q-ID — no verified ID found in repo.
  // Fairmount Water Works
  // TODO(sarah): verify Wikidata Q-ID — no verified ID found in repo.
  // Girard College
  // TODO(sarah): verify Wikidata Q-ID — no verified ID found in repo.
};

/** Wikipedia identifier ("lang:Title", matching parseWikipediaOsmTag output) → historicalForce identifier. */
export const WIKIPEDIA_HISTORICAL_FORCE_MAP: Record<string, string> = {
  // Baldwin Locomotive Works
  // TODO(sarah): verify Wikipedia identifier — no verified identifier found in repo.
  // Eastern State Penitentiary
  // TODO(sarah): verify Wikipedia identifier — no verified identifier found in repo.
  // Fairmount Water Works
  // TODO(sarah): verify Wikipedia identifier — no verified identifier found in repo.
  // Girard College
  // TODO(sarah): verify Wikipedia identifier — no verified identifier found in repo.
};

/**
 * Derive a `historicalForce` identifier from a place's raw OSM tags.
 *
 * Looks up `tags.wikidata` first, then falls back to `tags.wikipedia`
 * (parsed into the same "lang:Title" shape used elsewhere in the codebase).
 * No fuzzy matching, no name-text matching, no geographic logic — returns
 * `undefined` when neither tag has a verified entry in the maps above.
 */
export function deriveHistoricalForce(
  tags: Record<string, string>,
): string | undefined {
  const wikidata = tags.wikidata;
  if (wikidata && WIKIDATA_HISTORICAL_FORCE_MAP[wikidata]) {
    return WIKIDATA_HISTORICAL_FORCE_MAP[wikidata];
  }

  const wikipedia = tags.wikipedia;
  if (wikipedia) {
    const parsed = parseWikipediaOsmTag(wikipedia);
    if (parsed) {
      const key = `${parsed.lang}:${parsed.title}`;
      if (WIKIPEDIA_HISTORICAL_FORCE_MAP[key]) {
        return WIKIPEDIA_HISTORICAL_FORCE_MAP[key];
      }
    }
  }

  return undefined;
}
