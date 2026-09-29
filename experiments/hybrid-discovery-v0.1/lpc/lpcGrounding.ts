/**
 * Automated LPC -> physical-place grounding. Offline/non-production,
 * experimental — see ../README.md.
 *
 * Deliberately reuses PAB's categorical grounding SHAPE (current-entity /
 * current-building-former-use / unnamed-current-building / former-site /
 * unresolved) but does NOT reuse pabGrounding.ts's fetchOsmStreetIndex()
 * unchanged, because that function hardcodes
 * `area["name"="${city}"]["admin_level"="8"]` — correct for Philadelphia (a
 * consolidated city-county tagged admin_level=8 in OSM) but WRONG for NYC:
 * live Overpass confirms Manhattan is tagged admin_level=7 (relation
 * 8398124, border_type=borough), and there is no OSM relation named "New
 * York City" tagged boundary=administrative at all. This is exactly the
 * kind of Philly-specific assumption the NYC portability test was meant to
 * surface — see the portability report for the full finding.
 *
 * This module sidesteps the admin-boundary-name problem entirely by using a
 * bounding-box Overpass query instead of an area-name lookup — a more
 * source-agnostic mechanism that doesn't depend on how (or whether) a given
 * city's OSM boundary relation is named/leveled.
 *
 * Also adds a second, NYC-specific deterministic identity signal PAB had no
 * equivalent for: an exact BIN (Building Identification Number) match
 * against OSM's own `nycdoitt:bin` tag (present on many NYC building
 * footprints imported from the city's own DOITT building-footprint data).
 * A BIN match is preferred over address matching when available — it is
 * less ambiguous than parsing/normalizing street-name text. Per the task
 * brief, this module does NOT add fuzzy address matching to increase yield.
 */
import type { ProposedIdentityType } from "../types";
import type { LpcRetrievalRecord } from "./lpcAdapter";
import type { LpcInterpretedRecord } from "./lpcClaimExtractor";
import type { LpcCorridorBbox } from "./lpcAdapter";
import { normalizeStreet, parseAddress } from "../shared/nycAddress";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export interface LpcOsmElement {
  id: number;
  type: string;
  housenumber?: string;
  street?: string;
  bin?: string;
  tags: Record<string, string>;
}

export type LpcGroundingCategory =
  | "current-entity"
  | "current-building-former-use"
  | "unnamed-current-building"
  | "former-site"
  | "unresolved";

export interface LpcGroundingResult {
  category: LpcGroundingCategory;
  proposedIdentityType: ProposedIdentityType;
  matchedIdentifier?: string;
  matchingSignal?: string;
  confidence: "high" | "medium" | "low" | "none";
  conflictingEvidence?: string;
  /** See PabGroundingResult.osmElementId's doc comment in pab/pabGrounding.ts — same rule applies here: only set for a matched CURRENT building/entity, never for a former-site match. */
  osmElementId?: string;
}

async function fetchOverpass(query: string, retries = 2): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
        "User-Agent": "streetlit-experimental-harness/0.1",
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
        );
    }
  }
}

/** Fetches and normalizes every addressed OSM element within the given bbox. Bbox-based, not area-name-based — see module doc comment for why. */
export async function fetchOsmBboxIndex(
  bbox: LpcCorridorBbox,
): Promise<LpcOsmElement[]> {
  const query = `[out:json][timeout:90];
nwr["addr:housenumber"](${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
out center tags;`;
  const data = await fetchOverpass(query);
  const elements: LpcOsmElement[] = [];
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    elements.push({
      id: el.id,
      type: el.type,
      housenumber: tags["addr:housenumber"],
      street: tags["addr:street"]
        ? normalizeStreet(tags["addr:street"])
        : undefined,
      bin: tags["nycdoitt:bin"] ?? tags["ref:bin"],
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

/** Grounds one LPC record against a pre-fetched bbox OSM index. Prefers an exact BIN match (unambiguous NYC-specific identity evidence); falls back to exact address matching. Never falls back to fuzzy text similarity. */
export function groundLpcRecord(
  record: LpcRetrievalRecord,
  _interpreted: LpcInterpretedRecord,
  osmIndex: LpcOsmElement[],
): LpcGroundingResult {
  let matches: LpcOsmElement[] = [];
  let matchingBasis: "bin" | "address" | undefined;

  if (record.bin) {
    const binMatches = osmIndex.filter((el) => el.bin === record.bin);
    if (binMatches.length > 0) {
      matches = binMatches;
      matchingBasis = "bin";
    }
  }

  if (matches.length === 0 && record.address) {
    const addr = parseAddress(record.address);
    if (addr) {
      const addressMatches = osmIndex.filter(
        (el) =>
          el.housenumber === addr.housenumber && el.street === addr.street,
      );
      if (addressMatches.length > 0) {
        matches = addressMatches;
        matchingBasis = "address";
      }
    }
  }

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
      conflictingEvidence: `Matched OSM element has building:levels=${scaleDisqualified[0].tags["building:levels"]}, implausible for the historic LPC-documented building — not treated as a survival match.`,
    };
  }

  const named = plausible.filter(
    (el) =>
      !!el.tags["name"] || !!el.tags["wikidata"] || !!el.tags["brand:wikidata"],
  );
  if (named.length > 0) {
    const el = named[0];
    const basisLabel =
      matchingBasis === "bin" ? "exact BIN match" : "exact address match";
    return {
      category: "current-entity",
      proposedIdentityType: "current-osm-entity",
      matchedIdentifier: osmDisplayIdentifier(el),
      matchingSignal:
        el.tags["wikidata"] || el.tags["brand:wikidata"]
          ? `${basisLabel} + wikidata identity`
          : `${basisLabel} + named OSM entity`,
      confidence: "high",
      osmElementId: `${el.type}/${el.id}`,
    };
  }

  const unnamed = plausible.find((el) => el.tags["building"]);
  if (unnamed) {
    const basisLabel =
      matchingBasis === "bin" ? "exact BIN match" : "exact address match";
    return {
      category: "unnamed-current-building",
      proposedIdentityType: "unnamed-current-building",
      matchedIdentifier: `${unnamed.type}/${unnamed.id}`,
      matchingSignal: `${basisLabel} to an unnamed OSM building footprint`,
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
