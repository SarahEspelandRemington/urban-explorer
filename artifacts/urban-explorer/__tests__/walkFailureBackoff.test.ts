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
