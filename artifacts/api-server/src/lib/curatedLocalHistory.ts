/**
 * Curated local-history evidence registry — Pilot A.
 *
 * A small, manually curated, osmId-keyed registry of human-vetted local-
 * history material that did not come through the Wikipedia/A3 evidence
 * path. Pure, synchronous, zero external calls — same pattern as
 * historicalForceMap.ts, but keyed on the OSM element id itself rather than
 * a Wikidata/Wikipedia identifier, and read directly by the osm-anchor
 * discover route (unlike historicalForceMap.ts, which is not wired into
 * any prompt/ranking/filtering/narration logic today).
 *
 * `source` (identity/provenance of the material) and `evidence` (the
 * specific claim, its scope, and its trust/verification signals) are kept
 * as separate nested objects deliberately — see CuratedEntry below.
 *
 * `curatedTrust` and `verificationConfidence` are independent signals and
 * must not be conflated:
 *   - `curatedTrust` reflects Streetlit's own editorial confidence in the
 *     material as a discovery-worthy story (was this vetted and selected
 *     through Streetlit's editorial process?).
 *   - `verificationConfidence` reflects evidentiary/citation strength (how
 *     strongly is this backed by an externally checkable source?).
 * A story can be editorially trusted while still lacking a linked external
 * citation, and vice versa — that is exactly the distinction these two
 * fields exist to preserve. Neither field derives from, overrides, or is
 * written back to OSM-derived `trustLevel` (see osmTrustLevel.ts, which
 * this module does not import or modify).
 */

export interface CuratedSource {
  /** Title/identity of the source material. */
  title: string;
  /** URL or other reference, when one exists. Omit if none is linked yet. */
  url?: string;
  /** What kind of source this is (e.g. "internal editorial reference"). */
  sourceType: string;
  /** Usage/rights note — what this material may currently be used for. */
  usageNote: string;
  /** Publication/date information, when available. */
  publicationDate?: string;
}

export type VerificationStatus = "approved" | "pending" | "rejected";
export type TrustSignal = "high" | "medium" | "low";

export interface CuratedEvidence {
  osmId: string;
  /** Human-selected evidence text — not LLM-selected, not A3 output. */
  text: string;
  /** What factual claim(s) this evidence governs, in the copy-gen prompt. */
  claimScope: string;
  verificationStatus: VerificationStatus;
  verificationConfidence: TrustSignal;
  /** Independent of OSM trustLevel — see module doc comment above. */
  curatedTrust: TrustSignal;
  /** Date of the last editorial verification pass over this entry. */
  lastVerifiedDate: string;
}

export interface CuratedEntry {
  source: CuratedSource;
  evidence: CuratedEvidence;
}

/**
 * Per-`curatedTrust`-tier claim-strength guidance for copy generation.
 * Analogous in pattern to OSM_COPY_RULES (osmTrustLevel.ts), but this
 * table governs a curated entry's own claim, inside its declared
 * `curatedClaimScope` only — it does not touch OSM `trustLevel` or
 * OSM_COPY_RULES, and it does not grant any license to make claims
 * outside curatedClaimScope.
 */
export const CURATED_COPY_RULES: Record<TrustSignal, string> = {
  high: "curatedTrust: high — state the claim directly and plainly within curatedClaimScope. No hedging language is needed for this specific claim.",
  medium:
    'curatedTrust: medium — state the claim within curatedClaimScope, but use light attribution/hedging language (e.g. "according to," "remembered as") rather than flat assertion.',
  low: 'curatedTrust: low — only make a soft, clearly-hedged reference to the claim within curatedClaimScope (e.g. "local accounts describe...") — do not state it as settled fact.',
};

/** osmId ("type/id", e.g. "way/250863827") -> curated entry. */
export const CURATED_LOCAL_HISTORY: Record<string, CuratedEntry> = {
  "way/250863827": {
    source: {
      title: "Green Room Philadelphia — About",
      url: "https://www.greenroomphiladelphia.com/about",
      sourceType: "first-party institutional/business history source",
      usageNote:
        "Accepted for the Green Room's own institutional history (the Pop Plumer / Cadillac Delicatessen material) — not blanket authority for broader neighborhood claims. See claimScope below for the exact boundary of what this source supports.",
    },
    evidence: {
      osmId: "way/250863827",
      text: 'During the Depression, the corner store at 1940 Green Street was run by a local grocer remembered as "Pop" Plumer — the shop later known as the Cadillac Delicatessen. Plumer fed neighbors who couldn\'t pay and extended grocery credit through hard times, and the corner became known in the neighborhood as a place of community support, not just a place of business.',
      claimScope:
        "The Depression-era community-support role of the grocer known as Pop Plumer at this corner (1940 Green Street) — feeding neighbors and extending credit — and the site's identity as the later Cadillac Delicatessen.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "high",
      lastVerifiedDate: "2026-08-22",
    },
  },
};

/**
 * Returns the curated entry for this osmId only if it exists AND is
 * approved. Used both as the gate for the narrow osm_bare copy-generation
 * exception and as the source of the curatedContent/curatedClaimScope
 * fields sent to copy generation.
 */
export function getApprovedCuratedEntry(
  osmId: string,
): CuratedEntry | undefined {
  const entry = CURATED_LOCAL_HISTORY[osmId];
  if (entry && entry.evidence.verificationStatus === "approved") {
    return entry;
  }
  return undefined;
}
