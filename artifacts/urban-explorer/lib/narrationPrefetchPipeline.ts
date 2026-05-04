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
 *
 *   2. STOP-WALK GUARD — if stopWalk runs while a prefetch is in flight,
 *      the resolved payload must NOT be written into the cache and any
 *      audio temp file must be cleaned up to avoid disk leaks.
 *
 *   3. IN-FLIGHT DEDUPE — repeated calls to runPrefetchCycle for the
 *      same candidate (e.g. multiple GPS ticks before the first fetch
 *      resolves) must collapse into a single fetch.
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

export interface PrefetchPipelineDeps<P extends PrefetchPlaceLike> {
  isWalkingRef: { current: boolean };
  narratedIdsRef: { current: Map<string, number> };
  prefetchedNarrationRef: { current: PrefetchEntry<P> | null };
  prefetchInFlightRef: { current: string | null };
  placesRef: { current: P[] };
  pickNext: () => P | null;
  fetchPayload: (place: P) => Promise<NarrationPayload | null>;
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

  // Clear any stale entry so we don't serve the wrong place. If the stale
  // entry was an audio payload we own the temp file, so delete it first.
  const stale = deps.prefetchedNarrationRef.current;
  if (stale && stale.payload.kind === "audio") {
    try { stale.payload.cleanup?.(); } catch {}
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
 */
export function consumePrefetchedNarration<P extends PrefetchPlaceLike>(
  prefetched: PrefetchEntry<P> | null,
  requestedPlaceId: string,
):
  | { kind: "hit"; entry: PrefetchEntry<P> }
  | { kind: "miss" } {
  if (prefetched && prefetched.placeId === requestedPlaceId) {
    return { kind: "hit", entry: prefetched };
  }
  if (prefetched && prefetched.payload.kind === "audio") {
    try { prefetched.payload.cleanup?.(); } catch {}
  }
  return { kind: "miss" };
}
