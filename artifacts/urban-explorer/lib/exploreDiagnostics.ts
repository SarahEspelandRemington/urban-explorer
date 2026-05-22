/**
 * Types and pure helpers for the Explore / Plan-a-Walk debug overlay.
 *
 * Unlike walkDiagnostics.ts, there is no pub-sub singleton here — Explore
 * state is already managed in React state, so the overlay receives a snapshot
 * as props on each render. This module only provides shared types and the
 * spatial-warning helper used to flag coord/address disagreements.
 *
 * No PII wrappers needed: the data shown is what the user already sees.
 * Both overlays are gated behind a dev-only toggle.
 */

export type ExploreSourceMode = "gps" | "manual" | "map-pan";

export interface ExploreDebugPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  distFromCenter: number;
  distFromUser: number | null;
  autoNarrationBlocked?: boolean;
  addressCoherenceStatus?: string;
  confidence?: string;
  coordSource?: string;
  discoveryClass?: string;
  /** Spatial trust rejection reason set by applyLlmPrecisionFilter. Present
   *  on every INTERPRETIVE_OVERLAY place; also set on places downgraded from
   *  VERIFIED_PLACE/APPROXIMATE_SITE due to LLM-only coords + street claim. */
  spatialSuppression?: string;
}

export interface ExploreSnapshot {
  ts: number;
  mode: ExploreSourceMode;
  userGps: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null;
  searchCenter: { latitude: number; longitude: number };
  mapCenter: { latitude: number; longitude: number } | null;
  searchRadius: number;
  areaName: string;
  /** Source of the area name: "nominatim" = Nominatim reverse-geocode of the
   *  actual search-centre coordinates, "fallback" = Nominatim failed/timed out
   *  (label is "Nearby"), "unknown" = pre-fix server version (label came from
   *  LLM response and may not match the search coordinates). */
  areaNameSrc: string;
  totalPlaces: number;
  topPlaces: ExploreDebugPlace[];
  selectedPlace: ExploreDebugPlace | null;
  spatialWarnings: string[];
}

export interface PlanDebugPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  distanceMeters?: number;
  autoNarrationBlocked?: boolean;
  addressCoherenceStatus?: string;
}

export interface PlanSnapshot {
  startCoords: { latitude: number; longitude: number };
  endCoords: { latitude: number; longitude: number };
  geometryPoints: number;
  corridorMeters: number;
  places: PlanDebugPlace[];
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function toExploreDebugPlace(
  place: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    address?: string;
    autoNarrationBlocked?: boolean;
    addressCoherence?: { status: string };
    confidence?: string;
    coordSource?: string;
    discoveryClass?: string;
    spatialSuppression?: string;
  },
  searchCenter: { latitude: number; longitude: number },
  userGps: { latitude: number; longitude: number } | null,
): ExploreDebugPlace {
  return {
    id: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    address: place.address,
    distFromCenter: haversineMeters(
      searchCenter.latitude,
      searchCenter.longitude,
      place.latitude,
      place.longitude,
    ),
    distFromUser: userGps
      ? haversineMeters(
          userGps.latitude,
          userGps.longitude,
          place.latitude,
          place.longitude,
        )
      : null,
    autoNarrationBlocked: place.autoNarrationBlocked,
    addressCoherenceStatus: place.addressCoherence?.status,
    confidence: place.confidence,
    coordSource: place.coordSource,
    discoveryClass: place.discoveryClass,
    spatialSuppression: place.spatialSuppression,
  };
}

/**
 * Returns zero or more human-readable warning strings for a place that may
 * have a spatial mismatch. Warnings are debug-only; they never block results.
 */
export function computeSpatialWarnings(
  place: ExploreDebugPlace,
  searchRadius: number,
): string[] {
  const warnings: string[] = [];

  if (place.distFromCenter > searchRadius + 200) {
    warnings.push(
      `marker ${Math.round(place.distFromCenter)}m from search center (radius ${searchRadius}m)`,
    );
  }

  if (place.distFromUser !== null && place.distFromUser > 3000) {
    warnings.push(
      `marker ${(place.distFromUser / 1000).toFixed(1)}km from user GPS`,
    );
  }

  if (place.autoNarrationBlocked) {
    warnings.push("autoNarrationBlocked — address coherence mismatch");
  }

  if (place.spatialSuppression === "llmCoordWithSpecificLocationText") {
    warnings.push(
      "llmCoordWithSpecificLocationText — LLM-only coord with named-street claim; downgraded to interpretive overlay",
    );
  } else if (place.discoveryClass === "INTERPRETIVE_OVERLAY") {
    warnings.push("interpretive overlay — no pinpointable coordinate");
  }

  if (
    place.addressCoherenceStatus &&
    place.addressCoherenceStatus !== "ok" &&
    place.addressCoherenceStatus !== "geocode_failed"
  ) {
    warnings.push(`addressCoherence: ${place.addressCoherenceStatus}`);
  }

  // Heuristic: address has a house-number pattern (e.g. "37th Street") but the
  // marker is near the edge of the search radius — flag for manual inspection.
  if (
    place.address &&
    /\b\d{1,5}(st|nd|rd|th)?\s+[A-Za-z]/.test(place.address) &&
    place.distFromCenter > searchRadius * 0.75 + 100
  ) {
    warnings.push(
      `address has street ref but marker is ${Math.round(place.distFromCenter)}m from center`,
    );
  }

  return warnings;
}
