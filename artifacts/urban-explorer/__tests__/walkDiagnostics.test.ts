/**
 * Tests for the new continued-relevance / playback-confirmation diagnostics
 * added to lib/walkDiagnostics.ts (see WALK_DIAGNOSTIC.md):
 *   - continuedRelevanceChecks: a separate, small capped buffer so this new,
 *     more verbose diagnostic cannot evict the existing `rejections` cap.
 *   - lastPlaybackConfirmation: single-slot, placeId-matched confirmation
 *     state distinguishing "play() returned" from "playback confirmed".
 */

import {
  getWalkDiagnostics,
  recordContinuedRelevanceCheck,
  recordPlaybackAttempt,
  recordPlaybackConfirmed,
  recordRejection,
  resetWalkDiagnostics,
  type DiagContinuedRelevanceCheck,
} from "../lib/walkDiagnostics";

function makeCheck(
  overrides: Partial<DiagContinuedRelevanceCheck> = {},
): DiagContinuedRelevanceCheck {
  return {
    ts: Date.now(),
    placeId: "p1",
    placeName: "Place One",
    checkLabel: "fetchNarration:pre",
    outcome: "ok",
    distance: 10,
    bearingDiff: null,
    pickTimeMaxQueueDistance: 90,
    currentMaxQueueDistance: 90,
    elapsedSincePickMs: 500,
    positionFixAgeMs: 200,
    location: { latitude: 40.75, longitude: -73.98 },
    ...overrides,
  };
}

describe("walkDiagnostics — continuedRelevanceChecks buffer", () => {
  beforeEach(() => resetWalkDiagnostics());

  it("records entries most-recent-first", () => {
    recordContinuedRelevanceCheck(makeCheck({ placeId: "p1" }));
    recordContinuedRelevanceCheck(makeCheck({ placeId: "p2" }));
    const checks = getWalkDiagnostics().continuedRelevanceChecks;
    expect(checks[0].placeId).toBe("p2");
    expect(checks[1].placeId).toBe("p1");
  });

  it("caps at 15 entries without touching the existing rejections buffer", () => {
    // Fill rejections close to ITS OWN cap first, to prove the two buffers
    // are independent.
    for (let i = 0; i < 25; i++) {
      recordRejection({
        ts: Date.now(),
        placeId: `r${i}`,
        placeName: `R${i}`,
        reason: "stale",
        distance: 100,
        bearingDiff: null,
      });
    }
    for (let i = 0; i < 20; i++) {
      recordContinuedRelevanceCheck(makeCheck({ placeId: `c${i}` }));
    }
    const state = getWalkDiagnostics();
    expect(state.continuedRelevanceChecks.length).toBe(15);
    expect(state.continuedRelevanceChecks[0].placeId).toBe("c19");
    // Existing rejections cap (30) and entries are untouched by the new buffer.
    expect(state.rejections.length).toBe(25);
    expect(state.rejections[0].placeId).toBe("r24");
  });
});

describe("walkDiagnostics — playback confirmation", () => {
  beforeEach(() => resetWalkDiagnostics());

  it("recordPlaybackAttempt sets an unconfirmed slot", () => {
    recordPlaybackAttempt("p1", "Place One");
    expect(getWalkDiagnostics().lastPlaybackConfirmation).toMatchObject({
      placeId: "p1",
      playCallReturned: true,
      playbackConfirmed: false,
      confirmedAtMs: null,
    });
  });

  it("recordPlaybackConfirmed flips the matching slot to confirmed", () => {
    recordPlaybackAttempt("p1", "Place One");
    recordPlaybackConfirmed("p1");
    const slot = getWalkDiagnostics().lastPlaybackConfirmation;
    expect(slot?.playbackConfirmed).toBe(true);
    expect(slot?.confirmedAtMs).not.toBeNull();
  });

  it("recordPlaybackConfirmed is a no-op for a mismatched placeId (newer attempt already overwrote the slot)", () => {
    recordPlaybackAttempt("p1", "Place One");
    recordPlaybackAttempt("p2", "Place Two"); // overwrites the slot
    recordPlaybackConfirmed("p1"); // stale — must not touch p2's slot
    const slot = getWalkDiagnostics().lastPlaybackConfirmation;
    expect(slot?.placeId).toBe("p2");
    expect(slot?.playbackConfirmed).toBe(false);
  });

  it("recordPlaybackConfirmed is a no-op with no prior attempt", () => {
    recordPlaybackConfirmed("p1");
    expect(getWalkDiagnostics().lastPlaybackConfirmation).toBeNull();
  });
});

describe("walkDiagnostics — resetWalkDiagnostics clears both new fields", () => {
  it("clears continuedRelevanceChecks and lastPlaybackConfirmation", () => {
    recordContinuedRelevanceCheck(makeCheck());
    recordPlaybackAttempt("p1", "Place One");
    resetWalkDiagnostics();
    const state = getWalkDiagnostics();
    expect(state.continuedRelevanceChecks).toEqual([]);
    expect(state.lastPlaybackConfirmation).toBeNull();
  });
});
