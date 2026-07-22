import {
  evaluateEligibility,
  type EligibilityCandidate,
  type EligibilityState,
} from "../lib/walkEligibility";
import { filterFailureBackoff } from "../lib/walkFailureBackoff";

const BACKOFF_MS = 60_000;

describe("filterFailureBackoff", () => {
  it("excludes a candidate whose failure timestamp has not yet expired", () => {
    const now = 1_000_000;
    const failedFetch = new Map<string, number>([["p1", now - 10_000]]);

    const result = filterFailureBackoff(["p1"], failedFetch, now, BACKOFF_MS);

    expect(result.eligibleIds).toEqual([]);
    expect(result.backedOff).toEqual([{ id: "p1" }]);
  });

  it("re-includes a candidate once the backoff window has elapsed", () => {
    const now = 1_000_000;
    const failedFetch = new Map<string, number>([["p1", now - BACKOFF_MS - 1]]);

    const result = filterFailureBackoff(["p1"], failedFetch, now, BACKOFF_MS);

    expect(result.eligibleIds).toEqual(["p1"]);
    expect(result.backedOff).toEqual([]);
  });

  it("does not suppress a different eligible candidate while one is backed off", () => {
    const now = 1_000_000;
    const failedFetch = new Map<string, number>([["p1", now - 10_000]]);

    const result = filterFailureBackoff(
      ["p1", "p2"],
      failedFetch,
      now,
      BACKOFF_MS,
    );

    expect(result.eligibleIds).toEqual(["p2"]);
    expect(result.backedOff).toEqual([{ id: "p1" }]);
  });

  it("treats an id with no failure history as always eligible", () => {
    const now = 1_000_000;
    const failedFetch = new Map<string, number>();

    const result = filterFailureBackoff(["p1"], failedFetch, now, BACKOFF_MS);

    expect(result.eligibleIds).toEqual(["p1"]);
    expect(result.backedOff).toEqual([]);
  });

  it("clearing the failure map (as startWalk does) restores eligibility immediately", () => {
    const now = 1_000_000;
    // Simulate WalkModeContext.startWalk() resetting failedFetchRef.current
    // to a fresh Map at the beginning of a new walk session, before any
    // backoff window on the previous session's failure would have expired.
    const freshSessionFailedFetch = new Map<string, number>();

    const result = filterFailureBackoff(
      ["p1"],
      freshSessionFailedFetch,
      now,
      BACKOFF_MS,
    );

    expect(result.eligibleIds).toEqual(["p1"]);
    expect(result.backedOff).toEqual([]);
  });
});

/**
 * Regression coverage for the overlay/pickNext desync fixed in
 * WalkModeContext.tsx's diagnostic-snapshot block: that code used to
 * re-derive "eligible" candidates with its own hand-rolled filter that never
 * checked discoveryTier or failure backoff, so the debug overlay could show
 * a place as eligible ("Eligible N" / "Top candidates") that pickNext had
 * already correctly excluded via `evaluateEligibility` +
 * `filterFailureBackoff`, producing a contradictory "Gate:
 * noEligibleCandidate" alongside a populated Top-candidates list.
 *
 * The fix removed the overlay's separate filter entirely and made it reuse
 * `eligibleSet` — the literal output of composing these two pure functions,
 * the same way pickNext does at contexts/WalkModeContext.tsx around lines
 * 1874-1971. Since the overlay no longer contains any eligibility logic of
 * its own, proving this composed pipeline correctly excludes Tier-4 and
 * backed-off candidates is sufficient to prove overlay/production agreement
 * for these cases — there is no separate implementation left to diverge.
 */
describe("evaluateEligibility + filterFailureBackoff composition (mirrors pickNext's eligibleSet, now also the overlay's candidate source)", () => {
  const NYC = { latitude: 40.7589, longitude: -73.9851 };

  function makePlace(
    id: string,
    extras: Partial<EligibilityCandidate> = {},
  ): EligibilityCandidate {
    return {
      id,
      name: id,
      latitude: NYC.latitude,
      longitude: NYC.longitude,
      netScore: 5,
      ...extras,
    };
  }

  function eligibleSetFor(
    pool: EligibilityCandidate[],
    state: EligibilityState,
    failedFetch: Map<string, number>,
    now: number,
  ): Set<string> {
    const { eligibleIds } = evaluateEligibility(pool, state);
    const { eligibleIds: finalEligibleIds } = filterFailureBackoff(
      eligibleIds,
      failedFetch,
      now,
      BACKOFF_MS,
    );
    return new Set(finalEligibleIds);
  }

  const baseState: EligibilityState = {
    loc: NYC,
    heading: null,
    velocityHeadingFresh: false,
    narratedIds: new Map(),
    cfg: { maxQueueDistance: 90, netScoreFloor: 0 },
  };

  it("excludes a Tier-4 candidate even though it would otherwise pass distance/score checks", () => {
    const pool = [
      makePlace("genuine"),
      makePlace("metadataOnly", { discoveryTier: 4 }),
    ];
    const eligible = eligibleSetFor(pool, baseState, new Map(), Date.now());
    expect(eligible.has("genuine")).toBe(true);
    expect(eligible.has("metadataOnly")).toBe(false);
  });

  it("excludes a candidate currently in narration-failure backoff even though evaluateEligibility alone would pass it", () => {
    const pool = [makePlace("genuine"), makePlace("recentlyFailed")];
    const now = 1_000_000;
    const failedFetch = new Map<string, number>([
      ["recentlyFailed", now - 10_000], // well within BACKOFF_MS
    ]);
    const eligible = eligibleSetFor(pool, baseState, failedFetch, now);
    expect(eligible.has("genuine")).toBe(true);
    expect(eligible.has("recentlyFailed")).toBe(false);
  });

  it("excludes a candidate that is both Tier-4 AND backed off (belt-and-suspenders, not double-counted)", () => {
    const pool = [
      makePlace("genuine"),
      makePlace("both", { discoveryTier: 4 }),
    ];
    const now = 1_000_000;
    const failedFetch = new Map<string, number>([["both", now - 10_000]]);
    const eligible = eligibleSetFor(pool, baseState, failedFetch, now);
    expect(eligible.has("genuine")).toBe(true);
    expect(eligible.has("both")).toBe(false);
  });
});
