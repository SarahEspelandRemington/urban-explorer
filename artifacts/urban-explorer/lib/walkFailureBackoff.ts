/**
 * Walk Mode narration-failure backoff filter.
 *
 * Pure function — no React, no refs, no side effects — so it can be unit
 * tested without the full WalkModeContext, following the same pattern as
 * walkEligibility.ts.
 *
 * When a live narration fetch fails, WalkModeContext un-marks the candidate
 * as narrated (so it isn't burned for the rest of the session) and records a
 * failure timestamp. Without a backoff, the very next ~1.5 s maybeNarrate
 * tick could immediately re-select and re-fetch the same failing candidate,
 * since a failed fetch never advances the cooldown/movement gates (those only
 * update when narration actually finishes playing). This filter removes
 * candidates with an unexpired failure timestamp from an already-eligible id
 * list, per-candidate, so other eligible candidates remain selectable during
 * another candidate's backoff window.
 */

export interface BackedOffCandidate {
  id: string;
}

export interface FailureBackoffFilterResult {
  eligibleIds: string[];
  backedOff: BackedOffCandidate[];
}

/**
 * Filters `ids` (already-eligible candidate ids) down to those NOT currently
 * in a failure backoff window, per `failedFetch` (placeId → last-failure
 * timestamp) and `backoffMs`. Ids not present in `failedFetch` are always
 * eligible.
 */
export function filterFailureBackoff(
  ids: string[],
  failedFetch: Map<string, number>,
  now: number,
  backoffMs: number,
): FailureBackoffFilterResult {
  const eligibleIds: string[] = [];
  const backedOff: BackedOffCandidate[] = [];
  for (const id of ids) {
    const failedAt = failedFetch.get(id);
    if (failedAt === undefined || now - failedAt >= backoffMs) {
      eligibleIds.push(id);
    } else {
      backedOff.push({ id });
    }
  }
  return { eligibleIds, backedOff };
}
