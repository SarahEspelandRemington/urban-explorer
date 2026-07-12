/**
 * Production-eligibility filters for LLM-generated place data.
 *
 * Extracted into its own module so the pure classification and deny-list logic
 * can be unit-tested independently of the full Express route file and its
 * heavy dependencies (database, OpenAI client, etc.).
 *
 * Rules are intentionally biased toward over-filtering: 0 results is
 * preferable to a narrated fabrication. Density can be recovered; trust
 * cannot.
 */

export type DiscoveryClass =
  | "INTERPRETIVE_OVERLAY"
  | "APPROXIMATE_SITE"
  | "VERIFIED_PLACE";

/**
 * LLM category values that classify a place as INTERPRETIVE_OVERLAY
 * regardless of name/summary content.
 */
export const INTERPRETIVE_CATEGORIES = new Set([
  "waterway remnant",
  "buried waterway",
  "transportation remnant",
  "subsurface",
]);

/**
 * Text signals in name/summary/tags that indicate an interpretive rather than
 * pinpointable place.  Includes ghost signs, faded advertisements, culverts,
 * storm-drain infrastructure, and underground/subsurface language.
 */
export const INTERPRETIVE_TEXT_RE =
  /\b(buried|beneath|underground|subsurface|speakeasy|tunnel|unexcavated|oral histor(?:y|ies)|hidden.{0,6}under|corridor|invisible infrastructure|inferred|ghost waterway|filled.{0,6}(creek|canal|river)|ran beneath|flows beneath|once flowed|ghost sign|faded.{0,10}(sign|painted|ad|advertisement|mural)|painted.{0,10}advertisement|wall.{0,6}ad(vertisement)?|culvert|storm.{0,6}drain|stormwater|subterranean)\b/i;

export const APPROXIMATE_TEXT_RE =
  /\b(site of|former site|demolished|ruins? of|approximate location|once stood|formerly stood|former location)\b/i;

/**
 * Derives a `discoveryClass` for each place from signals already on the
 * object — no external API calls.  Sets `place.discoveryClass` in-place.
 *
 * Priority:
 *   INTERPRETIVE_OVERLAY  – category is a known area-phenomenon type, or
 *                           name/summary/tags contain interpretive language
 *   APPROXIMATE_SITE      – name/summary indicate a former or demolished entity
 *   VERIFIED_PLACE        – everything else (default)
 */
export function classifyDiscovery(places: any[]): void {
  for (const p of places) {
    const category: string = (p.category ?? "").toLowerCase().trim();
    const name: string = (p.name ?? "").toLowerCase();
    const summary: string = (p.summary ?? "").toLowerCase();
    const tagText: string = Array.isArray(p.tags)
      ? p.tags.join(" ").toLowerCase()
      : "";
    const combined = `${name} ${summary} ${tagText}`;

    let cls: DiscoveryClass;

    if (
      INTERPRETIVE_CATEGORIES.has(category) ||
      INTERPRETIVE_TEXT_RE.test(combined)
    ) {
      cls = "INTERPRETIVE_OVERLAY";
    } else if (APPROXIMATE_TEXT_RE.test(combined)) {
      cls = "APPROXIMATE_SITE";
    } else {
      cls = "VERIFIED_PLACE";
    }

    p.discoveryClass = cls;
  }
}

/**
 * Hard-drops places that must never reach the client in any mode.
 *
 * Removes all INTERPRETIVE_OVERLAY places: ghost signs, faded advertisements,
 * buried waterways, culverts, storm drains, subsurface and underground
 * infrastructure, and all other non-pinpointable places.
 *
 * Must be called after classifyDiscovery() so that discoveryClass is set.
 * Returns a new array; does not mutate the input array.
 */
export function filterDeniedPlaces(places: any[]): any[] {
  return places.filter((p) => p.discoveryClass !== "INTERPRETIVE_OVERLAY");
}

// ── suppressApproxDuplicates ─────────────────────────────────────────────────

/**
 * Haversine distance in metres between two WGS-84 coordinates.
 * Self-contained so productionFilter.ts has no dependency on route helpers.
 */
function approxDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Words too generic to serve as a meaningful link between two place names.
 * Words shorter than 5 characters are already excluded by significantKeywords.
 */
const APPROX_SUPPRESS_STOPWORDS = new Set([
  "house",
  "building",
  "former",
  "place",
  "block",
  "corner",
  "center",
  "centre",
  "church",
  "school",
  "market",
  "union",
  "north",
  "south",
  "east",
  "west",
  "historic",
  "historical",
  "mansion",
  "estate",
  "lodge",
  "street",
  "avenue",
  "boulevard",
  "parkway",
  "drive",
]);

/**
 * Extracts significant keywords from a place name: tokens that are at least
 * 5 characters long and not in the stopword set. Used to detect shared proper
 * nouns (family names, unique identifiers) between two place names.
 */
function significantKeywords(
  name: string,
  stopwords: Set<string>,
): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[\s\-–—,.()''""/]+/)
      .filter((w) => w.length >= 5 && !stopwords.has(w)),
  );
}

/**
 * Removes Tier-4 (metadata-only) places from an Explore response.
 *
 * Walk Mode handles Tier-4 suppression on the client via walkEligibility.ts
 * ("lowQuality"). This filter applies only to non-Walk Explore responses, on
 * the way out — after the cache has been written with the full classified set,
 * so the cache always retains the complete Tier-1–4 place list.
 *
 * See artifacts/urban-explorer/docs/discovery-ranking-rubric.md — "Suppress from auto-surface".
 *
 * Returns a new array; does not mutate the input.
 */
export function filterExploreTier4(places: any[]): any[] {
  return places.filter((p) => p.discoveryTier !== 4);
}

/**
 * OSM amenity categories that represent generic commercial functions with no
 * meaningful story under the Discovery Ranking Rubric ("generic business
 * functions" and "generic chain businesses with no meaningful story").
 * Matched case-insensitively against the place's `category` field.
 */
const GENERIC_COMMERCIAL_CATEGORIES = new Set([
  "restaurant",
  "pharmacy",
  "fuel",
  "convenience",
  "fast_food",
  "cafe",
  "supermarket",
  "atm",
  "bank",
]);

/**
 * Recognizable chain brand names that are suppressed regardless of category.
 * Covers the "generic chain businesses with no meaningful story" criterion in
 * the Discovery Ranking Rubric.
 */
const CHAIN_NAME_RE =
  /\b(cvs|walgreens|rite\s*aid|7.?eleven|sunoco|shell|bp|exxon|mobil|chevron|wawa|dunkin|starbucks|mcdonalds?|burger\s*king|subway|chipotle|dominos?|pizza\s*hut|taco\s*bell|wendy'?s|panda\s*express|chick.?fil.?a|popeyes?|kfc|arby'?s|panera|jersey\s*mike'?s|five\s*guys)\b/i;

/**
 * Removes generic commercial businesses from non-Walk Explore responses.
 *
 * Suppresses places whose `category` is a generic commercial OSM amenity type
 * (restaurant, pharmacy, fuel, etc.) OR whose `name` matches a recognizable
 * chain brand. No escape hatch — a chain pharmacy or fast-food restaurant is
 * suppressed regardless of discoveryTier.
 *
 * Walk Mode is unaffected: this filter is applied only when !walkMode, at the
 * same call site as filterExploreTier4, after setLLMCache() on fresh paths so
 * the cache retains the full unfiltered set.
 *
 * See artifacts/urban-explorer/docs/discovery-ranking-rubric.md — "Suppress from auto-surface".
 *
 * Returns a new array; does not mutate the input.
 */
export function filterGenericCommercial(places: any[]): any[] {
  return places.filter((p) => {
    const cat = (p.category ?? "").toLowerCase().trim();
    if (GENERIC_COMMERCIAL_CATEGORIES.has(cat)) return false;
    if (CHAIN_NAME_RE.test(p.name ?? "")) return false;
    return true;
  });
}

/**
 * Distinguishes, for a zero-result Explore response, whether the area was
 * genuinely empty or whether a populated candidate pool was filtered down to
 * zero by filterExploreTier4 / filterGenericCommercial. Does not identify
 * which specific filter did the reducing — only this two-way distinction.
 *
 * `rawCount` must be measured immediately before those filters run;
 * `finalCount` is the length of the places array actually being returned.
 * Returns undefined when the response is non-empty.
 */
export function computeEmptyReason(
  rawCount: number,
  finalCount: number,
): "filtered_for_quality" | "no_candidates" | undefined {
  if (finalCount > 0) return undefined;
  return rawCount > 0 ? "filtered_for_quality" : "no_candidates";
}

/**
 * Suppresses APPROXIMATE_SITE places that are LLM extrapolations derived from
 * a nearby osm_enriched VERIFIED_PLACE in the same result set.
 *
 * This targets the pattern where the LLM, seeded with an OSM + Wikipedia-
 * enriched place, invents a nearby "former site" entity whose historical
 * content is already covered by the verified place's facts array.
 *
 * A place is suppressed when ALL of the following hold:
 *   1. Its discoveryClass is APPROXIMATE_SITE.
 *   2. It does NOT itself have trustLevel "osm_enriched" (not independently
 *      OSM-backed).
 *   3. At least one significant keyword (≥5 chars, not a stopword) from its
 *      name also appears in the name of an osm_enriched VERIFIED_PLACE within
 *      `thresholdMeters`.
 *
 * Suppressed places are promoted to INTERPRETIVE_OVERLAY (with
 * spatialSuppression: "approxDuplicateOfNearbyVerified") so that the
 * subsequent filterDeniedPlaces() call removes them from the response.
 *
 * Must be called after classifyDiscovery() and applyLlmPrecisionFilter(),
 * and before filterDeniedPlaces().  Pure synchronous — no external calls.
 */
export function suppressApproxDuplicates(
  places: any[],
  thresholdMeters = 200,
): void {
  const enrichedVerified = places.filter(
    (p) =>
      p.discoveryClass === "VERIFIED_PLACE" && p.trustLevel === "osm_enriched",
  );
  if (enrichedVerified.length === 0) return;

  for (const approx of places) {
    if (approx.discoveryClass !== "APPROXIMATE_SITE") continue;
    if (approx.trustLevel === "osm_enriched") continue;

    const approxKw = significantKeywords(
      approx.name ?? "",
      APPROX_SUPPRESS_STOPWORDS,
    );
    if (approxKw.size === 0) continue;

    for (const verified of enrichedVerified) {
      const dist = approxDistanceMeters(
        approx.latitude,
        approx.longitude,
        verified.latitude,
        verified.longitude,
      );
      if (dist > thresholdMeters) continue;

      const verifiedKw = significantKeywords(
        verified.name ?? "",
        APPROX_SUPPRESS_STOPWORDS,
      );
      if ([...approxKw].some((kw) => verifiedKw.has(kw))) {
        approx.discoveryClass = "INTERPRETIVE_OVERLAY";
        approx.spatialSuppression = "approxDuplicateOfNearbyVerified";
        break;
      }
    }
  }
}
