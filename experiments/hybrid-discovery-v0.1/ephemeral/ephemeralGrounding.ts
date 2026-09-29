/**
 * Automated Ephemeral New York -> physical-place grounding. Offline/
 * non-production, experimental — see ../README.md.
 *
 * Reuses the exact bbox-based Overpass retrieval mechanism already proven
 * portable in lpc/lpcGrounding.ts (`fetchOsmBboxIndex`, imported unchanged
 * — same corridor, same mechanism, second source adapter). This module adds
 * only the address-matching + categorical-grounding logic Ephemeral itself
 * needs: unlike LPC's structured Socrata dataset, an ordinary narrative
 * blog carries no BIN or other NYC-DOITT identifier, so LPC's BIN-preferred
 * matching tier does not apply here — grounding is address-only. The
 * category shape (current-entity / unnamed-current-building / former-site /
 * unresolved) and the scale-implausibility safeguard are otherwise the same
 * as lpcGrounding.ts's, confirming that shape (not just the fetch
 * mechanism) also generalizes to a narrative source.
 */
import type { ProposedIdentityType } from "../types";
import { fetchOsmBboxIndex, type LpcOsmElement } from "../lpc/lpcGrounding";
import { W38_W53_CORRIDOR_BBOX, type LpcCorridorBbox } from "../lpc/lpcAdapter";
import { parseAddress } from "../shared/nycAddress";

export { fetchOsmBboxIndex, W38_W53_CORRIDOR_BBOX };
export type { LpcOsmElement, LpcCorridorBbox };

export type EphemeralGroundingCategory =
  | "current-entity"
  | "unnamed-current-building"
  | "former-site"
  | "unresolved";

export interface EphemeralGroundingResult {
  category: EphemeralGroundingCategory;
  proposedIdentityType: ProposedIdentityType;
  matchedIdentifier?: string;
  matchingSignal?: string;
  confidence: "high" | "medium" | "low" | "none";
  conflictingEvidence?: string;
  /** See PabGroundingResult.osmElementId's doc in pab/pabGrounding.ts — same rule: only set for a matched CURRENT building/entity, never a former-site match, and never fabricated when no address is available (e.g. a line/area-shaped claim with no fixed address — see run-ephemeral-production-proof.ts's Ninth Avenue El case). */
  osmElementId?: string;
}

const FORMER_SITE_TAG_KEYS = [
  "demolished:building",
  "disused:building",
  "was:building",
  "historic:destroyed",
];
function hasFormerSiteTags(el: LpcOsmElement): boolean {
  return (
    FORMER_SITE_TAG_KEYS.some((k) => k in el.tags) || el.tags["ruins"] === "yes"
  );
}

function isScaleImplausible(el: LpcOsmElement): boolean {
  const levels = parseFloat(el.tags["building:levels"] ?? "");
  return !isNaN(levels) && levels >= 6;
}

function osmDisplayIdentifier(el: LpcOsmElement): string {
  return el.tags["name"] ?? `${el.type}/${el.id}`;
}

/**
 * Grounds one Ephemeral-claimed address against a pre-fetched bbox OSM
 * index. Address-only (no BIN — Ephemeral is a narrative blog, not a
 * structured NYC dataset). Never falls back to fuzzy text similarity. Pass
 * `null`/empty when the claim has no fixed address at all (a genuinely
 * line/area-shaped claim, e.g. a vanished elevated railway spanning an
 * entire avenue) — this deliberately returns "unresolved" rather than
 * guessing a nearby point.
 */
export function groundEphemeralAddress(
  address: string | null | undefined,
  osmIndex: LpcOsmElement[],
): EphemeralGroundingResult {
  const addr = address ? parseAddress(address) : null;
  if (!addr) {
    return {
      category: "unresolved",
      proposedIdentityType: "unresolved",
      confidence: "none",
    };
  }
  const matches = osmIndex.filter(
    (el) => el.housenumber === addr.housenumber && el.street === addr.street,
  );
  if (matches.length === 0) {
    return {
      category: "unresolved",
      proposedIdentityType: "unresolved",
      confidence: "none",
    };
  }

  const scaleDisqualified = matches.filter(isScaleImplausible);
  const plausible = matches.filter((el) => !isScaleImplausible(el));
  if (plausible.length === 0 && scaleDisqualified.length > 0) {
    return {
      category: "unresolved",
      proposedIdentityType: "unresolved",
      confidence: "none",
      matchedIdentifier: osmDisplayIdentifier(scaleDisqualified[0]),
      conflictingEvidence: `Matched OSM element has building:levels=${scaleDisqualified[0].tags["building:levels"]}, implausible for the Ephemeral-documented building — not treated as a survival match.`,
    };
  }

  const named = plausible.filter(
    (el) => !!el.tags["name"] || !!el.tags["wikidata"],
  );
  if (named.length > 0) {
    const el = named[0];
    return {
      category: "current-entity",
      proposedIdentityType: "current-osm-entity",
      matchedIdentifier: osmDisplayIdentifier(el),
      matchingSignal: el.tags["wikidata"]
        ? "exact address match + wikidata identity"
        : "exact address match + named OSM entity",
      confidence: "high",
      osmElementId: `${el.type}/${el.id}`,
    };
  }

  const unnamed = plausible.find((el) => el.tags["building"]);
  if (unnamed) {
    return {
      category: "unnamed-current-building",
      proposedIdentityType: "unnamed-current-building",
      matchedIdentifier: `${unnamed.type}/${unnamed.id}`,
      matchingSignal:
        "exact address match to an unnamed OSM building footprint",
      confidence: "low",
      osmElementId: `${unnamed.type}/${unnamed.id}`,
    };
  }

  const formerSite = matches.find(hasFormerSiteTags);
  if (formerSite) {
    return {
      category: "former-site",
      proposedIdentityType: "former-site",
      matchedIdentifier: `${formerSite.type}/${formerSite.id}`,
      matchingSignal: "explicit OSM former-site/demolition tag",
      confidence: "medium",
    };
  }

  return {
    category: "unresolved",
    proposedIdentityType: "unresolved",
    confidence: "none",
  };
}
