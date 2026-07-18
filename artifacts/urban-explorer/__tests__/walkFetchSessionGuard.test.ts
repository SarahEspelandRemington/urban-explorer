import { isLiveFetchStale } from "../lib/walkFetchSessionGuard";

describe("isLiveFetchStale", () => {
  it("is not stale when the walk is still running and the generation matches", () => {
    expect(isLiveFetchStale(true, 1, 1)).toBe(false);
  });

  it("is stale when the walk has stopped outright (no new walk started)", () => {
    // Existing no-walk-running cancellation case: isWalkingNow is false and
    // the generation never advanced (no startWalk() happened yet).
    expect(isLiveFetchStale(false, 1, 1)).toBe(true);
  });

  it("is stale when a new walk has started (generation advanced) even though isWalkingNow is true again", () => {
    // Walk-1's fetch captured generation 1; Walk-2's startWalk() has since
    // bumped the generation to 2. isWalkingRef.current is true again (Walk-2
    // is active), so the boolean alone can't detect this — the generation
    // comparison is what catches it.
    expect(isLiveFetchStale(true, 2, 1)).toBe(true);
  });

  it("is stale when both the walk stopped and a later walk started", () => {
    expect(isLiveFetchStale(true, 3, 1)).toBe(true);
  });
});

// The two flows below mirror the exact guard usage in
// WalkModeContext.tsx's fetchNarration continuation, without mounting the
// full provider: each simulates Walk-1's fetch resolving after Walk-2 has
// already started (isWalkingNow=true, but currentGeneration has advanced
// past the fetch's captured generation).
describe("isLiveFetchStale — guarding fetchNarration's post-await mutations", () => {
  it("stale-session failure cannot add backoff or alter narrated state in the new walk", () => {
    // Walk-2 has already marked "p1" as narrated and has a fresh, empty
    // backoff map when Walk-1's failed fetch for "p1" resolves.
    const narratedIds = new Map<string, number>([["p1", 111]]);
    const failedFetch = new Map<string, number>();
    const myGeneration = 1;
    const currentGeneration = 2;
    const isWalkingNow = true;

    if (!isLiveFetchStale(isWalkingNow, currentGeneration, myGeneration)) {
      narratedIds.delete("p1");
      failedFetch.set("p1", Date.now());
    }

    expect(narratedIds.has("p1")).toBe(true);
    expect(failedFetch.has("p1")).toBe(false);
  });

  it("stale-session success cannot enqueue narration or clear new-walk backoff state", () => {
    // Walk-2 has already backed "p1" off (a Walk-2 fetch for it failed
    // earlier) when Walk-1's stale success for "p1" resolves.
    const failedFetch = new Map<string, number>([["p1", 222]]);
    let enqueued = false;

    const myGeneration = 1;
    const currentGeneration = 2;
    const isWalkingNow = true;

    if (isLiveFetchStale(isWalkingNow, currentGeneration, myGeneration)) {
      // cancelled path: discard the payload, no mutation, no enqueue.
    } else {
      failedFetch.delete("p1");
      enqueued = true;
    }

    expect(failedFetch.has("p1")).toBe(true);
    expect(enqueued).toBe(false);
  });
});
