/**
 * Lightweight in-memory diagnostics surface for Walk Mode.
 *
 * The selection pipeline writes structured snapshots and rejection events
 * here. The debug overlay subscribes and re-renders. Nothing here is
 * persisted — this is purely a runtime introspection tool, gated behind a
 * Settings toggle so it never costs anything for normal users.
 *
 * No PII safety wrappers needed: GPS coords and place names are already
 * what the user is looking at; this surface never leaves the device.
 */

import type { EligibilityReason } from "./walkEligibility";

export interface DiagSelectionSnapshot {
  ts: number;
  location: { latitude: number; longitude: number };
  heading: number | null;
  headingSource: "velocity" | "compass" | "none";
  velocityHeadingFresh: boolean;
  velocityMps: number | null;
  visiblePinCount: number;
  eligibleCount: number;
  /** Top candidates after ranking (lowest score first). Up to 5. */
  topCandidates: Array<{
    id: string;
    name: string;
    distance: number;
    bearingDiff: number | null;
    score: number;
    osmId?: string;
    candidateSource?: "osm" | "llm";
    /** Deterministic quality tier from the server-side classifier (1–4). */
    discoveryTier?: number;
    /** Debug label for why Tier 4 was assigned (e.g. "metadataOnly"). */
    discoveryRejectionReason?: string;
  }>;
  /** Place chosen by pickNext, or null if nothing eligible. */
  selected: { id: string; name: string; reason: string } | null;
}

export interface DiagRejection {
  ts: number;
  placeId: string;
  placeName: string;
  reason: EligibilityReason | "scoreLost" | "recentFailure";
  /** Distance from user to the rejected place in metres, or null when the
   *  rejection reason makes distance irrelevant (e.g. address-mismatch
   *  candidates rejected before any distance lookup). */
  distance: number | null;
  bearingDiff: number | null;
  /**
   * When `reason` is "narrated", records a concurrent spatial downgrade so
   * the debug overlay can show "narrated (interpretiveOverlay)" rather than
   * hiding the spatial problem behind the narrated flag. Populated by pickNext
   * when the place is also INTERPRETIVE_OVERLAY or autoNarrationBlocked at
   * the time of the rejection evaluation.
   */
  spatialNote?: string;
  /**
   * When `reason` is "lowQuality", the specific Tier-4 rule that fired
   * (e.g. "metadataOnly", "noHistoricalDepth", "genericBusinessDescription").
   * Populated from `EligibilityResult.evaluations[n].discoveryRejectionReason`.
   */
  discoveryRejectionReason?: string;
}

export interface DiagDiscoverResult {
  osmCandidateCount?: { r150: number; r300: number; r500: number };
  noVerifiedPlacesNearby?: boolean;
  /** Raw counts from the tile before any candidateSource gate is applied. */
  osmCoverage: { osm: number; llm: number };
  /** Counts after all Walk Mode gates — what actually entered placesRef. */
  poolCoverage?: { osm: number; llm: number };
}

/**
 * Outcome of a narration fetch for the candidate pickNext selected. "cache"
 * source means a prefetched payload was already sitting in
 * prefetchedNarrationRef — no live network request was made for this pick.
 * "live" means fetchNarrationPayload was actually called.
 *
 * "cancelled" only applies to the live path: the fetch itself succeeded, but
 * stopWalk was called while it was in flight, so the payload was discarded.
 * "timeout" means fetchNarrationPayload's own internal fetch timeout (12s
 * text / 15s audio) is what caused the final null return, per its
 * timeoutInfo out-param — distinct from "failure", which covers every other
 * unsuccessful case (bad status, empty payload, non-timeout thrown error).
 */
export interface DiagNarrationFetch {
  ts: number;
  placeId: string;
  placeName: string;
  source: "cache" | "live";
  outcome: "success" | "failure" | "timeout" | "cancelled";
  payloadKind?: "audio" | "text";
  /**
   * Elapsed time in milliseconds from the moment fetchNarrationPayload was
   * called to the moment its result (success/failure) was known. Only set
   * for source: "live" — a "cache" hit is a synchronous consume of an
   * already-prefetched payload, so there is no network round trip to time
   * and this is left undefined rather than reported as a misleading ~0ms.
   * This is a client-side, user-facing-latency measurement only: it does
   * NOT reflect how long the server actually spent generating the
   * narration — see the server's own request-timing logs for that.
   */
  durationMs?: number;
}

/**
 * Most recent reason maybeNarrate/pickNext declined to even attempt a fetch
 * this cycle (cooldown, already speaking, movement gate, etc). A single
 * overwritten slot, not a growing log — these gates re-evaluate every ~1.5s
 * tick, so a list would be mostly noise. Cleared (set null) right before a
 * fetch is actually attempted so a stale reason doesn't linger on screen.
 */
export interface DiagBlock {
  ts: number;
  reason:
    | "notWalking"
    | "alreadySpeaking"
    | "cooldown"
    | "movementGate"
    | "noEligibleCandidate"
    | "reValidationDrop";
  detail?: string;
}

/**
 * Most recent iOS lock-screen (setActiveForLockScreen) failure this walk
 * session. Activation and deactivation failures are both recorded here, but
 * only a *successful* activation clears it — a successful teardown does not,
 * so an activation failure stays visible until the next activation attempt
 * either succeeds or fails again. Expected to stay null in normal operation;
 * this exists purely for field-test visibility into an otherwise-swallowed
 * failure (see the catch blocks around setActiveForLockScreen in
 * hooks/useNarration.ts).
 */
export interface DiagLockScreenError {
  ts: number;
  message: string;
}

/**
 * Most recent /api/explore/discover failure this walk session — covers all
 * three ways fetchNearbyPlaces can fail to update the pool: a non-2xx HTTP
 * response ("busy"/"error"), the fetch throwing or the client's own abort
 * timeout firing ("network", no HTTP status available), and a 2xx response
 * whose body isn't the expected shape ("malformed", no confirmed live
 * occurrence as of A14 — kept distinct from "error" so it's visibly odd if
 * it ever does fire, rather than blending into ordinary flakiness). Note:
 * a 2xx response with an unparseable JSON body throws inside res.json() and
 * is caught by the generic catch block, so it's classified as "network"
 * rather than "malformed" — an accepted coarser-labeling limitation, not a
 * gap in coverage (it's still visible and still triggers backoff either way).
 * A single overwritten slot, not a growing log, mirroring DiagLockScreenError:
 * this exists purely for field-test visibility into a failure that otherwise
 * produces no signal anywhere (the pool/overlay coverage counts simply stay
 * frozen at their last successful values).
 *
 * "kind" mirrors the busy/error distinction Explore's discoverMutation.isError
 * check already makes on the same endpoint (429/503 = "busy" — temporarily
 * unavailable, expected to recover — vs. any other non-2xx status = "error").
 */
export interface DiagDiscoverError {
  ts: number;
  status: number | null;
  kind: "busy" | "error" | "network" | "malformed";
}

export interface DiagState {
  lastSnapshot: DiagSelectionSnapshot | null;
  rejections: DiagRejection[]; // capped, most recent first
  lastDiscoverResult: DiagDiscoverResult | null;
  narrationFetches: DiagNarrationFetch[]; // capped, most recent first
  lastBlock: DiagBlock | null;
  lastLockScreenError: DiagLockScreenError | null;
  lastDiscoverError: DiagDiscoverError | null;
}

const REJECTION_CAP = 30;
const FETCH_CAP = 20;

const state: DiagState = {
  lastSnapshot: null,
  rejections: [],
  lastDiscoverResult: null,
  narrationFetches: [],
  lastBlock: null,
  lastLockScreenError: null,
  lastDiscoverError: null,
};

const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {}
  }
}

export function getWalkDiagnostics(): DiagState {
  return state;
}

export function subscribeWalkDiagnostics(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function recordSelectionSnapshot(snap: DiagSelectionSnapshot): void {
  state.lastSnapshot = snap;
  notify();
}

export function recordRejection(rej: DiagRejection): void {
  state.rejections.unshift(rej);
  if (state.rejections.length > REJECTION_CAP) {
    state.rejections.length = REJECTION_CAP;
  }
  notify();
}

export function recordDiscoverResult(result: DiagDiscoverResult): void {
  state.lastDiscoverResult = result;
  notify();
}

export function recordDiscoverError(
  status: number | null,
  kind: "busy" | "error" | "network" | "malformed",
): void {
  state.lastDiscoverError = { ts: Date.now(), status, kind };
  notify();
}

export function recordNarrationFetch(fetch: DiagNarrationFetch): void {
  state.narrationFetches.unshift(fetch);
  if (state.narrationFetches.length > FETCH_CAP) {
    state.narrationFetches.length = FETCH_CAP;
  }
  notify();
}

export function recordBlock(block: DiagBlock | null): void {
  state.lastBlock = block;
  notify();
}

export function recordLockScreenError(message: string): void {
  state.lastLockScreenError = { ts: Date.now(), message };
  notify();
}

/** Called only after a successful lock-screen activation — see the doc
 *  comment on DiagLockScreenError for why deactivation success does not
 *  call this. */
export function clearLockScreenError(): void {
  if (state.lastLockScreenError !== null) {
    state.lastLockScreenError = null;
    notify();
  }
}

/** Called after a successful discover pool update (cache hit or server
 *  fetch) so the overlay doesn't keep showing a stale warning once the
 *  underlying failure has actually recovered. */
export function clearDiscoverError(): void {
  if (state.lastDiscoverError !== null) {
    state.lastDiscoverError = null;
    notify();
  }
}

export function resetWalkDiagnostics(): void {
  state.lastSnapshot = null;
  state.rejections = [];
  state.lastDiscoverResult = null;
  state.narrationFetches = [];
  state.lastBlock = null;
  state.lastLockScreenError = null;
  state.lastDiscoverError = null;
  notify();
}
