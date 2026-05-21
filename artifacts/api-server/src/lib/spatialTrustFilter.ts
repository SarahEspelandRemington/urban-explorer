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
 * Matches an explicit numbered street address (including address ranges) in a
 * place's NAME — e.g., "3408–10 Spruce Street", "3408 Spruce St",
 * "610 8th Ave", "610 8th Avenue".
 *
 * This is distinct from SPECIFIC_LOC_TEXT_RE (which covers named-street
 * references without a leading house number and does not cover abbreviated
 * street types like "St" or "Ave"). A place whose identity-name contains a
 * specific numbered address is asserting an unverifiable pinpoint location
 * regardless of coordSource. The leading house number must be at least 3
 * digits to avoid false matches on ordinals ("22nd century"), years embedded
 * in prose, or short room/unit numbers.
 *
 * The optional range group (?:[-–—]\d{1,4})? handles hyphenated or en-dash
 * address ranges common in row-house blocks ("3408–10", "210-12").
 */
export const ADDRESS_RANGE_RE =
  /\b\d{3,5}(?:[-–—]\d{1,4})?\s+[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]+)?\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Parkway|Pkwy|Place|Pl|Court|Ct|Alley)\b/;

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
 * Matches precise-but-unverified location claims in prose:
 * - "intersection of 34th and Walnut"
 * - "34th and Walnut"
 * - "34th St and Walnut St"
 * - "3400 block Walnut Street"
 * - "near 3400 block Walnut Street"
 */
export const PRECISE_LOCATION_PROSE_RE =
  /\b(?:intersection\s+of\s+)?(?:\d+(?:st|nd|rd|th)|\d{3,5}\s+block)\s+(?:&|and)\s+[A-Z][a-zA-Z]+\b|\b\d{3,5}\s+block\s+[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Parkway|Pkwy|Place|Pl|Court|Ct|Alley)\b/i;

/**
 * Matches neighborhood/location claims that should be treated cautiously in
 * LLM-only prose when they appear alongside a far-away coordinate set.
 */
export const NAMED_NEIGHBORHOOD_RE =
  /\b(?:University City|Fairmount|Center City|West Philadelphia|South Philadelphia|Northern Liberties|Old City|Rittenhouse|Society Hill)\b/i;

/**
 * Second-pass spatial trust filter. Runs after classifyDiscovery().
 *
 * Problem: a place classified as VERIFIED_PLACE or APPROXIMATE_SITE may carry
 * an LLM-fabricated location claim in its name or summary, even when Nominatim
 * happened to set coordSource by matching a nearby address token. A place
 * named "Old Sewer Entrance Grate on West Diamond Street" or "Former Hitching
 * Post Site at 39th & Market" is asserting an unverifiable specific location
 * regardless of coordSource. These pins visually impersonate verified
 * discoveries but their precise coordinate is fabricated.
 *
 * Bias is intentionally toward over-filtering: 0 results is preferable to
 * a narrated fabrication. Density can be recovered later; trust cannot.
 *
 * Rules applied in order:
 *   1. If already INTERPRETIVE_OVERLAY: ensure spatialSuppression is set.
 *   2. If NAME contains an ordinal intersection claim (INTERSECTION_NAME_RE):
 *      downgrade to INTERPRETIVE_OVERLAY regardless of coordSource.
 *   3. If NAME contains a named-street reference (SPECIFIC_LOC_TEXT_RE):
 *      downgrade to INTERPRETIVE_OVERLAY regardless of coordSource.
 *   3.5 If NAME contains an explicit numbered address / address-range
 *      (ADDRESS_RANGE_RE): downgrade to INTERPRETIVE_OVERLAY regardless of
 *      coordSource. Extends Rule 3 to abbreviated types ("St", "Ave") and
 *      to hyphenated address ranges ("3408–10 Spruce St").
 *   4. If coordSource is absent AND summary contains a named-street ref
 *      (SPECIFIC_LOC_TEXT_RE), a precise intersection claim
 *      (PRECISE_LOCATION_PROSE_RE), or a named-neighborhood claim
 *      (NAMED_NEIGHBORHOOD_RE): downgrade to INTERPRETIVE_OVERLAY.
 *
 * Note on rule 3 vs 4: a summary mentioning a nearby street ("Located along
 * Kelly Drive…") is not a location assertion — it is a description. Only
 * LLM-only places (no Nominatim confirmation) are downgraded for summary
 * mentions. Verified places with clean names survive even if their summary
 * references a street.
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

    // Universal name checks (independent of coordSource):
    // Both the ordinal-intersection and named-street patterns are LLM
    // confabulation signatures when they appear in a place's identity name.
    // Real OSM-sourced places are never named after their cross-street or
    // described as "the X on Y Street".

    // Rule 2: Ordinal intersection claim in name.
    if (INTERSECTION_NAME_RE.test(p.name ?? "")) {
      p.discoveryClass = "INTERPRETIVE_OVERLAY";
      p.spatialSuppression = "llmCoordWithSpecificLocationText";
      continue;
    }

    // Rule 3: Named-street reference in name — e.g. "…on West Diamond Street",
    // "4101 Market Street Historical Building", "Former Ice House on 33rd St".
    // A place whose identity-name asserts a specific named street has an
    // unverifiable coordinate claim regardless of coordSource.
    if (SPECIFIC_LOC_TEXT_RE.test(p.name ?? "")) {
      p.discoveryClass = "INTERPRETIVE_OVERLAY";
      p.spatialSuppression = "llmCoordWithSpecificLocationText";
      continue;
    }

    // Rule 3.5: Explicit numbered street address (including address ranges) in
    // name — e.g. "Former Political Machine Clubhouse, 3408–10 Spruce Street",
    // "3408 Spruce St", "610 8th Ave". SPECIFIC_LOC_TEXT_RE (Rule 3) covers
    // full-form street types ("Street", "Avenue", …) but not common
    // abbreviations like "St" or "Ave". ADDRESS_RANGE_RE extends coverage to
    // abbreviated types AND to address-range notation ("3408–10"). A place
    // name that encodes a specific numbered address asserts an unverifiable
    // pinpoint location regardless of coordSource.
    if (ADDRESS_RANGE_RE.test(p.name ?? "")) {
      p.discoveryClass = "INTERPRETIVE_OVERLAY";
      p.spatialSuppression = "explicitAddressInName";
      continue;
    }

    // Rule 4: For LLM-only coordinates (coordSource absent = no Nominatim
    // confirmation), also check the summary prose for named-street references.
    // Verified places (coordSource set) with clean names are not downgraded
    // for summary mentions — a description referencing a nearby street is not
    // the same as asserting an unverifiable location in the place's name.
    if (p.coordSource !== undefined) continue;

    const summaryProse = p.summary ?? "";
    if (
      SPECIFIC_LOC_TEXT_RE.test(summaryProse) ||
      PRECISE_LOCATION_PROSE_RE.test(summaryProse) ||
      NAMED_NEIGHBORHOOD_RE.test(summaryProse)
    ) {
      p.discoveryClass = "INTERPRETIVE_OVERLAY";
      p.spatialSuppression = "llmCoordWithSpecificLocationText";
    }
  }
}
