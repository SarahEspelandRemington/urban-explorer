/**
 * A5 Orientation Field v1 — landmark adjacency only.
 *
 * Deterministic, server-computed fallback for discoveries that lack a real
 * postal address (no usable `addr:*` OSM tags). When a nearby named,
 * landmark-shaped place exists within `ORIENTATION_ADJACENCY_RADIUS_METERS`,
 * we attach a static "Beside/Near {landmark}" orientation instead of leaving
 * the discovery with no locational context at all.
 *
 * Explicitly out of scope for v1 (see A5 diagnostic + product decision):
 * containment, nearest-intersection, position-along-a-way, barrier-awareness,
 * directional phrasing combining bearingDegrees with live user heading, any
 * new Overpass query, and deduplication of the same real-world landmark
 * appearing as multiple distinct OSM entities.
 *
 * Known v1 limitation: the same real-world landmark can exist as more than
 * one OSM entity (e.g. a way + a relation for the same building, or a
 * separately-named nearby entity for the same site — confirmed live for
 * Independence Hall during the A5 diagnostic). This module does not attempt
 * to deduplicate beyond whatever dedup already runs upstream on the
 * candidate pool; it will happily pick whichever qualifying entity is
 * closest/strongest — except that a candidate sharing the subject's own
 * name within the adjacency radius is treated as a duplicate representation
 * of the subject itself and excluded (see `subject.name` handling below).
 * That guard is a same-name/near-distance heuristic, not true entity
 * resolution — it does not catch a duplicate representation that happens to
 * carry a different name tag.
 *
 * Pure, synchronous, zero external calls — follows the same pattern as
 * `deriveHistoricalForce` in historicalForceMap.ts.
 */

import { bearingDegrees, haversineDistance } from "./geo";

/**
 * Adjacency radius for landmark-based orientation, in meters. Chosen from
 * the middle of the product-specified 75-100m range — close enough that
 * "Beside X" / "Near X" reads as true, far enough to tolerate normal OSM
 * node placement imprecision. Tune here if field testing suggests otherwise.
 */
export const ORIENTATION_ADJACENCY_RADIUS_METERS = 90;

/** tourism=* values strong enough to qualify a landmark on their own. */
const STRONG_TOURISM_VALUES = new Set([
  "attraction",
  "museum",
  "zoo",
  "gallery",
  "viewpoint",
  "artwork",
  "memorial",
  "monument",
]);

/** amenity=* values that make a *named* place landmark-shaped (Moderate tier). */
const MODERATE_AMENITY_VALUES = new Set([
  "place_of_worship",
  "theatre",
  "cinema",
  "arts_centre",
  "library",
  "townhall",
  "courthouse",
  "marketplace",
]);

/** leisure=* values that make a *named* place landmark-shaped (Moderate tier). */
const MODERATE_LEISURE_VALUES = new Set(["park", "garden", "nature_reserve"]);

type OrientationTier = "strong" | "moderate" | "none";

/** Minimal shape needed from a candidate to evaluate/target it as an anchor. */
export interface OrientationCandidate {
  osmId: string;
  name: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface Orientation {
  type: "landmark_adjacent";
  target: {
    name: string;
    lat: number;
    lng: number;
  };
  distanceMeters: number;
  bearingDegrees: number;
  phrase: string;
}

/**
 * Strong: wikidata or wikipedia tag, historic=*, or a tourism value from
 * STRONG_TOURISM_VALUES (a plain tourism=hotel/hostel tag does NOT qualify —
 * confirmed live during the A5 diagnostic that such tags can appear on
 * candidates matched via an unrelated Overpass clause).
 *
 * Moderate: a real name tag AND a landmark-shaped amenity/leisure category,
 * without any of the stronger signals above. Deliberately narrow — excludes
 * banks, bars, restaurants, hotels, and fitness studios even when named,
 * consistent with the product's "avoid generic business descriptions" rule.
 */
function tierOf(candidate: OrientationCandidate): OrientationTier {
  const tags = candidate.tags;

  if (tags.wikidata || tags.wikipedia || tags.historic) {
    return "strong";
  }
  if (tags.tourism && STRONG_TOURISM_VALUES.has(tags.tourism)) {
    return "strong";
  }

  const hasRealName = candidate.name.trim().length > 0;
  if (
    hasRealName &&
    ((tags.amenity && MODERATE_AMENITY_VALUES.has(tags.amenity)) ||
      (tags.leisure && MODERATE_LEISURE_VALUES.has(tags.leisure)))
  ) {
    return "moderate";
  }

  return "none";
}

/** Static, deterministic v1 phrase — not LLM-generated. */
function phraseFor(name: string, distanceMeters: number): string {
  return distanceMeters <= 40 ? `Beside ${name}` : `Near ${name}`;
}

/**
 * Compute an `orientation` fallback for `subject` from `candidates`, or
 * `undefined` if `subject` already has a real address or no qualifying
 * landmark is within range.
 *
 * Selection: among candidates within ORIENTATION_ADJACENCY_RADIUS_METERS
 * that are Strong or Moderate tier (and not the subject itself), prefer
 * Strong over Moderate; within the same tier, prefer the closer one.
 */
export function computeOrientation(
  subject: {
    osmId: string;
    name: string;
    lat: number;
    lon: number;
    address: string | undefined;
  },
  candidates: OrientationCandidate[],
): Orientation | undefined {
  if (subject.address) {
    return undefined;
  }

  const subjectName = subject.name.trim().toLowerCase();

  let best:
    | {
        candidate: OrientationCandidate;
        tier: OrientationTier;
        distance: number;
      }
    | undefined;

  for (const candidate of candidates) {
    // Exclude the subject itself, and any candidate that is a duplicate OSM
    // representation of the subject (same name, within adjacency range) —
    // both must be excluded before tiering, not filtered out of `best`
    // after the fact.
    if (candidate.osmId === subject.osmId) continue;
    if (subjectName && candidate.name.trim().toLowerCase() === subjectName) {
      continue;
    }

    const distance = haversineDistance(
      subject.lat,
      subject.lon,
      candidate.lat,
      candidate.lon,
    );
    if (distance > ORIENTATION_ADJACENCY_RADIUS_METERS) continue;

    const tier = tierOf(candidate);
    if (tier === "none") continue;

    if (
      !best ||
      (tier === "strong" && best.tier === "moderate") ||
      (tier === best.tier && distance < best.distance)
    ) {
      best = { candidate, tier, distance };
    }
  }

  if (!best) return undefined;

  const distanceMeters = Math.round(best.distance);
  return {
    type: "landmark_adjacent",
    target: {
      name: best.candidate.name,
      lat: best.candidate.lat,
      lng: best.candidate.lon,
    },
    distanceMeters,
    bearingDegrees: Math.round(
      bearingDegrees(
        subject.lat,
        subject.lon,
        best.candidate.lat,
        best.candidate.lon,
      ),
    ),
    phrase: phraseFor(best.candidate.name, distanceMeters),
  };
}
