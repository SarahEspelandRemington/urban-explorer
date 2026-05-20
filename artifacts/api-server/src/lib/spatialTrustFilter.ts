/**
 * Spatial trust filter for LLM-generated place data.
 *
 * Extracted into its own module so the pure logic can be unit-tested
 * independently of the full Express route file and its heavy dependencies.
 */

/**
 * Matches a named street reference in free-form prose — checked against the
 * place's name and summary, NOT the address field (which always contains a
 * street ref by design and would cause every place to match).
 *
 * Matches: "Walnut Street", "33rd Street", "7th Avenue", "Market Ave", etc.
 * A leading proper-noun word (or ordinal) must precede the street-type suffix.
 */
export const SPECIFIC_LOC_TEXT_RE =
  /\b(?:[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*|\d+(?:st|nd|rd|th))\s+(?:Street|Avenue|Boulevard|Blvd|Road|Drive|Lane|Way|Parkway|Place|Court|Alley)\b/;

/**
 * Matches an ordinal cross-street intersection claim in a place name — e.g.,
 * "39th & Market", "22nd and Chestnut", "at 44th & Spruce".
 *
 * Checked against the place NAME for ALL places regardless of coordSource,
 * because this naming pattern is an LLM confabulation signature: the model
 * adopts the form "Historic X at Nth & Y" while placing the pin at the user's
 * GPS rather than at the actual intersection. Even when Nominatim happens to
 * set coordSource (by matching a nearby address token rather than the asserted
 * intersection), the intersection-in-name pattern is sufficient to downgrade
 * the place. Real OSM-sourced places are never named after intersections.
 */
export const INTERSECTION_NAME_RE =
  /\b\d+(?:st|nd|rd|th)\s*(?:&|and)\s+[A-Z][a-zA-Z]+\b/;

/**
 * Second-pass spatial trust filter. Runs after classifyDiscovery().
 *
 * Problem: a place classified as VERIFIED_PLACE or APPROXIMATE_SITE may have
 * coordSource=undefined (no Nominatim confirmation — pure LLM output) while
 * its name or summary contains specific street-level location claims such as
 * "Buried Stream Under Walnut Street" or "Along 33rd Street near Market Ave".
 * Those pins visually impersonate verified discoveries even though their
 * coordinates are fabricated.
 *
 * Additionally: even places with coordSource set may carry an intersection
 * claim in their NAME (e.g. "Former Hitching Post Site at 39th & Market").
 * Nominatim may have matched a nearby address token rather than the asserted
 * intersection, leaving the pin near the user's GPS rather than at the named
 * cross-street. The intersection-in-name pattern triggers downgrade regardless
 * of coordSource status.
 *
 * Rules applied in order:
 *   1. If already INTERPRETIVE_OVERLAY: ensure spatialSuppression is set.
 *   2. If NAME contains an ordinal intersection claim (INTERSECTION_NAME_RE):
 *      downgrade to INTERPRETIVE_OVERLAY regardless of coordSource.
 *   3. If coordSource is absent AND name/summary contains a named-street ref
 *      (SPECIFIC_LOC_TEXT_RE): downgrade to INTERPRETIVE_OVERLAY.
 */
export function applyLlmPrecisionFilter(places: any[]): void {
  for (const p of places) {
    if (p.discoveryClass === "INTERPRETIVE_OVERLAY") {
      // Already the weakest classification — ensure the reason field is set.
      if (!p.spatialSuppression) {
        p.spatialSuppression = "interpretiveOverlay";
      }
      continue;
    }

    // Universal name check (independent of coordSource): a place whose NAME
    // contains an ordinal cross-street claim asserts a precise intersection
    // identity. This pattern is an LLM confabulation signature and must be
    // rejected regardless of whether Nominatim happened to verify nearby coords.
    if (INTERSECTION_NAME_RE.test(p.name ?? "")) {
      p.discoveryClass = "INTERPRETIVE_OVERLAY";
      p.spatialSuppression = "llmCoordWithSpecificLocationText";
      continue;
    }

    // For LLM-only coordinates (coordSource absent = no Nominatim confirmation;
    // the string "llm" is a client-display alias for undefined): also downgrade
    // if the name or summary contains any specific named-street reference.
    if (p.coordSource !== undefined) continue;

    const prose = `${p.name ?? ""} ${p.summary ?? ""}`;
    if (SPECIFIC_LOC_TEXT_RE.test(prose)) {
      p.discoveryClass = "INTERPRETIVE_OVERLAY";
      p.spatialSuppression = "llmCoordWithSpecificLocationText";
    }
  }
}
