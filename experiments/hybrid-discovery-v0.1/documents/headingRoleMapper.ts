/**
 * Shared, city-agnostic experimental "heading text -> coarse semantic role"
 * mapper for preservation-document sidecar blocks.
 *
 * A city adapter (e.g. philadelphiaFormNominationAdapter.ts) preserves a
 * block's source-native heading VERBATIM on `DocumentBlock.sourceNativeHeading`
 * — it must never invent or consume a shared semantic role from its own
 * city-specific vocabulary. This module is the one place that maps a
 * heading's literal text to a small, shared, OUTPUT role vocabulary that is
 * not itself tied to any one city's form wording. Today the only INPUT
 * entries are the heading strings actually observed in the one real
 * Philadelphia Historical Commission nomination form processed in this task
 * (2301 Fairmount Avenue) — a future adapter for a different city/source
 * would add its own input entries to this same table, reusing the existing
 * output roles wherever the underlying semantics genuinely coincide, adding
 * a new output role only when they don't.
 *
 * Deliberately NOT tuned for extraction yield — unrecognized heading text
 * always fails closed to "unknown", never guessed from prose content.
 *
 * Offline/non-production, experimental.
 */

export type HeadingRole =
  | "identification"
  | "property-condition"
  | "boundary"
  | "narrative-description"
  | "narrative-significance"
  | "bibliography"
  | "administrative"
  | "unknown";

/**
 * Keys are the heading's label text (everything after a leading "N. "),
 * normalized to upper-case with surrounding whitespace trimmed and interior
 * whitespace collapsed to single spaces — so "6. Description" and
 * "6. DESCRIPTION" both match the same entry.
 */
const KNOWN_HEADING_LABELS: ReadonlyMap<string, HeadingRole> = new Map([
  ["ADDRESS OF HISTORIC RESOURCE", "identification"],
  ["NAME OF HISTORIC RESOURCE", "identification"],
  ["TYPE OF HISTORIC RESOURCE", "identification"],
  ["PROPERTY INFORMATION", "property-condition"],
  ["BOUNDARY DESCRIPTION", "boundary"],
  ["DESCRIPTION", "narrative-description"],
  ["SIGNIFICANCE", "narrative-significance"],
  ["MAJOR BIBLIOGRAPHICAL REFERENCES", "bibliography"],
  ["MAJOR BIBLIOGRAPHIC REFERENCES", "bibliography"],
  ["NOMINATOR", "administrative"],
]);

function normalizeHeadingLabel(headingText: string): string {
  // Strip a leading "N. " or "N." numbering prefix, if present, then
  // collapse whitespace and upper-case for lookup.
  const withoutNumber = headingText.replace(/^\s*\d{1,2}\.\s*/, "");
  return withoutNumber.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Maps a block's verbatim source-native heading text to a coarse shared
 * role. Returns "unknown" for any heading text not already in the known
 * table — never inferred from the heading's wording or the block's prose.
 */
export function mapHeadingToRole(
  sourceNativeHeading: string | undefined,
): HeadingRole {
  if (!sourceNativeHeading) return "unknown";
  const normalized = normalizeHeadingLabel(sourceNativeHeading);
  return KNOWN_HEADING_LABELS.get(normalized) ?? "unknown";
}
