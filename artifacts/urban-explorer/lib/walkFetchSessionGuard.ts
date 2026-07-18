/**
 * Walk Mode live-fetch session staleness guard.
 *
 * Pure function — no React, no refs — so it can be unit tested without the
 * full WalkModeContext, following the same pattern as walkEligibility.ts and
 * walkFailureBackoff.ts.
 *
 * fetchNarrationPayload can take 10–15 s to resolve. In that window the user
 * may call stopWalk() (isWalkingRef.current becomes false), or stopWalk()
 * followed immediately by a new startWalk() (isWalkingRef.current is true
 * again, but for a DIFFERENT walk — walkGenerationRef.current has advanced
 * past the value fetchNarration captured before the await). Either case means
 * the fetch's result belongs to a session that is no longer the active one,
 * and must be discarded rather than mutating the new session's state
 * (narratedIdsRef, failedFetchRef, narration playback, stats).
 */
export function isLiveFetchStale(
  isWalkingNow: boolean,
  currentGeneration: number,
  fetchGeneration: number,
): boolean {
  return !isWalkingNow || currentGeneration !== fetchGeneration;
}
