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
