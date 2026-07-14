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
  | "lowQuality"
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
  /** Free-text description used as a fallback when discoveryClass is absent
   *  (e.g. places loaded from an AsyncStorage cache written before the server
   *  started classifying). Checked against INTERPRETIVE_FALLBACK_RE when
   *  discoveryClass is undefined. */
  summary?: string;
  /** LLM-assigned category string. Checked against
   *  INTERPRETIVE_FALLBACK_CATEGORIES when discoveryClass is undefined. */
  category?: string;
  /** OSM element reference (e.g. 'node/12345678'). Display-only — never
   *  read by eligibility logic. Present on Walk Mode OSM-anchor discoveries. */
  osmId?: string;
  /** How this place's location was established. Display-only — never read
   *  by eligibility logic. */
  candidateSource?: "osm" | "llm";
  /** Server-assigned discovery quality tier (1–4). When 4, the place is
   *  metadata-only (no historical depth) and is suppressed from auto-narration
   *  with reason `lowQuality`. Absent when the classifier was not confident. */
  discoveryTier?: number;
  /** Server-assigned rejection reason for Tier-4 places (e.g. "metadataOnly",
   *  "noHistoricalDepth", "genericBusinessDescription"). Display-only — never
   *  read by eligibility logic beyond the presence of `discoveryTier === 4`. */
  discoveryRejectionReason?: string;
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
    /** Populated when reason === "lowQuality". Mirrors
     *  `EligibilityCandidate.discoveryRejectionReason` so callers
     *  (debug overlay, diagnostics) don't need to re-look up the place. */
    discoveryRejectionReason?: string;
  }>;
}

/**
 * Compact fallback patterns that mirror the server-side INTERPRETIVE_TEXT_RE.
 * Applied when a place has no discoveryClass set (e.g. loaded from an
 * AsyncStorage cache written before the server started classifying places).
 * Keeps Walk Mode safe against old cache entries that pre-date the filter.
 */
const INTERPRETIVE_FALLBACK_RE =
  /\b(buried|beneath|underground|subsurface|speakeasy|tunnel|unexcavated|oral histor(?:y|ies)|hidden.{0,6}under|ghost waterway|ghost sign|once flowed|ran beneath|flows beneath|faded.{0,10}(sign|painted|ad)|culvert|storm.{0,6}drain|stormwater|subterranean)\b/i;

const INTERPRETIVE_FALLBACK_CATEGORIES = new Set([
  "waterway remnant",
  "buried waterway",
  "transportation remnant",
  "subsurface",
]);

function looksInterpretive(p: EligibilityCandidate): boolean {
  const cat = (p.category ?? "").toLowerCase().trim();
  if (INTERPRETIVE_FALLBACK_CATEGORIES.has(cat)) return true;
  const combined = `${p.name ?? ""} ${p.summary ?? ""}`.toLowerCase();
  return INTERPRETIVE_FALLBACK_RE.test(combined);
}

/**
 * Client-side mirror of GENERIC_COMMERCIAL_CATEGORIES /
 * CHAIN_NAME_RE in artifacts/api-server/src/lib/productionFilter.ts.
 *
 * NOT auto-synced — the server module is not importable from this Expo/React
 * Native package (no shared workspace package exposes it, and api-server is
 * not a dependency of @workspace/urban-explorer). This is a deliberate,
 * hand-maintained duplicate for defense-in-depth, matching the existing
 * INTERPRETIVE_FALLBACK_RE precedent above: it guards against a stale
 * AsyncStorage tile cache (or a future places-along-route/discover response)
 * serving chain places that predate a server-side filter change, without
 * requiring a client rebuild.
 *
 * If the server-side lists change, update both GENERIC_COMMERCIAL_FALLBACK_CATEGORIES
 * and CHAIN_FALLBACK_RE below to match, or this client-side guard will drift
 * out of sync with the server and silently stop catching new chains.
 */
const GENERIC_COMMERCIAL_FALLBACK_CATEGORIES = new Set([
  "restaurant",
  "pharmacy",
  "fuel",
  "convenience",
  "fast_food",
  "cafe",
  "supermarket",
  "atm",
  "bank",
]);

const CHAIN_FALLBACK_RE =
  /\b(cvs|walgreens|rite\s*aid|7.?eleven|sunoco|shell|bp|exxon|mobil|chevron|wawa|dunkin|starbucks|mcdonalds?|burger\s*king|subway|chipotle|dominos?|pizza\s*hut|taco\s*bell|wendy'?s|panda\s*express|chick.?fil.?a|popeyes?|kfc|arby'?s|panera|jersey\s*mike'?s|five\s*guys)\b/i;

export function looksGenericCommercial(p: EligibilityCandidate): boolean {
  const cat = (p.category ?? "").toLowerCase().trim();
  if (GENERIC_COMMERCIAL_FALLBACK_CATEGORIES.has(cat)) return true;
  return CHAIN_FALLBACK_RE.test(p.name ?? "");
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

    if (
      p.discoveryClass === "INTERPRETIVE_OVERLAY" ||
      (p.discoveryClass === undefined && looksInterpretive(p))
    ) {
      // Interpretive overlays are permanently ineligible for auto-narration.
      // They represent inferred area-level phenomena (buried waterways,
      // corridors, etc.) or LLM-only coordinates with specific location claims
      // that cannot be pinpointed. They stay visible on the map (not filtered
      // from the pool) but are never chosen for narration.
      //
      // The fallback looksInterpretive() check catches places loaded from an
      // AsyncStorage cache that was written before the server started setting
      // discoveryClass, ensuring old entries never sneak through.
      reason = "interpretiveOverlay";
    } else if (narratedIds.has(p.id)) {
      reason = "narrated";
    } else if (p.discoveryTier === 4) {
      // Tier-4 places are metadata-only (no historical depth) and are
      // permanently suppressed from auto-narration.  They remain visible
      // on the map as pins — this gate only affects the narration queue.
      reason = "lowQuality";
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
      discoveryRejectionReason:
        reason === "lowQuality" ? p.discoveryRejectionReason : undefined,
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
