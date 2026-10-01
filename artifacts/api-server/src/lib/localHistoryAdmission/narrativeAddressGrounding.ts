/**
 * Shared address-only OSM grounding for narrative local-history sources
 * (e.g. Forgotten New York) in the Streetlit local-history admission engine.
 *
 * Promoted (faithful port, generalized) from
 * experiments/hybrid-discovery-v0.1/ephemeral/ephemeralGrounding.ts (the
 * address-only categorical-grounding logic: current-entity /
 * unnamed-current-building / former-site / unresolved, plus the
 * scale-implausibility safeguard) and the generic bbox-fetch mechanism in
 * experiments/hybrid-discovery-v0.1/lpc/lpcGrounding.ts (`fetchOsmBboxIndex`).
 * LPC's BIN-preferred matching tier (`groundLpcRecord`) is NYC-Socrata-
 * specific and deliberately NOT promoted here — an ordinary narrative source
 * carries no BIN, so grounding stays address-only, same as Ephemeral's.
 *
 * Types/functions are renamed generically (not "Lpc"/"Ephemeral"-branded)
 * since this module is now the shared grounding path for any address-only
 * narrative source, not tied to one source's naming.
 */
import type { ProposedIdentityType } from "./types";
import { normalizeStreet, parseAddress } from "./nycAddress";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export interface NarrativeBbox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface NarrativeOsmElement {
  id: number;
  type: string;
  housenumber?: string;
  street?: string;
  tags: Record<string, string>;
}

export type NarrativeGroundingCategory =
  | "current-entity"
  | "unnamed-current-building"
  | "former-site"
  | "unresolved";

export interface NarrativeGroundingResult {
  category: NarrativeGroundingCategory;
  proposedIdentityType: ProposedIdentityType;
  matchedIdentifier?: string;
  matchingSignal?: string;
  confidence: "high" | "medium" | "low" | "none";
  conflictingEvidence?: string;
  /** Only set for a matched CURRENT building/entity, never a former-site match, and never fabricated when no address is available (e.g. a line/area-shaped claim with no fixed address). */
  osmElementId?: string;
}

async function fetchOverpass(query: string, retries = 2): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
        "User-Agent": "streetlit-local-history-admission/1.0",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      if (attempt >= retries)
        throw new Error(
          `Overpass returned non-JSON after ${attempt + 1} attempts: ${text.slice(0, 200)}`,
          { cause: err },
        );
    }
  }
}

/** Fetches and normalizes every addressed OSM element within the given bbox. Bbox-based, not area-name-based (an OSM administrative-boundary relation name/level is not portable across cities). */
export async function fetchOsmBboxIndex(
  bbox: NarrativeBbox,
): Promise<NarrativeOsmElement[]> {
  const query = `[out:json][timeout:90];
nwr["addr:housenumber"](${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
out center tags;`;
  const data = await fetchOverpass(query);
  const elements: NarrativeOsmElement[] = [];
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    elements.push({
      id: el.id,
      type: el.type,
      housenumber: tags["addr:housenumber"],
      street: tags["addr:street"]
        ? normalizeStreet(tags["addr:street"])
        : undefined,
      tags,
    });
  }
  return elements;
}

const FORMER_SITE_TAG_KEYS = [
  "demolished:building",
  "disused:building",
  "was:building",
  "historic:destroyed",
];
function hasFormerSiteTags(el: NarrativeOsmElement): boolean {
  return (
    FORMER_SITE_TAG_KEYS.some((k) => k in el.tags) || el.tags["ruins"] === "yes"
  );
}

function isScaleImplausible(el: NarrativeOsmElement): boolean {
  const levels = parseFloat(el.tags["building:levels"] ?? "");
  return !isNaN(levels) && levels >= 6;
}

function osmDisplayIdentifier(el: NarrativeOsmElement): string {
  return el.tags["name"] ?? `${el.type}/${el.id}`;
}

/** A way/relation carrying a `building` tag is the building footprint itself, as distinct from a co-located point-of-interest (shop/amenity/office node) that merely shares the building's address. A node is never treated as building-like here, regardless of its tags — in this address-only match set, the physical building is always mapped as an area (way/relation), never a point. */
function isBuildingLikeStructure(el: NarrativeOsmElement): boolean {
  return (
    (el.type === "way" || el.type === "relation") &&
    !!el.tags["building"] &&
    el.tags["building"] !== "no"
  );
}

/**
 * Deterministic same-address entity-selection rule for the `named` match
 * set below. Replaces array-order-dependent "first match wins" (which let a
 * co-located tenant/POI outrank the actual building purely because Overpass
 * happened to return it first — e.g. a ground-floor restaurant node beating
 * the Film Center Building way, or a community board office node beating
 * the McGraw-Hill Building way). Uses only OSM tag/type evidence already
 * present on each element — no fuzzy string matching, no geospatial
 * heuristics, and no source- or building-specific special-casing.
 *
 * Important semantic caveat: `groundNarrativeAddress()` receives only an
 * address string and the pre-fetched OSM index — it is never given the
 * narrative source's own expected entity/Wikidata id. So a candidate's
 * `wikidata` tag is NOT a verified identity match against the narrative
 * subject; it only means "this specific OSM element is itself externally
 * identified" (e.g. a notable element, possibly even a chain restaurant's
 * own Wikidata item). This grounding path is fundamentally building/
 * place-level (see isBuildingLikeStructure, the former-site/
 * unnamed-current-building tiers below, and the >=6-level scale check — all
 * assume the target is the physical structure at the address), so
 * structural building-likeness is trusted ahead of a non-building
 * candidate's mere Wikidata presence: an unrelated, well-identified tenant
 * is still just a tenant.
 *
 * Tiers, most to least significant, highest wins:
 *   1. Building-like (isBuildingLikeStructure) AND carries `wikidata` — the
 *      strongest available evidence: a building footprint that is itself
 *      externally identified.
 *   2. Building-like only (no `wikidata`) — the common case, since most
 *      buildings carry no `wikidata` tag at all. Still outranks any
 *      non-building candidate, including one with its own `wikidata` tag,
 *      because that tag does not establish the non-building candidate as
 *      the building-level subject this function is grounding.
 *   3. Non-building candidate carrying `wikidata` — only reached when no
 *      building-like candidate exists at this address at all. Preferred
 *      over an unidentified tenant/POI as the least-bad fallback.
 *   4. Any other named, non-building candidate (name only, no `wikidata`).
 *   5. Lowest numeric OSM id — a stable, order-independent final tie-break
 *      within an otherwise-equal tier. Never the Overpass response array
 *      position, and not itself an identity resolution — just determinism
 *      when the available evidence cannot distinguish two candidates.
 */
function candidateTier(el: NarrativeOsmElement): number {
  const building = isBuildingLikeStructure(el);
  const wikidata = !!el.tags["wikidata"];
  if (building && wikidata) return 1;
  if (building) return 2;
  if (wikidata) return 3;
  return 4;
}

function pickBestNamedMatch(named: NarrativeOsmElement[]): NarrativeOsmElement {
  return named.reduce((best, candidate) => {
    const bestTier = candidateTier(best);
    const candidateTierValue = candidateTier(candidate);
    if (candidateTierValue !== bestTier) {
      return candidateTierValue < bestTier ? candidate : best;
    }
    return candidate.id < best.id ? candidate : best;
  });
}

/**
 * Grounds one narrative-source-claimed address against a pre-fetched bbox
 * OSM index. Address-only (no BIN or other structured-dataset identifier —
 * narrative sources carry no such field). Never falls back to fuzzy text
 * similarity. Pass `null`/empty when the claim has no fixed address at all
 * (a genuinely line/area-shaped claim, e.g. a vanished elevated railway
 * spanning an entire avenue) — this deliberately returns "unresolved"
 * rather than guessing a nearby point.
 */
export function groundNarrativeAddress(
  address: string | null | undefined,
  osmIndex: NarrativeOsmElement[],
): NarrativeGroundingResult {
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

  // Identity continuity takes precedence over scale: a match carrying a
  // name/wikidata tag is checked across ALL address matches BEFORE scale
  // is consulted at all. Scale-implausibility is only a suspicion signal
  // for otherwise-anonymous matches — it must never override a confirmed
  // identity match (this previously caused false-negative rejections of
  // real tall landmarked buildings, e.g. Film Center Building, Farley
  // Building).
  const named = matches.filter(
    (el) => !!el.tags["name"] || !!el.tags["wikidata"],
  );
  if (named.length > 0) {
    // Among multiple named/wikidata-tagged matches at the same address
    // (e.g. a landmark building plus its ground-floor tenants), the correct
    // entity is selected deterministically — see pickBestNamedMatch — not
    // by which element Overpass happened to return first.
    const el = pickBestNamedMatch(named);
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

  const scaleDisqualified = matches.filter(isScaleImplausible);
  const plausible = matches.filter((el) => !isScaleImplausible(el));
  if (plausible.length === 0 && scaleDisqualified.length > 0) {
    return {
      category: "unresolved",
      proposedIdentityType: "unresolved",
      confidence: "none",
      matchedIdentifier: osmDisplayIdentifier(scaleDisqualified[0]),
      conflictingEvidence: `Matched OSM element has building:levels=${scaleDisqualified[0].tags["building:levels"]}, implausible for the documented building — not treated as a survival match.`,
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
