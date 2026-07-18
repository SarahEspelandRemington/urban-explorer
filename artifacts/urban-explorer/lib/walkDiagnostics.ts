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
  reason: EligibilityReason | "scoreLost";
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
 * "failure" covers every other unsuccessful outcome fetchNarrationPayload
 * already collapses to null (bad status, empty payload, thrown error,
 * timeout) — the current code doesn't expose which case it was, so this
 * doesn't invent a finer-grained distinction than what's already there.
 */
export interface DiagNarrationFetch {
  ts: number;
  placeId: string;
  placeName: string;
  source: "cache" | "live";
  outcome: "success" | "failure" | "cancelled";
  payloadKind?: "audio" | "text";
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

export interface DiagState {
  lastSnapshot: DiagSelectionSnapshot | null;
  rejections: DiagRejection[]; // capped, most recent first
  lastDiscoverResult: DiagDiscoverResult | null;
  narrationFetches: DiagNarrationFetch[]; // capped, most recent first
  lastBlock: DiagBlock | null;
}

const REJECTION_CAP = 30;
const FETCH_CAP = 20;

const state: DiagState = {
  lastSnapshot: null,
  rejections: [],
  lastDiscoverResult: null,
  narrationFetches: [],
  lastBlock: null,
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

export function resetWalkDiagnostics(): void {
  state.lastSnapshot = null;
  state.rejections = [];
  state.lastDiscoverResult = null;
  state.narrationFetches = [];
  state.lastBlock = null;
  notify();
}
