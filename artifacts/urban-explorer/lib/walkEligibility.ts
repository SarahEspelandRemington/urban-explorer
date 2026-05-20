/**
 * Walk Mode auto-narration eligibility filter.
 *
 * Pure function — no React, no refs, no side effects — so it can be unit
 * tested without the full WalkModeContext. Given a candidate pool plus the
 * user's current location/heading state, returns the eligible subset along
 * with reason-tagged rejections so the debug overlay can show *why* each
 * candidate did or didn't make the cut.
 *
 * IMPORTANT: This file is intentionally kept independent of WalkModeContext
 * so changes here cannot accidentally regress the GPS tick path.
 */

export type EligibilityReason =
  | "ok"
  | "narrated"
  | "tooFar"
  | "behind90"
  | "lowScore"
  | "addressMismatch"
  | "interpretiveOverlay"
  | "passed"
  | "stale";

export interface EligibilityCandidate {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  netScore?: number;
  address?: string;
  /** Optional client-side coherence: if the place was tagged with a verified
   *  geocoded address coordinate that disagrees with `latitude`/`longitude`
   *  by more than 200 m, the eligibility filter rejects it as a phantom. */
  addressLat?: number;
  addressLon?: number;
  /** Server-side strong-evidence address↔coordinate mismatch. When true the
   *  place is rejected from auto-narration with reason `addressMismatch`,
   *  but the place itself remains in the pool (still shown on the map). */
  autoNarrationBlocked?: boolean;
  /** Server-side spatial trust classification. INTERPRETIVE_OVERLAY places are
   *  permanently ineligible for auto-narration regardless of distance or score.
   *  They remain visible as map pins with subdued opacity. */
  discoveryClass?: string;
}

export interface EligibilityState {
  loc: { latitude: number; longitude: number };
  /** Heading in degrees, or null if no heading source is available. */
  heading: number | null;
  /** Whether the velocity-derived heading is fresh enough to apply the hard
   *  90° gate. When false, the hard gate is skipped and only the soft penalty
   *  applies (matches existing pickNext semantics). */
  velocityHeadingFresh: boolean;
  narratedIds: Map<string, number>;
  /** Per-density configuration. */
  cfg: {
    maxQueueDistance: number;
    netScoreFloor: number;
  };
  /** Optional "passed" tracking. A place is rejected as "passed" if it was
   *  observed within `passedRadius` of the user within the last
   *  `passedWindowMs`, AND the user has now moved more than
   *  `passedExitRadius` away from it. */
  passedTracker?: {
    /** Map of placeId -> earliest timestamp the user was within passedRadius. */
    seenWithinRadius: Map<string, number>;
    passedRadius: number; // m
    passedExitRadius: number; // m
    passedWindowMs: number;
  };
  /** Address coherence tolerance in metres. Default 200. */
  addressCoherenceMeters?: number;
}

export interface EligibilityResult {
  /** Place IDs that passed all filters, in input order. */
  eligibleIds: string[];
  /** All candidates with their reason; "ok" means eligible. */
  evaluations: Array<{
    id: string;
    name: string;
    distance: number;
    bearingDiff: number | null;
    reason: EligibilityReason;
  }>;
}

const DEG = Math.PI / 180;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function angularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function evaluateEligibility(
  pool: readonly EligibilityCandidate[],
  state: EligibilityState,
): EligibilityResult {
  const { loc, heading, velocityHeadingFresh, narratedIds, cfg } = state;
  const passed = state.passedTracker;
  const tol = state.addressCoherenceMeters ?? 200;

  const evaluations: EligibilityResult["evaluations"] = [];
  const eligibleIds: string[] = [];

  for (const p of pool) {
    const dist = haversineMeters(
      loc.latitude,
      loc.longitude,
      p.latitude,
      p.longitude,
    );
    const diff =
      heading !== null
        ? angularDiff(
            heading,
            bearingDeg(loc.latitude, loc.longitude, p.latitude, p.longitude),
          )
        : null;

    let reason: EligibilityReason = "ok";

    if (p.discoveryClass === "INTERPRETIVE_OVERLAY") {
      // Interpretive overlays are permanently ineligible for auto-narration.
      // They represent inferred area-level phenomena (buried waterways,
      // corridors, etc.) or LLM-only coordinates with specific location claims
      // that cannot be pinpointed. They stay visible on the map (not filtered
      // from the pool) but are never chosen for narration.
      reason = "interpretiveOverlay";
    } else if (narratedIds.has(p.id)) {
      reason = "narrated";
    } else if (p.autoNarrationBlocked) {
      // Server-side strong-evidence mismatch — block auto-narration but keep
      // the place in the pool so it still shows on the map.
      reason = "addressMismatch";
    } else if (dist > cfg.maxQueueDistance) {
      reason = "tooFar";
    } else if ((p.netScore ?? 0) < cfg.netScoreFloor) {
      reason = "lowScore";
    } else if (
      typeof p.addressLat === "number" &&
      typeof p.addressLon === "number" &&
      haversineMeters(p.latitude, p.longitude, p.addressLat, p.addressLon) > tol
    ) {
      reason = "addressMismatch";
    } else if (
      passed &&
      passed.seenWithinRadius.has(p.id) &&
      dist > passed.passedExitRadius &&
      Date.now() - (passed.seenWithinRadius.get(p.id) ?? 0) <
        passed.passedWindowMs
    ) {
      reason = "passed";
    } else if (diff !== null && velocityHeadingFresh && diff > 90) {
      reason = "behind90";
    }

    evaluations.push({
      id: p.id,
      name: p.name,
      distance: dist,
      bearingDiff: diff,
      reason,
    });
    if (reason === "ok") eligibleIds.push(p.id);
  }

  return { eligibleIds, evaluations };
}

/**
 * Update the passedTracker as a new GPS sample arrives. Records the first
 * time each place was observed within `passedRadius` of the user during the
 * current sliding window. Old entries (> passedWindowMs) are pruned.
 */
export function updatePassedTracker(
  tracker: NonNullable<EligibilityState["passedTracker"]>,
  loc: { latitude: number; longitude: number },
  pool: readonly EligibilityCandidate[],
  now: number = Date.now(),
): void {
  for (const p of pool) {
    const d = haversineMeters(
      loc.latitude,
      loc.longitude,
      p.latitude,
      p.longitude,
    );
    if (d <= tracker.passedRadius && !tracker.seenWithinRadius.has(p.id)) {
      tracker.seenWithinRadius.set(p.id, now);
    }
  }
  for (const [id, ts] of tracker.seenWithinRadius.entries()) {
    if (now - ts > tracker.passedWindowMs) {
      tracker.seenWithinRadius.delete(id);
    }
  }
}
