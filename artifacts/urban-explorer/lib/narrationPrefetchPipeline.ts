/**
 * Narration prefetch pipeline — pure orchestration extracted from
 * WalkModeContext.tsx so the race-condition guards can be exercised by
 * deterministic stress tests in walkModeStress.test.ts (group 4).
 *
 * The pipeline has three guards we must never lose:
 *
 *   1. STALE DISCARD — when fetchNarration is called for place B but the
 *      cache holds a payload prefetched for place A, the stale payload's
 *      audio temp file must be cleaned up before the new fetch fires.
 *      (As of the stale-pool change below, the discarded payload is first
 *      offered to the stale pool for short-window replay; only if the pool
 *      is unavailable does immediate cleanup run.)
 *
 *   2. STOP-WALK GUARD — if stopWalk runs while a prefetch is in flight,
 *      the resolved payload must NOT be written into the cache and any
 *      audio temp file must be cleaned up to avoid disk leaks.
 *
 *   3. IN-FLIGHT DEDUPE — repeated calls to runPrefetchCycle for the
 *      same candidate (e.g. multiple GPS ticks before the first fetch
 *      resolves) must collapse into a single fetch.
 *
 * STALE POOL (for "skip then re-pick" replay):
 *   When the live cache holds place A and we want to fetch B, we historically
 *   discarded A and threw away its prerendered MP3.  In Walk Mode the queue
 *   often re-picks the just-skipped place a moment later (cooldown miss + new
 *   pickNext result), and that meant another full round-trip to the audio
 *   endpoint.  The stale pool keeps A's payload alive for a short TTL so a
 *   fast re-pick replays the cached audio instantly.  Entries that age out
 *   are still cleaned up via the scheduled timer so we don't leak temp files.
 */

export type NarrationPayload =
  | { kind: "audio"; audioUri: string; cleanup?: () => void }
  | { kind: "text"; text: string };

export interface PrefetchPlaceLike {
  id: string;
}

export interface PrefetchEntry<P extends PrefetchPlaceLike> {
  placeId: string;
  payload: NarrationPayload;
  place: P;
}

export const DEFAULT_STALE_PREFETCH_TTL_MS = 30_000;

/**
 * Telemetry payload passed to the optional onReplay / onEvict callbacks.
 * `ageMs` is the time the entry spent parked in the pool — for replays this
 * tells us how long after parking the re-pick happened (useful for TTL
 * tuning); for evictions it's effectively the configured TTL.
 */
export interface StalePoolEventInfo {
  placeId: string;
  ageMs: number;
}

export interface StalePrefetchedSlot<P extends PrefetchPlaceLike> {
  entry: PrefetchEntry<P>;
  parkedAt: number;
  expiresAt: number;
  // Opaque handle for the cleanup timer; whatever schedule() returned.
  timerHandle: unknown;
}

export interface StalePrefetchPool<P extends PrefetchPlaceLike> {
  map: Map<string, StalePrefetchedSlot<P>>;
  ttlMs: number;
  now: () => number;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  // Telemetry hooks — fire on a successful revive (replay) and on TTL
  // age-out (evict). Re-park displacement and disposeStalePrefetchPool
  // teardown are NOT counted as evictions: only entries that actually
  // aged out without being replayed.
  onReplay?: (info: StalePoolEventInfo) => void;
  onEvict?: (info: StalePoolEventInfo) => void;
}

export interface CreateStalePoolOptions {
  ttlMs?: number;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  onReplay?: (info: StalePoolEventInfo) => void;
  onEvict?: (info: StalePoolEventInfo) => void;
}

/**
 * Build a stale-pool handle.  Defaults use Date.now and global setTimeout/
 * clearTimeout; tests can inject a controllable clock and scheduler so the
 * TTL behaviour stays deterministic.
 */
export function createStalePrefetchPool<P extends PrefetchPlaceLike>(
  opts: CreateStalePoolOptions = {},
): StalePrefetchPool<P> {
  return {
    map: new Map<string, StalePrefetchedSlot<P>>(),
    ttlMs: opts.ttlMs ?? DEFAULT_STALE_PREFETCH_TTL_MS,
    now: opts.now ?? (() => Date.now()),
    schedule: opts.schedule ?? ((fn, ms) => setTimeout(fn, ms)),
    cancel: opts.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    onReplay: opts.onReplay,
    onEvict: opts.onEvict,
  };
}

function emitPoolEvent<P extends PrefetchPlaceLike>(
  cb: ((info: StalePoolEventInfo) => void) | undefined,
  pool: StalePrefetchPool<P>,
  slot: StalePrefetchedSlot<P>,
): void {
  if (!cb) return;
  try {
    cb({ placeId: slot.entry.placeId, ageMs: pool.now() - slot.parkedAt });
  } catch {
    // Telemetry must never break the cache flow.
  }
}

function runAudioCleanup<P extends PrefetchPlaceLike>(entry: PrefetchEntry<P>): void {
  if (entry.payload.kind === "audio") {
    try { entry.payload.cleanup?.(); } catch {}
  }
}

/**
 * Park an entry in the stale pool with a TTL.  If the pool already holds an
 * entry for the same placeId (rare — e.g. a fresh fetch landed and was then
 * displaced again), the previous slot's timer is cancelled and its audio
 * temp file is cleaned up before the new entry takes its place.
 */
export function parkStalePrefetchedEntry<P extends PrefetchPlaceLike>(
  pool: StalePrefetchPool<P>,
  entry: PrefetchEntry<P>,
): void {
  const existing = pool.map.get(entry.placeId);
  if (existing) {
    try { pool.cancel(existing.timerHandle); } catch {}
    runAudioCleanup(existing.entry);
    pool.map.delete(entry.placeId);
  }
  const parkedAt = pool.now();
  const expiresAt = parkedAt + pool.ttlMs;
  // Capture placeId locally so the timer doesn't accidentally clear an
  // unrelated slot if a later park reuses the same id.
  const slotPlaceId = entry.placeId;
  const timerHandle = pool.schedule(() => {
    const current = pool.map.get(slotPlaceId);
    if (current && current.entry === entry) {
      runAudioCleanup(entry);
      pool.map.delete(slotPlaceId);
      // TTL fired with no replay — record an eviction so the configured TTL
      // can be tuned against the replay/eviction ratio.
      emitPoolEvent(pool.onEvict, pool, current);
    }
  }, pool.ttlMs);
  pool.map.set(slotPlaceId, { entry, parkedAt, expiresAt, timerHandle });
}

/**
 * Look up `placeId` in the stale pool.  On hit the entry is removed from the
 * pool and its cleanup timer cancelled — the caller now owns the payload
 * (and its audio temp file).  Entries whose TTL elapsed but whose timer
 * hasn't fired yet are treated as a miss and cleaned up synchronously.
 */
export function reviveStalePrefetchedEntry<P extends PrefetchPlaceLike>(
  pool: StalePrefetchPool<P>,
  placeId: string,
): PrefetchEntry<P> | null {
  const slot = pool.map.get(placeId);
  if (!slot) return null;
  if (slot.expiresAt <= pool.now()) {
    try { pool.cancel(slot.timerHandle); } catch {}
    runAudioCleanup(slot.entry);
    pool.map.delete(placeId);
    // Synchronous expiry path: the entry aged out before the timer ran. We
    // still treat this as an eviction — the user did not benefit from it.
    emitPoolEvent(pool.onEvict, pool, slot);
    return null;
  }
  try { pool.cancel(slot.timerHandle); } catch {}
  pool.map.delete(placeId);
  // Successful re-pick within the TTL — the cache saved a round-trip.
  emitPoolEvent(pool.onReplay, pool, slot);
  return slot.entry;
}

/**
 * Cancel every pending TTL timer and run cleanup on every audio payload.
 * Called from stopWalk and the start-of-walk reset so we never carry stale
 * temp files across walks.
 */
export function disposeStalePrefetchPool<P extends PrefetchPlaceLike>(
  pool: StalePrefetchPool<P>,
): void {
  for (const slot of pool.map.values()) {
    try { pool.cancel(slot.timerHandle); } catch {}
    runAudioCleanup(slot.entry);
  }
  pool.map.clear();
}

export interface PrefetchPipelineDeps<P extends PrefetchPlaceLike> {
  isWalkingRef: { current: boolean };
  narratedIdsRef: { current: Map<string, number> };
  prefetchedNarrationRef: { current: PrefetchEntry<P> | null };
  prefetchInFlightRef: { current: string | null };
  placesRef: { current: P[] };
  pickNext: () => P | null;
  fetchPayload: (place: P) => Promise<NarrationPayload | null>;
  // Optional stale pool — when provided, displaced live entries are parked
  // for short-window replay instead of immediately cleaned up, and a candidate
  // already in the pool is promoted to the live cache without a re-fetch.
  stalePool?: StalePrefetchPool<P>;
}

/**
 * Drive one prefetch cycle. Returns the in-flight Promise so tests (and
 * callers that want to await the cycle) can synchronise on completion.
 * Production WalkModeContext fires this fire-and-forget.
 */
export function runPrefetchCycle<P extends PrefetchPlaceLike>(
  deps: PrefetchPipelineDeps<P>,
): Promise<void> | undefined {
  if (!deps.isWalkingRef.current) return undefined;
  const candidate = deps.pickNext();
  if (!candidate) return undefined;
  // Already cached for this candidate — no need to re-fetch.
  if (deps.prefetchedNarrationRef.current?.placeId === candidate.id) return undefined;
  // Another request for this candidate is already in flight — DEDUPE.
  if (deps.prefetchInFlightRef.current === candidate.id) return undefined;

  // Stale-pool revival: if we already have a recent payload for this candidate,
  // promote it back to the live cache and skip the network round-trip.  Any
  // entry currently in the live cache is parked first so it stays available
  // for its own TTL window.
  if (deps.stalePool) {
    const revived = reviveStalePrefetchedEntry(deps.stalePool, candidate.id);
    if (revived) {
      const displaced = deps.prefetchedNarrationRef.current;
      if (displaced) parkStalePrefetchedEntry(deps.stalePool, displaced);
      deps.prefetchedNarrationRef.current = revived;
      return undefined;
    }
  }

  // Clear any stale entry so we don't serve the wrong place.  When a stale
  // pool is configured we park the displaced entry for short-window replay;
  // otherwise we own the audio temp file and must delete it now.
  const stale = deps.prefetchedNarrationRef.current;
  if (stale) {
    if (deps.stalePool) {
      parkStalePrefetchedEntry(deps.stalePool, stale);
    } else if (stale.payload.kind === "audio") {
      try { stale.payload.cleanup?.(); } catch {}
    }
  }
  deps.prefetchedNarrationRef.current = null;

  const candidateId = candidate.id;
  deps.prefetchInFlightRef.current = candidateId;
  return (async () => {
    try {
      const place = deps.placesRef.current.find((p) => p.id === candidateId);
      if (!place) return;
      const payload = await deps.fetchPayload(place);
      if (!payload) return;
      // STOP-WALK / already-narrated guard. We own the audio temp file so
      // delete it before bailing.
      if (!deps.isWalkingRef.current || deps.narratedIdsRef.current.has(candidateId)) {
        if (payload.kind === "audio") { try { payload.cleanup?.(); } catch {} }
        return;
      }
      deps.prefetchedNarrationRef.current = { placeId: candidateId, payload, place };
    } catch {
      // Best-effort: failures fall back to the normal fetchNarration path.
    } finally {
      // Always clear the in-flight marker so a later call can retry if needed.
      if (deps.prefetchInFlightRef.current === candidateId) {
        deps.prefetchInFlightRef.current = null;
      }
    }
  })();
}

/**
 * Look up a prefetched payload for the given place ID. On a miss, any
 * stale audio payload's cleanup is invoked synchronously (we own the
 * temp file). The caller is responsible for clearing
 * prefetchedNarrationRef.current to null before calling — that mirrors
 * the "always consume / clear the cache" semantics of fetchNarration.
 *
 * When a stale pool is provided, the miss path first checks the pool for
 * a recently-displaced payload for the requested place, and parks the
 * caller's mismatched entry instead of running its cleanup outright.  This
 * is how a "skip then re-pick within the TTL" sequence replays the
 * already-fetched audio without another round-trip.
 */
export function consumePrefetchedNarration<P extends PrefetchPlaceLike>(
  prefetched: PrefetchEntry<P> | null,
  requestedPlaceId: string,
  stalePool?: StalePrefetchPool<P>,
):
  | { kind: "hit"; entry: PrefetchEntry<P> }
  | { kind: "miss" } {
  if (prefetched && prefetched.placeId === requestedPlaceId) {
    return { kind: "hit", entry: prefetched };
  }
  if (stalePool) {
    const revived = reviveStalePrefetchedEntry(stalePool, requestedPlaceId);
    if (revived) {
      // The mismatched live entry (if any) is still potentially useful —
      // park it so a follow-up re-pick can replay it too.
      if (prefetched) parkStalePrefetchedEntry(stalePool, prefetched);
      return { kind: "hit", entry: revived };
    }
    if (prefetched) parkStalePrefetchedEntry(stalePool, prefetched);
    return { kind: "miss" };
  }
  if (prefetched && prefetched.payload.kind === "audio") {
    try { prefetched.payload.cleanup?.(); } catch {}
  }
  return { kind: "miss" };
}
