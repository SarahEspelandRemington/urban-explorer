import {
  evaluateEligibility,
  haversineMeters,
  updatePassedTracker,
  type EligibilityCandidate,
  type EligibilityState,
} from "../lib/walkEligibility";

const NYC = { latitude: 40.7589, longitude: -73.9851 };

function makePlace(
  id: string,
  dx: number,
  dy: number,
  extras: Partial<EligibilityCandidate> = {},
): EligibilityCandidate {
  return {
    id,
    name: id,
    latitude: NYC.latitude + dy / 111_111,
    longitude:
      NYC.longitude + dx / (111_111 * Math.cos((NYC.latitude * Math.PI) / 180)),
    netScore: 5,
    ...extras,
  };
}

const baseCfg = { maxQueueDistance: 90, netScoreFloor: 0 };

const baseState = (
  overrides: Partial<EligibilityState> = {},
): EligibilityState => ({
  loc: NYC,
  heading: null,
  velocityHeadingFresh: false,
  narratedIds: new Map(),
  cfg: baseCfg,
  ...overrides,
});

describe("evaluateEligibility", () => {
  it("accepts a fresh place within range", () => {
    const result = evaluateEligibility([makePlace("p1", 30, 0)], baseState());
    expect(result.eligibleIds).toEqual(["p1"]);
    expect(result.evaluations[0].reason).toBe("ok");
  });

  it("rejects already-narrated places", () => {
    const narrated = new Map<string, number>([["p1", Date.now()]]);
    const result = evaluateEligibility(
      [makePlace("p1", 30, 0)],
      baseState({ narratedIds: narrated }),
    );
    expect(result.eligibleIds).toEqual([]);
    expect(result.evaluations[0].reason).toBe("narrated");
  });

  it("rejects places beyond maxQueueDistance", () => {
    const result = evaluateEligibility([makePlace("p1", 200, 0)], baseState());
    expect(result.evaluations[0].reason).toBe("tooFar");
  });

  it("applies hard 90° gate when velocity heading is fresh", () => {
    // User heading north (0°). Place is due south (180°), 50m away.
    const result = evaluateEligibility(
      [makePlace("p1", 0, -50)],
      baseState({ heading: 0, velocityHeadingFresh: true }),
    );
    expect(result.evaluations[0].reason).toBe("behind90");
  });

  it("does NOT apply hard 90° gate when velocity heading is stale", () => {
    const result = evaluateEligibility(
      [makePlace("p1", 0, -50)],
      baseState({ heading: 0, velocityHeadingFresh: false }),
    );
    expect(result.evaluations[0].reason).toBe("ok");
  });

  it("rejects places below netScoreFloor", () => {
    const result = evaluateEligibility(
      [makePlace("p1", 30, 0, { netScore: -5 })],
      baseState({ cfg: { maxQueueDistance: 90, netScoreFloor: 0 } }),
    );
    expect(result.evaluations[0].reason).toBe("lowScore");
  });

  it("rejects INTERPRETIVE_OVERLAY places even if they are also narrated", () => {
    // interpretiveOverlay check runs BEFORE the narrated check. A place that
    // was narrated before being downgraded (e.g. the server updated its
    // discoveryClass in a later discover call) must show "interpretiveOverlay"
    // in the debug log, not "narrated", so the spatial reason is not hidden.
    const narrated = new Map<string, number>([["p1", Date.now()]]);
    const place = makePlace("p1", 30, 0, {
      discoveryClass: "INTERPRETIVE_OVERLAY",
    });
    const result = evaluateEligibility(
      [place],
      baseState({ narratedIds: narrated }),
    );
    expect(result.eligibleIds).toEqual([]);
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects places the server flagged with autoNarrationBlocked", () => {
    // Place is close, has good score, no other reason to skip — but the
    // server's address-coherence check flagged it as a wrong-city
    // hallucination. Auto-narration must skip it.
    const place = makePlace("p1", 30, 0, { autoNarrationBlocked: true });
    const result = evaluateEligibility([place], baseState());
    expect(result.eligibleIds).toEqual([]);
    expect(result.evaluations[0].reason).toBe("addressMismatch");
  });

  it("does not block a place that is merely missing autoNarrationBlocked", () => {
    // Sanity check: an undefined autoNarrationBlocked must be treated as
    // false, not as truthy. Catches accidental `!== false` regressions.
    const place = makePlace("p1", 30, 0, {});
    const result = evaluateEligibility([place], baseState());
    expect(result.evaluations[0].reason).toBe("ok");
  });

  it("rejects places whose declared address geocodes far from claimed lat/lng", () => {
    // Place at NYC center, but its "address" geocoded 500m east.
    const place = makePlace("p1", 30, 0, {
      addressLat: NYC.latitude,
      addressLon:
        NYC.longitude +
        500 / (111_111 * Math.cos((NYC.latitude * Math.PI) / 180)),
    });
    const result = evaluateEligibility([place], baseState());
    expect(result.evaluations[0].reason).toBe("addressMismatch");
  });

  it("respects passedTracker once user has moved past a place", () => {
    const tracker = {
      seenWithinRadius: new Map<string, number>([["p1", Date.now()]]),
      passedRadius: 30,
      passedExitRadius: 60,
      passedWindowMs: 60_000,
    };
    // Place is now 200m away, was previously seen within 30m.
    const result = evaluateEligibility(
      [makePlace("p1", 200, 0)],
      baseState({
        passedTracker: tracker,
        cfg: { maxQueueDistance: 300, netScoreFloor: 0 },
      }),
    );
    expect(result.evaluations[0].reason).toBe("passed");
  });
});

describe("updatePassedTracker", () => {
  it("records a place once it enters passedRadius", () => {
    const tracker = {
      seenWithinRadius: new Map<string, number>(),
      passedRadius: 30,
      passedExitRadius: 60,
      passedWindowMs: 60_000,
    };
    updatePassedTracker(tracker, NYC, [makePlace("p1", 10, 0)], 1000);
    expect(tracker.seenWithinRadius.get("p1")).toBe(1000);
  });

  it("prunes stale entries past passedWindowMs", () => {
    const tracker = {
      seenWithinRadius: new Map<string, number>([["p1", 0]]),
      passedRadius: 30,
      passedExitRadius: 60,
      passedWindowMs: 1000,
    };
    updatePassedTracker(tracker, NYC, [], 5000);
    expect(tracker.seenWithinRadius.has("p1")).toBe(false);
  });
});

describe("haversineMeters", () => {
  it("returns ~0 for identical coords", () => {
    expect(
      haversineMeters(NYC.latitude, NYC.longitude, NYC.latitude, NYC.longitude),
    ).toBeLessThan(0.01);
  });

  it("approximately matches a known city block (~80m for 1 short avenue block)", () => {
    const dist = haversineMeters(
      40.7589,
      -73.9851,
      40.7589,
      -73.9841, // ~84m east at this latitude
    );
    expect(dist).toBeGreaterThan(70);
    expect(dist).toBeLessThan(110);
  });
});
