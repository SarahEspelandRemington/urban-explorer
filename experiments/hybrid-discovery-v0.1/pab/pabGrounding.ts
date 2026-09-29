/**
 * Automated PAB → physical-place grounding. Offline/non-production,
 * experimental — see ../README.md.
 *
 * Consumes the FROZEN pabAdapter.ts/pabInterpreter.ts retrieval+
 * classification output and OSM (Overpass) data to assign a
 * ProposedIdentityType per PAB record, deterministically:
 *  - exact normalized street-address match against an OSM element
 *    (expanding both PAB's and OSM's hyphenated house-number ranges);
 *  - a scale-implausibility safeguard (building:levels >= 6) that forces
 *    otherwise-named matches to "unresolved" rather than asserting a
 *    historic PAB building survives as a modern high-rise;
 *  - a named/wikidata OSM match compared against PAB's own "Building
 *    Type:" text via a small categorical bucket mapping, to distinguish a
 *    surviving entity from a surviving building with a changed use;
 *  - an unnamed OSM building footprint at the address, with no category
 *    comparison possible;
 *  - explicit OSM demolition/former-site tags, checked only when no
 *    current-building evidence exists;
 *  - "unresolved" as the default when none of the above apply — absence
 *    of an OSM match is deliberately NOT treated as evidence of
 *    demolition (a former-site classification requires explicit tags).
 *
 * Does not use fuzzy name-text similarity for any classification.
 */
import type { PabRetrievalRecord } from "./pabAdapter";
import type { PabInterpretedRecord } from "./pabInterpreter";
import type { ProposedIdentityType } from "../types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export interface OsmElement {
  id: number;
  type: string;
  lowHouseNumber: number;
  highHouseNumber: number;
  street: string;
  tags: Record<string, string>;
}

export type PabGroundingCategory =
  | "current-entity"
  | "current-building-former-use"
  | "unnamed-current-building"
  | "former-site"
  | "unresolved";

export interface PabGroundingResult {
  category: PabGroundingCategory;
  proposedIdentityType: ProposedIdentityType;
  matchedIdentifier?: string;
  matchingSignal?: string;
  confidence: "high" | "medium" | "low" | "none";
  conflictingEvidence?: string;
  /**
   * The exact OSM element identity (`"${type}/${id}"`, e.g. "way/338306649")
   * for a matched CURRENT building/entity — structured data, never a display
   * name, never prose. This is the only field downstream claim construction
   * (run-pab-extraction.ts) may treat as a candidate production subjectId.
   *
   * Populated only for the three categories where the matched OSM element
   * IS itself the surviving, present-day entity (current-entity,
   * current-building-former-use, unnamed-current-building) — i.e. exactly
   * the element the live discover route's own Overpass fetch would also
   * surface at this address, under the same real, stable OSM id.
   *
   * Deliberately NOT populated for "former-site": that match is an OSM
   * element merely carrying demolition/former-site tags near this address,
   * not the production identity for the historic place (which, if one
   * exists at all, lives in the separate hand-curated STREETLIT_PLACES
   * registry — see streetlitPlaces.ts). Treating a former-site OSM element's
   * own id as if it were the historic place's production identity would be
   * exactly the kind of wrong-place attachment this field exists to prevent.
   */
  osmElementId?: string;
}

/** Expands a possibly-hyphenated house-number string (e.g. "2133-2135" or "2133-35") into an inclusive [low, high] range. */
function expandHouseNumberRange(
  raw: string,
): { low: number; high: number } | null {
  const m = raw.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const low = parseInt(m[1], 10);
  if (!m[2]) return { low, high: low };
  let highRaw = m[2];
  if (highRaw.length < m[1].length) {
    highRaw = m[1].slice(0, m[1].length - highRaw.length) + highRaw;
  }
  const high = parseInt(highRaw, 10);
  return { low, high: high >= low ? high : low };
}

/** Splits an address like "2133-2135 SPRING GARDEN ST" into a house-number range and a normalized street name. */
function parseAddressRange(
  address: string,
): { low: number; high: number; street: string } | null {
  const m = address.match(/^(\d[\d-]*)\s+(.*)$/);
  if (!m) return null;
  const range = expandHouseNumberRange(m[1]);
  if (!range) return null;
  return { ...range, street: normalizeStreet(m[2]) };
}

function normalizeStreet(street: string): string {
  return street
    .trim()
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\bAVENUE\b/, "AVE")
    .replace(/\bSTREET\b/, "ST")
    .replace(/\bBOULEVARD\b/, "BLVD")
    .replace(/\bPLACE\b/, "PL")
    .replace(/\bROAD\b/, "RD")
    .replace(/\bDRIVE\b/, "DR")
    .replace(/\s+/g, " ");
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

/** Fetches and normalizes OSM elements along the given street within Philadelphia. Does NOT filter by corridor bounds — callers filter matches per-record. */
export async function fetchOsmStreetIndex(
  street: string,
  city: string,
): Promise<OsmElement[]> {
  const query = `[out:json][timeout:60];
area["name"="${city}"]["admin_level"="8"]->.searchArea;
(nwr["addr:street"~"^${street}",i]["addr:housenumber"](area.searchArea););
out center tags;`;

  const data = await fetchOverpass(query);
  const elements: OsmElement[] = [];
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const housenumber = tags["addr:housenumber"];
    if (!housenumber) continue;
    const range = expandHouseNumberRange(housenumber);
    if (!range) continue;
    elements.push({
      id: el.id,
      type: el.type,
      lowHouseNumber: range.low,
      highHouseNumber: range.high,
      street: normalizeStreet(tags["addr:street"] ?? street),
      tags,
    });
  }
  return elements;
}

/** "odd"/"even" when a range's low and high bounds share parity (the normal case for a PAB or OSM house-number range on one side of a street); "mixed" when they don't (an edge case, not the expected shape for a single-side street range) — parity is never invented for a mixed range. */
function rangeParity(low: number, high: number): "odd" | "even" | "mixed" {
  const lowOdd = low % 2 === 1;
  const highOdd = high % 2 === 1;
  if (lowOdd !== highOdd) return "mixed";
  return lowOdd ? "odd" : "even";
}

function elementsAtAddress(
  index: OsmElement[],
  addr: { low: number; high: number; street: string },
): OsmElement[] {
  const addrParity = rangeParity(addr.low, addr.high);
  return index.filter((el) => {
    if (el.street !== addr.street) return false;
    if (el.lowHouseNumber > addr.high || el.highHouseNumber < addr.low)
      return false;
    // Same-side-of-street numbering: odd PAB ranges should only match odd
    // OSM house numbers and vice versa. If either side's range spans both
    // parities (an edge case for a single street-side range), don't invent
    // a parity assumption — fall back to the prior, unfiltered behavior for
    // that element rather than guessing which side of the street it's on.
    const elParity = rangeParity(el.lowHouseNumber, el.highHouseNumber);
    if (addrParity === "mixed" || elParity === "mixed") return true;
    return addrParity === elParity;
  });
}

const FORMER_SITE_TAG_KEYS = [
  "demolished:building",
  "disused:building",
  "was:building",
  "historic:destroyed",
];

function hasFormerSiteTags(el: OsmElement): boolean {
  return (
    FORMER_SITE_TAG_KEYS.some((k) => k in el.tags) || el.tags["ruins"] === "yes"
  );
}

function isScaleImplausible(el: OsmElement): boolean {
  const levels = parseFloat(el.tags["building:levels"] ?? "");
  return !isNaN(levels) && levels >= 6;
}

type CategoryBucket =
  | "residential"
  | "religious"
  | "commercial-retail"
  | "financial"
  | "institutional-medical"
  | "industrial"
  | "civic"
  | "hotel"
  | "unknown";

function bucketPabBuildingType(text: string | undefined): CategoryBucket {
  if (!text) return "unknown";
  const t = text.toLowerCase();
  if (/church|synagogue|temple|chapel|tabernacle|cathedral|parish/.test(t))
    return "religious";
  if (/hospital|clinic|sanitarium|asylum|infirmary/.test(t))
    return "institutional-medical";
  if (/bank|savings|trust/.test(t)) return "financial";
  if (/factory|mill|warehouse|plant|works|industrial/.test(t))
    return "industrial";
  if (
    /school|college|university|institute|academy|library|courthouse|fire\s?house|police|municipal|government|city hall/.test(
      t,
    )
  )
    return "civic";
  if (/hotel/.test(t)) return "hotel";
  if (/store|shop|retail|market/.test(t)) return "commercial-retail";
  if (/house|dwelling|residence|apartment|rowhouse|tenement/.test(t))
    return "residential";
  return "unknown";
}

function bucketOsmTags(tags: Record<string, string>): CategoryBucket {
  if (tags["amenity"] === "place_of_worship") return "religious";
  if (tags["amenity"] === "hospital" || tags["amenity"] === "clinic")
    return "institutional-medical";
  if (tags["amenity"] === "bank") return "financial";
  if (tags["building"] === "industrial" || tags["building"] === "warehouse")
    return "industrial";
  if (
    [
      "school",
      "university",
      "library",
      "townhall",
      "courthouse",
      "fire_station",
      "police",
    ].includes(tags["amenity"] ?? "")
  )
    return "civic";
  if (tags["amenity"] === "hotel" || tags["tourism"] === "hotel")
    return "hotel";
  if (
    tags["shop"] ||
    ["restaurant", "cafe", "bar", "fast_food"].includes(tags["amenity"] ?? "")
  )
    return "commercial-retail";
  if (
    ["residential", "house", "apartments", "terrace"].includes(
      tags["building"] ?? "",
    )
  )
    return "residential";
  return "unknown";
}

function extractPabBuildingType(plainText: string): string | undefined {
  const m = plainText.match(/Building Type:\s*\n?\s*([^\n]+)/);
  return m ? m[1].trim() : undefined;
}

function osmDisplayIdentifier(el: OsmElement): string {
  return el.tags["name"] ?? `${el.type}/${el.id}`;
}

// Generic (non-identifying) title labels PAB uses when it has no specific
// name for a record — these carry no historic identity signal to compare.
const GENERIC_TITLE_RE =
  /^(building|store|warehouse|row\s?house|house|shop|factory|apartment building)\.?$/i;

/** True when a PAB record's own title names a specific historic institution/business/place, as opposed to being just the record's own address restated (PAB's default title when it has nothing else) or a generic building-type label. Used only as a fallback identity signal when Building Type: is absent — never overrides Building Type: when present. */
function isNamedIdentityTitle(title: string, addresses: string[]): boolean {
  const t = title.trim();
  if (!t || GENERIC_TITLE_RE.test(t)) return false;
  const normTitle = normalizeStreet(t);
  return !addresses.some((a) => normalizeStreet(a) === normTitle);
}

/** Grounds one PAB record against a pre-fetched OSM street index. */
export function groundPabRecord(
  record: PabRetrievalRecord,
  interpreted: PabInterpretedRecord,
  osmIndex: OsmElement[],
): PabGroundingResult {
  const addresses = (
    record.matchedCorridorAddresses.length > 0
      ? record.matchedCorridorAddresses
      : record.addressBlock
  )
    .map(parseAddressRange)
    .filter(
      (a): a is { low: number; high: number; street: string } => a !== null,
    );

  if (addresses.length === 0) {
    return {
      category: "unresolved",
      proposedIdentityType: "unresolved",
      confidence: "none",
    };
  }

  let matches: OsmElement[] = [];
  for (const addr of addresses) {
    matches = matches.concat(elementsAtAddress(osmIndex, addr));
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
      conflictingEvidence: `Matched OSM element has building:levels=${scaleDisqualified[0].tags["building:levels"]}, implausible for the historic PAB-documented building — not treated as a survival match.`,
    };
  }

  const named = plausible.filter(
    (el) =>
      !!el.tags["name"] || !!el.tags["wikidata"] || !!el.tags["brand:wikidata"],
  );
  if (named.length > 0) {
    const el = named[0];
    const osmBucket = bucketOsmTags(el.tags);
    const pabType = extractPabBuildingType(interpreted.plainText);

    // Preferred signal: PAB's own explicit Building Type: field.
    if (pabType) {
      const pabBucket = bucketPabBuildingType(pabType);
      const differ =
        pabBucket !== "unknown" &&
        osmBucket !== "unknown" &&
        pabBucket !== osmBucket;
      if (differ) {
        return {
          category: "current-building-former-use",
          proposedIdentityType: "current-building-former-use",
          matchedIdentifier: osmDisplayIdentifier(el),
          matchingSignal: `name/wikidata tag present; PAB Building Type "${pabType}" (${pabBucket}) differs from current OSM use (${osmBucket})`,
          confidence: "medium",
          osmElementId: `${el.type}/${el.id}`,
        };
      }
      return {
        category: "current-entity",
        proposedIdentityType: "current-osm-entity",
        matchedIdentifier: osmDisplayIdentifier(el),
        matchingSignal:
          el.tags["wikidata"] || el.tags["brand:wikidata"]
            ? "exact address match + wikidata identity"
            : "exact address match + named OSM entity",
        confidence: "high",
        osmElementId: `${el.type}/${el.id}`,
      };
    }

    // Building Type: is absent. Do NOT treat a named OSM entity at this
    // address as automatically comparable/compatible by default. Fall back
    // to PAB's own record title as the historic identity signal, but only
    // when that title actually names something (not just the record's own
    // address restated, and not a generic building-type label) — and only
    // promote to current-entity on demonstrated category continuity, never
    // solely because a named OSM entity happens to occupy the address.
    if (isNamedIdentityTitle(interpreted.title, record.addressBlock)) {
      const titleBucket = bucketPabBuildingType(interpreted.title);
      if (titleBucket !== "unknown" && osmBucket !== "unknown") {
        if (titleBucket !== osmBucket) {
          return {
            category: "current-building-former-use",
            proposedIdentityType: "current-building-former-use",
            matchedIdentifier: osmDisplayIdentifier(el),
            matchingSignal: `no Building Type field; PAB title "${interpreted.title}" (${titleBucket}) differs from current OSM use (${osmBucket})`,
            confidence: "medium",
            osmElementId: `${el.type}/${el.id}`,
          };
        }
        return {
          category: "current-entity",
          proposedIdentityType: "current-osm-entity",
          matchedIdentifier: osmDisplayIdentifier(el),
          matchingSignal: `no Building Type field; PAB title "${interpreted.title}" (${titleBucket}) matches current OSM use (${osmBucket})`,
          confidence: "high",
          osmElementId: `${el.type}/${el.id}`,
        };
      }
      // Title names something, but it (or the current OSM use) can't be
      // categorized confidently enough to compare — fall through to the
      // unnamed-building/unresolved handling below rather than guessing.
    }
    // else: no Building Type, and the title is just the address/a generic
    // label restated — nothing to compare, so a named OSM entity at this
    // address is not by itself evidence this specific historic identity
    // survives. Fall through.
  }

  // No named/wikidata match usable as an identity comparison, but at least
  // one plausible unnamed building footprint at the address.
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
    // osmElementId intentionally omitted — see the field's doc comment on
    // PabGroundingResult above: this matched element is not the production
    // identity for the historic place.
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
