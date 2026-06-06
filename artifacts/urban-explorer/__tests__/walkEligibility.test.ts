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

  it("rejects coordSource='llm' places via autoNarrationBlocked (Explore-only tier)", () => {
    // verifyPlaceCoordinates sets autoNarrationBlocked=true on all "llm"-sourced
    // places (Nominatim returned zero results — coordinates are LLM-only).
    // WalkModeContext excludes these from the candidate pool before they reach
    // evaluateEligibility, but autoNarrationBlocked=true provides defence-in-depth
    // so they are blocked here even if they somehow reach eligibility scoring.
    const place = makePlace("p1", 30, 0, { autoNarrationBlocked: true });
    const result = evaluateEligibility([place], baseState());
    expect(result.eligibleIds).toEqual([]);
    expect(result.evaluations[0].reason).toBe("addressMismatch");
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

describe("evaluateEligibility — looksInterpretive() fallback", () => {
  // These tests verify the client-side INTERPRETIVE_FALLBACK_RE / category
  // guard that fires when discoveryClass is undefined (e.g. a place loaded
  // from an AsyncStorage cache written before the server started setting
  // discoveryClass). All places below are in range with a good score; the
  // only reason to reject them is the interpretive-text or category match.

  function makeInterpretiveCandidate(
    overrides: Partial<EligibilityCandidate>,
  ): EligibilityCandidate {
    return makePlace("p1", 30, 0, overrides);
  }

  it("rejects a place with no discoveryClass whose name contains 'buried'", () => {
    const p = makeInterpretiveCandidate({ name: "Buried Mill Creek" });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose summary contains 'tunnel'", () => {
    const p = makeInterpretiveCandidate({
      name: "Old Station",
      summary: "A tunnel runs beneath this block.",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose name contains 'underground'", () => {
    const p = makeInterpretiveCandidate({
      name: "Underground Passage at 40th St",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose summary contains 'oral history'", () => {
    const p = makeInterpretiveCandidate({
      name: "Community Garden",
      summary: "According to oral history this site was once a factory.",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose summary contains 'oral histories'", () => {
    const p = makeInterpretiveCandidate({
      name: "Corner Lot",
      summary: "Oral histories suggest workers lived here.",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose summary contains 'subsurface'", () => {
    const p = makeInterpretiveCandidate({
      name: "Infrastructure Site",
      summary: "Subsurface waterway remnants detected.",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose name contains 'speakeasy'", () => {
    const p = makeInterpretiveCandidate({
      name: "Speakeasy Passage beneath 40th & Walnut",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose summary contains 'ghost sign'", () => {
    const p = makeInterpretiveCandidate({
      name: "Brick Wall",
      summary: "A ghost sign for a hardware store is still visible.",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose summary contains 'once flowed'", () => {
    const p = makeInterpretiveCandidate({
      name: "Flatlands Park",
      summary: "A creek once flowed through here before being paved over.",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose summary contains 'flows beneath'", () => {
    const p = makeInterpretiveCandidate({
      name: "Walnut Street Plaza",
      summary: "The old millrace flows beneath the surface here.",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose category is 'waterway remnant'", () => {
    const p = makeInterpretiveCandidate({
      name: "Low Alley",
      category: "waterway remnant",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose category is 'buried waterway'", () => {
    const p = makeInterpretiveCandidate({
      name: "Covered Drainage",
      category: "buried waterway",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose category is 'transportation remnant'", () => {
    const p = makeInterpretiveCandidate({
      name: "Former Trolley Stop",
      category: "transportation remnant",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("rejects a place with no discoveryClass whose category is 'subsurface'", () => {
    const p = makeInterpretiveCandidate({
      name: "Water Infrastructure",
      category: "subsurface",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("does NOT block a normal place when discoveryClass is undefined and name/category are clean", () => {
    const p = makeInterpretiveCandidate({
      name: "Riverside Cafe",
      category: "restaurant",
      summary: "A lively corner cafe opened in the nineteen eighties.",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("ok");
  });

  it("takes INTERPRETIVE_OVERLAY via discoveryClass over looksInterpretive check", () => {
    // A place that would NOT match looksInterpretive on its own but has
    // discoveryClass=INTERPRETIVE_OVERLAY must still be rejected.
    const p = makeInterpretiveCandidate({
      name: "Corner Pharmacy",
      category: "pharmacy",
      discoveryClass: "INTERPRETIVE_OVERLAY",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("allows a VERIFIED_PLACE even if its name contains 'tunnel'", () => {
    // discoveryClass is set → skip looksInterpretive, trust the server classification.
    const p = makeInterpretiveCandidate({
      name: "Tunnel Theatre",
      discoveryClass: "VERIFIED_PLACE",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("ok");
  });
});

describe("evaluateEligibility — lowQuality (Tier 4 suppression)", () => {
  it("rejects a Tier-4 place with reason lowQuality", () => {
    const p = makePlace("p1", 30, 0, { discoveryTier: 4 });
    const result = evaluateEligibility([p], baseState());
    expect(result.eligibleIds).toEqual([]);
    expect(result.evaluations[0].reason).toBe("lowQuality");
  });

  it("includes discoveryRejectionReason in the evaluation when reason is lowQuality", () => {
    const p = makePlace("p1", 30, 0, {
      discoveryTier: 4,
      discoveryRejectionReason: "noHistoricalDepth",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("lowQuality");
    expect(result.evaluations[0].discoveryRejectionReason).toBe(
      "noHistoricalDepth",
    );
  });

  it("discoveryRejectionReason is undefined in evaluation when reason is not lowQuality", () => {
    // A Tier-1 place should be eligible; evaluation discoveryRejectionReason must be absent.
    const p = makePlace("p1", 30, 0, { discoveryTier: 1 });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("ok");
    expect(result.evaluations[0].discoveryRejectionReason).toBeUndefined();
  });

  it("Tier-1 place is not suppressed", () => {
    const p = makePlace("p1", 30, 0, { discoveryTier: 1 });
    const result = evaluateEligibility([p], baseState());
    expect(result.eligibleIds).toEqual(["p1"]);
  });

  it("Tier-2 place is not suppressed", () => {
    const p = makePlace("p1", 30, 0, { discoveryTier: 2 });
    const result = evaluateEligibility([p], baseState());
    expect(result.eligibleIds).toEqual(["p1"]);
  });

  it("Tier-3 place is not suppressed", () => {
    const p = makePlace("p1", 30, 0, { discoveryTier: 3 });
    const result = evaluateEligibility([p], baseState());
    expect(result.eligibleIds).toEqual(["p1"]);
  });

  it("place with no discoveryTier is not suppressed by lowQuality", () => {
    const p = makePlace("p1", 30, 0);
    // discoveryTier not set → no lowQuality rejection
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("ok");
  });

  it("narrated takes precedence over lowQuality", () => {
    // A Tier-4 place that was already narrated should show 'narrated', not 'lowQuality'.
    const narrated = new Map<string, number>([["p1", Date.now()]]);
    const p = makePlace("p1", 30, 0, { discoveryTier: 4 });
    const result = evaluateEligibility(
      [p],
      baseState({ narratedIds: narrated }),
    );
    expect(result.evaluations[0].reason).toBe("narrated");
  });

  it("interpretiveOverlay takes precedence over lowQuality", () => {
    // A place that is both INTERPRETIVE_OVERLAY and Tier 4 → interpretiveOverlay wins.
    const p = makePlace("p1", 30, 0, {
      discoveryTier: 4,
      discoveryClass: "INTERPRETIVE_OVERLAY",
    });
    const result = evaluateEligibility([p], baseState());
    expect(result.evaluations[0].reason).toBe("interpretiveOverlay");
  });

  it("Tier-4 place behind 90° is still lowQuality (lowQuality evaluated before behind90)", () => {
    // heading=0, place is due south (180° bearing) → bearingDiff ≈ 180°.
    // With velocityHeadingFresh=true, behind90 would normally apply.
    // But lowQuality fires first → should see lowQuality, not behind90.
    const p = makePlace("p1", 0, -50, { discoveryTier: 4 }); // south of user
    const result = evaluateEligibility(
      [p],
      baseState({ heading: 0, velocityHeadingFresh: true }),
    );
    expect(result.evaluations[0].reason).toBe("lowQuality");
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
