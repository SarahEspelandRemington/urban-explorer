/**
 * Walk Mode start/stop stress tests
 *
 * Guards against three classes of session-handoff regressions:
 *
 *  1. CAS callback ghost state — lib/walkSessionManager: rapid stop/start
 *     sequences must never leave activeLocationCallback pointing to a stale
 *     handler or set to null when a newer session has already installed its
 *     callback.
 *
 *  2. Walk-stop ordering — stopWalk must set isWalkingRef.current = false
 *     synchronously before narration.stop() so no late React effect can act
 *     as if the walk were still active after it ends.
 *
 *  3. Paths.cache guard — lib/fetchNarrationPayload: when
 *     writeNarrationAudioToCache throws (bad Paths.cache, disk full, etc.),
 *     the function must catch the error and fall through to the text narration
 *     endpoint rather than propagating the throw.
 */

// ─── Test group 1: walkSessionManager CAS ────────────────────────────────────
//
// Tests import lib/walkSessionManager directly — the module that WalkModeContext
// delegates to for activeLocationCallback management.  A regression (e.g.
// removing the CAS guard from installSessionCallback) will fail these tests.

import {
  installSessionCallback,
  dispatchLocation,
  getActiveCallback,
  _resetForTest,
} from "../lib/walkSessionManager";

describe("walkSessionManager — CAS callback, no ghost state", () => {
  beforeEach(() => _resetForTest());
  afterEach(() => _resetForTest());

  test("active callback is null before any session starts", () => {
    expect(getActiveCallback()).toBeNull();
  });

  test("installSessionCallback installs the callback", () => {
    const cb = jest.fn();
    installSessionCallback(cb);
    expect(getActiveCallback()).toBe(cb);
  });

  test("stop() clears the callback when no newer session is active", () => {
    const cb = jest.fn();
    const session = installSessionCallback(cb);
    session.stop();
    expect(getActiveCallback()).toBeNull();
  });

  test("late stop() from old session does NOT clear new session's callback", () => {
    const cbA = jest.fn();
    const cbB = jest.fn();
    const sessionA = installSessionCallback(cbA);
    installSessionCallback(cbB);

    sessionA.stop();

    expect(getActiveCallback()).toBe(cbB);
    expect(getActiveCallback()).not.toBeNull();
  });

  test("rapid stop/start/stop: callback is null after last stop", () => {
    const cbA = jest.fn();
    const sA = installSessionCallback(cbA);
    sA.stop();
    expect(getActiveCallback()).toBeNull();

    const cbB = jest.fn();
    const sB = installSessionCallback(cbB);
    sB.stop();
    expect(getActiveCallback()).toBeNull();
  });

  test("triple start — two late stops leave the third session active", () => {
    const cbA = jest.fn();
    const cbB = jest.fn();
    const cbC = jest.fn();
    const sA = installSessionCallback(cbA);
    const sB = installSessionCallback(cbB);
    const sC = installSessionCallback(cbC);

    sA.stop();
    expect(getActiveCallback()).toBe(cbC);

    sB.stop();
    expect(getActiveCallback()).toBe(cbC);

    sC.stop();
    expect(getActiveCallback()).toBeNull();
  });

  test("dispatchLocation forwards to the active callback", () => {
    const cb = jest.fn();
    installSessionCallback(cb);
    const fakeLoc = {
      coords: {
        latitude: 51.5,
        longitude: -0.1,
        altitude: 0,
        accuracy: 5,
        altitudeAccuracy: 5,
        heading: 0,
        speed: 0,
      },
      timestamp: Date.now(),
    } as Parameters<typeof dispatchLocation>[0];
    dispatchLocation(fakeLoc);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(fakeLoc);
  });

  test("dispatchLocation is a no-op after session.stop()", () => {
    const cb = jest.fn();
    const session = installSessionCallback(cb);
    session.stop();
    const fakeLoc = {
      coords: {
        latitude: 51.5,
        longitude: -0.1,
        altitude: 0,
        accuracy: 5,
        altitudeAccuracy: 5,
        heading: 0,
        speed: 0,
      },
      timestamp: Date.now(),
    } as Parameters<typeof dispatchLocation>[0];
    dispatchLocation(fakeLoc);
    expect(cb).not.toHaveBeenCalled();
  });

  test("dispatchLocation goes to new session after old session stops", () => {
    const cbA = jest.fn();
    const cbB = jest.fn();
    const sA = installSessionCallback(cbA);
    installSessionCallback(cbB);
    sA.stop();
    const fakeLoc = {
      coords: {
        latitude: 51.5,
        longitude: -0.1,
        altitude: 0,
        accuracy: 5,
        altitudeAccuracy: 5,
        heading: 0,
        speed: 0,
      },
      timestamp: Date.now(),
    } as Parameters<typeof dispatchLocation>[0];
    dispatchLocation(fakeLoc);
    expect(cbB).toHaveBeenCalledTimes(1);
    expect(cbA).not.toHaveBeenCalled();
  });
});

// ─── Test group 2: walk-stop ordering — real executeStopWalkSync ─────────────
//
// lib/walkStopSession.ts#executeStopWalkSync is the production utility that
// WalkModeContext.stopWalk delegates to. These tests exercise the REAL
// function and will fail if anyone reorders isWalkingRef vs narrationStop.
//
// Lock-screen cleanup is no longer a separate step here — it's owned by
// narration.stop() -> teardownActive() -> player.setActiveForLockScreen(false)
// in useNarration.ts, so there's nothing further to assert about it at this
// layer.

import { executeStopWalkSync } from "../lib/walkStopSession";

describe("executeStopWalkSync (walk-stop ordering guard)", () => {
  function buildDeps() {
    const callOrder: string[] = [];
    return {
      callOrder,
      isWalkingRef: { current: true },
      narrationStop: jest.fn(() => {
        callOrder.push("narration.stop");
      }),
    };
  }

  test("sets isWalkingRef.current to false", () => {
    const deps = buildDeps();
    executeStopWalkSync(deps);
    expect(deps.isWalkingRef.current).toBe(false);
  });

  test("isWalkingRef is false before narrationStop() runs", () => {
    const deps = buildDeps();
    let refAtStopTime: boolean | null = null;
    deps.narrationStop.mockImplementation(() => {
      deps.callOrder.push("narration.stop");
      refAtStopTime = deps.isWalkingRef.current;
    });

    executeStopWalkSync(deps);

    expect(refAtStopTime).toBe(false);
  });

  test("narrationStop() is called exactly once", () => {
    const deps = buildDeps();
    executeStopWalkSync(deps);
    expect(deps.narrationStop).toHaveBeenCalledTimes(1);
  });

  test("late effect guarded by isWalkingRef is a no-op after stop", () => {
    const deps = buildDeps();
    const calls: string[] = [];

    executeStopWalkSync(deps);

    function lateEffect(isWalkingRef: { current: boolean }) {
      if (!isWalkingRef.current) return;
      calls.push("late-effect-ran");
    }

    lateEffect(deps.isWalkingRef);
    expect(calls).toHaveLength(0);
  });
});

// ─── Test group 3: fetchNarrationPayload — Paths.cache fallback ───────────────
//
// lib/fetchNarrationPayload.ts wraps writeNarrationAudioToCache in a try/catch.
// Tests verify the throw is caught and the function falls through to the text
// endpoint, returning { kind: "text" } rather than propagating the error.

jest.mock("../lib/walkAudioCache", () => ({
  writeNarrationAudioToCache: jest.fn(),
}));
jest.mock("../lib/apiToken", () => ({
  authHeaders: jest.fn(async () => ({})),
}));
jest.mock("../lib/sentryWalk", () => ({
  addWalkBreadcrumb: jest.fn(),
  trackNarrationFallback: jest.fn(),
}));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as typeof fetch;

describe("fetchNarrationPayload — graceful text fallback when Paths.cache is bad", () => {
  const mockPlace = {
    id: "place-abc",
    name: "Old Town Hall",
    category: "historic",
    summary: "Built in 1887.",
    facts: ["It was the first civic building in the district."],
  };
  const mockPlaceMultiFact = {
    id: "place-def",
    name: "Bergdoll-Kemble Mansion",
    category: "historic",
    summary: "Built in 1886 as residence of Louis Bergdoll family.",
    facts: [
      "Built in 1886 as residence of Louis Bergdoll family.",
      "Features include mahogany woodwork.",
      "Site of the 1920 apprehension of Grover Cleveland Bergdoll.",
      "Fourth fact beyond the cap that should be dropped.",
    ],
  };
  const OPTS = { apiBase: "https://test.example.com", isExpoGo: false };

  function audioFetch(byteLength = 16) {
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(byteLength) };
  }

  function textFetch(narration = "A wonderful building.") {
    return { ok: true, json: async () => ({ narration }) };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns text payload when writeNarrationAudioToCache throws (bad Paths.cache)", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as {
      writeNarrationAudioToCache: jest.Mock;
    };
    writeNarrationAudioToCache.mockImplementation(() => {
      throw new TypeError("Paths.cache is undefined");
    });
    mockFetch
      .mockResolvedValueOnce(audioFetch(16))
      .mockResolvedValueOnce(textFetch("An old town hall."));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const result = await fetchNarrationPayload(mockPlace, OPTS);
    expect(result).toEqual({ kind: "text", text: "An old town hall." });
  });

  test("does not throw when writeNarrationAudioToCache throws (error is swallowed)", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as {
      writeNarrationAudioToCache: jest.Mock;
    };
    writeNarrationAudioToCache.mockImplementation(() => {
      throw new Error("disk full");
    });
    mockFetch
      .mockResolvedValueOnce(audioFetch(8))
      .mockResolvedValueOnce(textFetch("Fallback narration."));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    await expect(fetchNarrationPayload(mockPlace, OPTS)).resolves.not.toThrow();
  });

  test("returns audio payload when writeNarrationAudioToCache succeeds", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as {
      writeNarrationAudioToCache: jest.Mock;
    };
    const mockCleanup = jest.fn();
    writeNarrationAudioToCache.mockReturnValue({
      uri: "file:///cache/walk-narr-abc.mp3",
      cleanup: mockCleanup,
    });
    mockFetch.mockResolvedValueOnce(audioFetch(16));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const result = await fetchNarrationPayload(mockPlace, OPTS);
    expect(result).toEqual({
      kind: "audio",
      audioUri: "file:///cache/walk-narr-abc.mp3",
      cleanup: mockCleanup,
    });
  });

  test("returns null when audio buffer is empty AND text endpoint fails", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as {
      writeNarrationAudioToCache: jest.Mock;
    };
    writeNarrationAudioToCache.mockReturnValue(null);
    mockFetch
      .mockResolvedValueOnce(audioFetch(0))
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const result = await fetchNarrationPayload(mockPlace, OPTS);
    expect(result).toBeNull();
  });

  test("skips audio endpoint entirely when isExpoGo=true, returns text", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as {
      writeNarrationAudioToCache: jest.Mock;
    };
    mockFetch.mockResolvedValueOnce(textFetch("Expo Go narration."));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const result = await fetchNarrationPayload(mockPlace, {
      ...OPTS,
      isExpoGo: true,
    });
    expect(result).toEqual({ kind: "text", text: "Expo Go narration." });
    expect(writeNarrationAudioToCache).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("trackNarrationFallback called with 'write_failure' when cache write throws", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as {
      writeNarrationAudioToCache: jest.Mock;
    };
    writeNarrationAudioToCache.mockImplementation(() => {
      throw new TypeError("Paths.cache is null");
    });
    mockFetch
      .mockResolvedValueOnce(audioFetch(8))
      .mockResolvedValueOnce(textFetch("Fallback."));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const { trackNarrationFallback } = require("../lib/sentryWalk");
    await fetchNarrationPayload(mockPlace, OPTS);
    expect(trackNarrationFallback).toHaveBeenCalledWith("write_failure");
  });

  test("sends all facts (bounded to 3) to the narration endpoint, not just facts[0]", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as {
      writeNarrationAudioToCache: jest.Mock;
    };
    writeNarrationAudioToCache.mockReturnValue(null);
    mockFetch
      .mockResolvedValueOnce(audioFetch(16))
      .mockResolvedValueOnce(textFetch("The Bergdoll-Kemble Mansion."));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    await fetchNarrationPayload(mockPlaceMultiFact, OPTS);

    const textCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(textCallBody.facts).toEqual([
      "Built in 1886 as residence of Louis Bergdoll family.",
      "Features include mahogany woodwork.",
      "Site of the 1920 apprehension of Grover Cleveland Bergdoll.",
    ]);
    expect(textCallBody.fact).toBeUndefined();
  });
});

// ─── Test group 4: narration prefetch pipeline race-condition guards ─────────
//
// lib/narrationPrefetchPipeline.ts holds the orchestration that
// WalkModeContext delegates to for prefetched narration handling. These
// tests stress the three race-condition guards documented in that file:
//
//   1. STALE DISCARD     — fetchNarration consumes a cached entry for a
//                          DIFFERENT place than the one being narrated; the
//                          stale audio's cleanup must fire before the fresh
//                          fetch runs.
//   2. STOP-WALK GUARD   — runPrefetchCycle resolves AFTER stopWalk flipped
//                          isWalkingRef to false; the resolved payload must
//                          NOT be cached and any audio temp file must be
//                          cleaned up.
//   3. IN-FLIGHT DEDUPE  — multiple synchronous calls to runPrefetchCycle
//                          for the SAME candidate must collapse into a
//                          single fetchPayload invocation.

import {
  consumePrefetchedNarration,
  createStalePrefetchPool,
  disposeStalePrefetchPool,
  emptyPrefetchCounters,
  parkStalePrefetchedEntry,
  reviveStalePrefetchedEntry,
  runPrefetchCycle,
  type NarrationPayload,
  type PrefetchCounters,
  type PrefetchEntry,
  type PrefetchEvent,
  type StalePrefetchPool,
} from "../lib/narrationPrefetchPipeline";

interface StressPlace {
  id: string;
  name: string;
}

interface PipelineState {
  isWalkingRef: { current: boolean };
  narratedIdsRef: { current: Map<string, number> };
  prefetchedNarrationRef: { current: PrefetchEntry<StressPlace> | null };
  prefetchInFlightRef: { current: string | null };
  placesRef: { current: StressPlace[] };
  counters: PrefetchCounters;
  onEvent: (event: PrefetchEvent) => void;
}

function buildPipelineState(places: StressPlace[]): PipelineState {
  const counters = emptyPrefetchCounters();
  return {
    isWalkingRef: { current: true },
    narratedIdsRef: { current: new Map<string, number>() },
    prefetchedNarrationRef: { current: null },
    prefetchInFlightRef: { current: null },
    placesRef: { current: places },
    counters,
    onEvent: (event: PrefetchEvent) => {
      counters[event] += 1;
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("narration prefetch pipeline — race-condition guards", () => {
  // --- Guard 1: STALE DISCARD --------------------------------------------

  describe("stale prefetch discard (fetchNarration for a different place)", () => {
    test("consumePrefetchedNarration calls cleanup on stale audio and returns miss", () => {
      const staleCleanup = jest.fn();
      const stale: PrefetchEntry<StressPlace> = {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: staleCleanup,
        },
      };
      const events: PrefetchEvent[] = [];

      const result = consumePrefetchedNarration(
        stale,
        "place-B",
        undefined,
        (e) => events.push(e),
      );

      expect(result.kind).toBe("miss");
      expect(staleCleanup).toHaveBeenCalledTimes(1);
      // consumePrefetchedNarration emits two events here on purpose:
      //   1. STALE_DISCARD — the mismatched live entry was thrown away
      //   2. MISS          — there's no usable payload for the requested place
      // Both are meaningful in the prefetch dashboard (discards and misses are
      // separate counters), so we assert the full sequence to keep this test
      // honest about what the pipeline actually reports. See emit sites in
      // narrationPrefetchPipeline.ts (~lines 408 and 422).
      expect(events).toEqual(["STALE_DISCARD", "MISS"]);
    });

    test("stale text payload is dropped without cleanup (no temp file to delete)", () => {
      const stale: PrefetchEntry<StressPlace> = {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: { kind: "text", text: "Old narration" },
      };

      // Just verifies no throw and miss returned.
      const result = consumePrefetchedNarration(stale, "place-B");
      expect(result.kind).toBe("miss");
    });

    test("matching prefetch returns hit and does NOT call cleanup", () => {
      const cleanup = jest.fn();
      const cached: PrefetchEntry<StressPlace> = {
        placeId: "place-B",
        place: { id: "place-B", name: "B" },
        payload: { kind: "audio", audioUri: "file:///tmp/B.mp3", cleanup },
      };
      const events: PrefetchEvent[] = [];

      const result = consumePrefetchedNarration(
        cached,
        "place-B",
        undefined,
        (e) => events.push(e),
      );

      expect(result.kind).toBe("hit");
      if (result.kind === "hit") {
        expect(result.entry.payload).toEqual(cached.payload);
        // Live prefetch path: this is the normal first-time-narration fast
        // path, not a replay. The UI uses source="live" to suppress the
        // "Replay" badge.
        expect(result.source).toBe("live");
      }
      expect(cleanup).not.toHaveBeenCalled();
      expect(events).toEqual(["HIT"]);
    });

    test("null cache returns miss without throwing", () => {
      const events: PrefetchEvent[] = [];
      expect(() =>
        consumePrefetchedNarration(null, "place-X", undefined, (e) =>
          events.push(e),
        ),
      ).not.toThrow();
      expect(
        consumePrefetchedNarration(null, "place-X", undefined, (e) =>
          events.push(e),
        ).kind,
      ).toBe("miss");
      expect(events).toEqual(["MISS", "MISS"]);
    });

    test("onEvent is optional — omitting it does not throw", () => {
      expect(() => consumePrefetchedNarration(null, "place-X")).not.toThrow();
      const stale: PrefetchEntry<StressPlace> = {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: { kind: "text", text: "old" },
      };
      expect(() => consumePrefetchedNarration(stale, "place-B")).not.toThrow();
    });

    test("onEvent throw is swallowed so a buggy telemetry sink can never break the consumer", () => {
      const stale: PrefetchEntry<StressPlace> = {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: { kind: "text", text: "old" },
      };
      const onEvent = () => {
        throw new Error("sentry exploded");
      };
      expect(() =>
        consumePrefetchedNarration(stale, "place-B", undefined, onEvent),
      ).not.toThrow();
      expect(() =>
        consumePrefetchedNarration(null, "place-X", undefined, onEvent),
      ).not.toThrow();
    });

    test("cleanup throw is swallowed so the consumer can continue", () => {
      const stale: PrefetchEntry<StressPlace> = {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: () => {
            throw new Error("fs error");
          },
        },
      };

      expect(() => consumePrefetchedNarration(stale, "place-B")).not.toThrow();
    });
  });

  // --- Guard 1 (continued): runPrefetchCycle clears stale on overwrite ----

  test("runPrefetchCycle calls stale audio cleanup before caching new candidate", async () => {
    const staleCleanup = jest.fn();
    const places: StressPlace[] = [{ id: "place-B", name: "B" }];
    const state = buildPipelineState(places);
    state.prefetchedNarrationRef.current = {
      placeId: "place-A",
      place: { id: "place-A", name: "A" },
      payload: {
        kind: "audio",
        audioUri: "file:///tmp/A.mp3",
        cleanup: staleCleanup,
      },
    };

    const fetchPayload = jest.fn(
      async (): Promise<NarrationPayload> => ({
        kind: "audio",
        audioUri: "file:///tmp/B.mp3",
        cleanup: jest.fn(),
      }),
    );

    await runPrefetchCycle({
      ...state,
      pickNext: () => places[0],
      fetchPayload,
    });

    expect(staleCleanup).toHaveBeenCalledTimes(1);
    expect(state.prefetchedNarrationRef.current?.placeId).toBe("place-B");
    // Overwriting a stale entry should be visible in the telemetry counters
    // so we can spot a regression where the stale-clear branch silently
    // stops firing (e.g. someone refactored the guard out).
    expect(state.counters.STALE_DISCARD).toBe(1);
  });

  // --- Guard 2: STOP-WALK GUARD ------------------------------------------

  describe("stop-walk guard during in-flight prefetch", () => {
    test("payload is NOT cached and audio cleanup fires when stopWalk runs mid-flight", async () => {
      const places: StressPlace[] = [{ id: "place-X", name: "X" }];
      const state = buildPipelineState(places);
      const audioCleanup = jest.fn();
      const gate = deferred<NarrationPayload>();

      const fetchPayload = jest.fn(() => gate.promise);
      const cycle = runPrefetchCycle({
        ...state,
        pickNext: () => places[0],
        fetchPayload,
      });

      // Marker is set while in flight.
      expect(state.prefetchInFlightRef.current).toBe("place-X");

      // Simulate stopWalk: flip isWalkingRef before the fetch resolves.
      state.isWalkingRef.current = false;

      // Now resolve the fetch with an audio payload (so we can verify cleanup).
      gate.resolve({
        kind: "audio",
        audioUri: "file:///tmp/X.mp3",
        cleanup: audioCleanup,
      });
      await cycle;

      expect(audioCleanup).toHaveBeenCalledTimes(1);
      expect(state.prefetchedNarrationRef.current).toBeNull();
      // In-flight marker is cleared so a future cycle (e.g. next walk) can proceed.
      expect(state.prefetchInFlightRef.current).toBeNull();
      // Telemetry: the stop-walk discard must be visible so production
      // dashboards can spot regressions in the guard.
      expect(state.counters.STOP_WALK_DISCARD).toBe(1);
    });

    test("text payload is silently dropped when stopWalk runs mid-flight (no cleanup to fire)", async () => {
      const places: StressPlace[] = [{ id: "place-Y", name: "Y" }];
      const state = buildPipelineState(places);
      const gate = deferred<NarrationPayload>();
      const fetchPayload = jest.fn(() => gate.promise);

      const cycle = runPrefetchCycle({
        ...state,
        pickNext: () => places[0],
        fetchPayload,
      });

      state.isWalkingRef.current = false;
      gate.resolve({ kind: "text", text: "Late narration" });
      await cycle;

      expect(state.prefetchedNarrationRef.current).toBeNull();
    });

    test("payload that resolves AFTER place was already narrated is also discarded", async () => {
      const places: StressPlace[] = [{ id: "place-Z", name: "Z" }];
      const state = buildPipelineState(places);
      const audioCleanup = jest.fn();
      const gate = deferred<NarrationPayload>();
      const fetchPayload = jest.fn(() => gate.promise);

      const cycle = runPrefetchCycle({
        ...state,
        pickNext: () => places[0],
        fetchPayload,
      });

      // Simulate the user tapping Skip / a duplicate GPS tick narrating Z first.
      state.narratedIdsRef.current.set("place-Z", Date.now());

      gate.resolve({
        kind: "audio",
        audioUri: "file:///tmp/Z.mp3",
        cleanup: audioCleanup,
      });
      await cycle;

      expect(audioCleanup).toHaveBeenCalledTimes(1);
      expect(state.prefetchedNarrationRef.current).toBeNull();
    });

    test("runPrefetchCycle is a no-op when isWalkingRef is already false", () => {
      const places: StressPlace[] = [{ id: "place-Q", name: "Q" }];
      const state = buildPipelineState(places);
      state.isWalkingRef.current = false;
      const fetchPayload = jest.fn();
      const pickNext = jest.fn(() => places[0]);

      const result = runPrefetchCycle({
        ...state,
        pickNext,
        fetchPayload,
      });

      expect(result).toBeUndefined();
      expect(pickNext).not.toHaveBeenCalled();
      expect(fetchPayload).not.toHaveBeenCalled();
      expect(state.prefetchInFlightRef.current).toBeNull();
    });
  });

  // --- Guard 3: IN-FLIGHT DEDUPE ------------------------------------------

  describe("in-flight dedupe for the same candidate", () => {
    test("two synchronous calls for the same candidate fire fetchPayload exactly once", async () => {
      const places: StressPlace[] = [{ id: "place-D", name: "D" }];
      const state = buildPipelineState(places);
      const gate = deferred<NarrationPayload>();
      const fetchPayload = jest.fn(() => gate.promise);
      const pickNext = () => places[0];

      // First call kicks off the in-flight fetch.
      const firstCycle = runPrefetchCycle({ ...state, pickNext, fetchPayload });
      // Second call (e.g. another GPS tick) — must dedupe.
      const secondCycle = runPrefetchCycle({
        ...state,
        pickNext,
        fetchPayload,
      });

      expect(state.prefetchInFlightRef.current).toBe("place-D");
      expect(fetchPayload).toHaveBeenCalledTimes(1);
      // The deduped call returns undefined since it short-circuits.
      expect(secondCycle).toBeUndefined();
      // Telemetry: the dedupe should be counted exactly once.
      expect(state.counters.DEDUPE).toBe(1);

      gate.resolve({ kind: "text", text: "D narration" });
      await firstCycle;
      expect(state.prefetchInFlightRef.current).toBeNull();
      expect(state.prefetchedNarrationRef.current?.placeId).toBe("place-D");
    });

    test("rapid burst of calls collapses to a single fetch", async () => {
      const places: StressPlace[] = [{ id: "place-burst", name: "B" }];
      const state = buildPipelineState(places);
      const gate = deferred<NarrationPayload>();
      const fetchPayload = jest.fn(() => gate.promise);
      const pickNext = () => places[0];

      const cycles: (Promise<void> | undefined)[] = [];
      for (let i = 0; i < 25; i++) {
        cycles.push(runPrefetchCycle({ ...state, pickNext, fetchPayload }));
      }

      expect(fetchPayload).toHaveBeenCalledTimes(1);
      expect(cycles[0]).toBeInstanceOf(Promise);
      for (let i = 1; i < cycles.length; i++) {
        expect(cycles[i]).toBeUndefined();
      }
      // Telemetry: every collapsed call past the first should be a DEDUPE.
      expect(state.counters.DEDUPE).toBe(cycles.length - 1);

      gate.resolve({ kind: "text", text: "Burst narration" });
      await cycles[0];
    });

    test("cycle for candidate B does NOT dedupe against in-flight A", async () => {
      const places: StressPlace[] = [
        { id: "place-A", name: "A" },
        { id: "place-B", name: "B" },
      ];
      const state = buildPipelineState(places);
      const gateA = deferred<NarrationPayload>();
      const gateB = deferred<NarrationPayload>();
      const fetchPayload = jest.fn(
        async (place: StressPlace): Promise<NarrationPayload> => {
          return place.id === "place-A" ? gateA.promise : gateB.promise;
        },
      );

      // First cycle: candidate A is in flight.
      const cycleA = runPrefetchCycle({
        ...state,
        pickNext: () => places[0],
        fetchPayload,
      });
      expect(state.prefetchInFlightRef.current).toBe("place-A");

      // Second cycle for a different candidate (B) — dedupe must NOT trigger,
      // but pickNext returning B will overwrite the in-flight marker. This
      // mirrors the production behaviour: only same-candidate calls dedupe.
      const cycleB = runPrefetchCycle({
        ...state,
        pickNext: () => places[1],
        fetchPayload,
      });

      expect(fetchPayload).toHaveBeenCalledTimes(2);
      expect(cycleB).toBeInstanceOf(Promise);

      gateA.resolve({ kind: "text", text: "A" });
      gateB.resolve({ kind: "text", text: "B" });
      await Promise.all([cycleA, cycleB]);
    });

    test("after the in-flight fetch resolves, the next call can fire again", async () => {
      const places: StressPlace[] = [{ id: "place-R", name: "R" }];
      const state = buildPipelineState(places);
      const cacheRef = state.prefetchedNarrationRef;
      const fetchPayload = jest
        .fn<Promise<NarrationPayload>, [StressPlace]>()
        .mockResolvedValueOnce({ kind: "text", text: "first" })
        .mockResolvedValueOnce({ kind: "text", text: "second" });
      const pickNext = () => places[0];

      const first = runPrefetchCycle({ ...state, pickNext, fetchPayload });
      await first;
      expect(state.prefetchInFlightRef.current).toBeNull();
      expect(cacheRef.current?.placeId).toBe("place-R");

      // The next cycle short-circuits because R is already cached, NOT because
      // the in-flight marker is stuck. Clearing the cache should let it fetch
      // again — proving the marker really did clear on completion.
      const clearCache = () => {
        cacheRef.current = null;
      };
      clearCache();
      const second = runPrefetchCycle({ ...state, pickNext, fetchPayload });
      await second;
      expect(fetchPayload).toHaveBeenCalledTimes(2);
      expect(cacheRef.current?.placeId).toBe("place-R");
    });

    test("in-flight marker is cleared even when fetchPayload throws", async () => {
      const places: StressPlace[] = [{ id: "place-T", name: "T" }];
      const state = buildPipelineState(places);
      const fetchPayload = jest.fn(async (): Promise<NarrationPayload> => {
        throw new Error("network blew up");
      });

      const cycle = runPrefetchCycle({
        ...state,
        pickNext: () => places[0],
        fetchPayload,
      });
      await cycle;

      expect(state.prefetchInFlightRef.current).toBeNull();
      expect(state.prefetchedNarrationRef.current).toBeNull();
    });

    test("null payload (fetch returned nothing) does not poison the cache", async () => {
      const places: StressPlace[] = [{ id: "place-N", name: "N" }];
      const state = buildPipelineState(places);
      const fetchPayload = jest.fn(async () => null);

      const cycle = runPrefetchCycle({
        ...state,
        pickNext: () => places[0],
        fetchPayload,
      });
      await cycle;

      expect(state.prefetchedNarrationRef.current).toBeNull();
      expect(state.prefetchInFlightRef.current).toBeNull();
    });
  });

  // --- Guard 4: STALE-POOL REPLAY (skip then re-pick within TTL) ----------
  //
  // When the live cache holds A and we want to fetch B, the displaced A
  // payload is parked in a short-window stale pool instead of being deleted.
  // A subsequent re-pick of A within the TTL must replay that cached audio
  // without another fetchPayload call, while still cleaning up entries that
  // age out of the TTL.

  describe("stale-pool replay for skip-then-re-pick", () => {
    // Controllable clock and scheduler so TTL behaviour stays deterministic.
    function buildControlledPool<P extends StressPlace>(opts?: {
      ttlMs?: number;
    }): {
      pool: StalePrefetchPool<P>;
      advance: (ms: number) => void;
      pendingTimers: number;
    } {
      const state = { now: 1_000_000 };
      type Timer = { fireAt: number; fn: () => void; cancelled: boolean };
      const timers = new Set<Timer>();
      const pool = createStalePrefetchPool<P>({
        ttlMs: opts?.ttlMs ?? 30_000,
        now: () => state.now,
        schedule: (fn, ms) => {
          const t: Timer = { fireAt: state.now + ms, fn, cancelled: false };
          timers.add(t);
          return t;
        },
        cancel: (handle) => {
          const t = handle as Timer;
          t.cancelled = true;
          timers.delete(t);
        },
      });
      const handle = {
        pool,
        advance(ms: number) {
          state.now += ms;
          // Fire any due timers in chronological order, mirroring real
          // setTimeout semantics so the pool's auto-cleanup runs deterministically.
          let progress = true;
          while (progress) {
            progress = false;
            for (const t of [...timers]) {
              if (!t.cancelled && t.fireAt <= state.now) {
                timers.delete(t);
                t.fn();
                progress = true;
              }
            }
          }
        },
        get pendingTimers() {
          return timers.size;
        },
      };
      return handle;
    }

    test("re-pick within TTL replays cached audio without re-fetching", async () => {
      const places: StressPlace[] = [
        { id: "place-A", name: "A" },
        { id: "place-B", name: "B" },
      ];
      const state = buildPipelineState(places);
      const { pool } = buildControlledPool<StressPlace>();
      const aCleanup = jest.fn();
      const fetchPayload = jest.fn(
        async (place: StressPlace): Promise<NarrationPayload> => {
          if (place.id === "place-A") {
            return {
              kind: "audio",
              audioUri: "file:///tmp/A.mp3",
              cleanup: aCleanup,
            };
          }
          return {
            kind: "audio",
            audioUri: "file:///tmp/B.mp3",
            cleanup: jest.fn(),
          };
        },
      );

      // Cycle 1: prefetch A.
      let candidate: StressPlace = places[0];
      await runPrefetchCycle({
        ...state,
        pickNext: () => candidate,
        fetchPayload,
        stalePool: pool,
      });
      expect(state.prefetchedNarrationRef.current?.placeId).toBe("place-A");
      expect(fetchPayload).toHaveBeenCalledTimes(1);

      // Cycle 2: queue now picks B (skip simulated). Live A should be parked
      // in the stale pool, NOT cleaned up.
      candidate = places[1];
      await runPrefetchCycle({
        ...state,
        pickNext: () => candidate,
        fetchPayload,
        stalePool: pool,
      });
      expect(state.prefetchedNarrationRef.current?.placeId).toBe("place-B");
      expect(fetchPayload).toHaveBeenCalledTimes(2);
      expect(aCleanup).not.toHaveBeenCalled();
      expect(pool.map.has("place-A")).toBe(true);

      // Cycle 3: queue re-picks A within TTL. Should revive from pool, no new
      // fetch, B gets parked.
      candidate = places[0];
      const cycleResult = runPrefetchCycle({
        ...state,
        pickNext: () => candidate,
        fetchPayload,
        stalePool: pool,
      });
      expect(cycleResult).toBeUndefined();
      expect(fetchPayload).toHaveBeenCalledTimes(2);
      expect(state.prefetchedNarrationRef.current?.placeId).toBe("place-A");
      expect(aCleanup).not.toHaveBeenCalled();
      expect(pool.map.has("place-A")).toBe(false);
      expect(pool.map.has("place-B")).toBe(true);
    });

    test("consumePrefetchedNarration revives from pool when live cache is mismatched", () => {
      const { pool } = buildControlledPool<StressPlace>();
      const aCleanup = jest.fn();
      const aEntry: PrefetchEntry<StressPlace> = {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: aCleanup,
        },
      };
      // Simulate: A was just parked because B took the live slot.
      parkStalePrefetchedEntry(pool, aEntry);

      const liveB: PrefetchEntry<StressPlace> = {
        placeId: "place-B",
        place: { id: "place-B", name: "B" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/B.mp3",
          cleanup: jest.fn(),
        },
      };

      // Now fetchNarration is called for A while live cache holds B.
      const result = consumePrefetchedNarration(liveB, "place-A", pool);

      expect(result.kind).toBe("hit");
      if (result.kind === "hit") {
        expect(result.entry.placeId).toBe("place-A");
        expect(result.entry.payload).toEqual(aEntry.payload);
        // Genuine "skip + re-pick within TTL" replay path. UI uses
        // source="staleReplay" to surface the "Replay" badge.
        expect(result.source).toBe("staleReplay");
      }
      // A was revived (not cleaned up); B was parked in its place.
      expect(aCleanup).not.toHaveBeenCalled();
      expect(pool.map.has("place-A")).toBe(false);
      expect(pool.map.has("place-B")).toBe(true);
    });

    test("entries that age out past TTL are cleaned up by the scheduled timer", () => {
      const { pool, advance } = buildControlledPool<StressPlace>({
        ttlMs: 30_000,
      });
      const cleanup = jest.fn();
      const entry: PrefetchEntry<StressPlace> = {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: { kind: "audio", audioUri: "file:///tmp/A.mp3", cleanup },
      };

      parkStalePrefetchedEntry(pool, entry);
      expect(pool.map.has("place-A")).toBe(true);

      // 29 s in: still live, no cleanup yet.
      advance(29_000);
      expect(cleanup).not.toHaveBeenCalled();
      expect(pool.map.has("place-A")).toBe(true);

      // 30 s in: TTL fires, cleanup runs, entry is gone.
      advance(1_000);
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(pool.map.has("place-A")).toBe(false);
    });

    test("revive after TTL expiry is treated as miss and runs cleanup", () => {
      // This guards the case where the timer somehow hasn't fired yet but the
      // expiresAt timestamp says we're past the TTL — the revive path must
      // synchronously dispose of the entry rather than handing back stale audio.
      const noOp = () => {};
      const state = { now: 1_000_000 };
      const pool = createStalePrefetchPool<StressPlace>({
        ttlMs: 30_000,
        now: () => state.now,
        schedule: () => "noop-handle",
        cancel: noOp,
      });
      const cleanup = jest.fn();
      const entry: PrefetchEntry<StressPlace> = {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: { kind: "audio", audioUri: "file:///tmp/A.mp3", cleanup },
      };
      parkStalePrefetchedEntry(pool, entry);

      // Advance the clock past the TTL without firing any timer.
      state.now += 31_000;
      const revived = reviveStalePrefetchedEntry(pool, "place-A");

      expect(revived).toBeNull();
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(pool.map.has("place-A")).toBe(false);
    });

    test("disposeStalePrefetchPool runs cleanup on every pending entry", () => {
      const { pool, pendingTimers: _ignored } =
        buildControlledPool<StressPlace>();
      const aCleanup = jest.fn();
      const bCleanup = jest.fn();
      parkStalePrefetchedEntry(pool, {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: aCleanup,
        },
      });
      parkStalePrefetchedEntry(pool, {
        placeId: "place-B",
        place: { id: "place-B", name: "B" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/B.mp3",
          cleanup: bCleanup,
        },
      });

      disposeStalePrefetchPool(pool);

      expect(aCleanup).toHaveBeenCalledTimes(1);
      expect(bCleanup).toHaveBeenCalledTimes(1);
      expect(pool.map.size).toBe(0);
    });

    test("re-parking the same placeId cancels prior timer and cleans up the old entry", () => {
      const { pool, advance } = buildControlledPool<StressPlace>({
        ttlMs: 30_000,
      });
      const firstCleanup = jest.fn();
      const secondCleanup = jest.fn();

      parkStalePrefetchedEntry(pool, {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A1.mp3",
          cleanup: firstCleanup,
        },
      });
      // Re-park (e.g. a fresh fetch landed and was then displaced again).
      parkStalePrefetchedEntry(pool, {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A2.mp3",
          cleanup: secondCleanup,
        },
      });

      // First entry's cleanup ran when it was displaced.
      expect(firstCleanup).toHaveBeenCalledTimes(1);
      expect(secondCleanup).not.toHaveBeenCalled();

      // The first entry's timer must have been cancelled — only the second
      // timer should fire when the TTL elapses.
      advance(30_000);
      expect(firstCleanup).toHaveBeenCalledTimes(1);
      expect(secondCleanup).toHaveBeenCalledTimes(1);
      expect(pool.map.size).toBe(0);
    });

    test("onReplay fires with placeId + ageMs when the pool serves a re-pick", () => {
      const onReplay = jest.fn();
      const onEvict = jest.fn();
      const state = { now: 1_000_000 };
      const pool = createStalePrefetchPool<StressPlace>({
        ttlMs: 30_000,
        now: () => state.now,
        schedule: () => "noop-handle",
        cancel: () => {},
        onReplay,
        onEvict,
      });
      parkStalePrefetchedEntry(pool, {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: jest.fn(),
        },
      });

      // Re-pick happens 8s after parking — well within the TTL.
      state.now += 8_000;
      const revived = reviveStalePrefetchedEntry(pool, "place-A");

      expect(revived).not.toBeNull();
      expect(onReplay).toHaveBeenCalledTimes(1);
      expect(onReplay).toHaveBeenCalledWith({
        placeId: "place-A",
        ageMs: 8_000,
      });
      expect(onEvict).not.toHaveBeenCalled();
    });

    test("onEvict fires when the TTL timer ages an entry out without a replay", () => {
      const onReplay = jest.fn();
      const onEvict = jest.fn();
      const { pool, advance } = buildControlledPool<StressPlace>({
        ttlMs: 30_000,
      });
      pool.onReplay = onReplay;
      pool.onEvict = onEvict;

      parkStalePrefetchedEntry(pool, {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: jest.fn(),
        },
      });

      // Step past TTL — timer fires, eviction recorded.
      advance(30_000);

      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledWith({
        placeId: "place-A",
        ageMs: 30_000,
      });
      expect(onReplay).not.toHaveBeenCalled();
    });

    test("synchronous expiry in revive (timer hadn't fired yet) also counts as evict", () => {
      const onReplay = jest.fn();
      const onEvict = jest.fn();
      const state = { now: 1_000_000 };
      const pool = createStalePrefetchPool<StressPlace>({
        ttlMs: 30_000,
        now: () => state.now,
        schedule: () => "noop-handle",
        cancel: () => {},
        onReplay,
        onEvict,
      });
      parkStalePrefetchedEntry(pool, {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: jest.fn(),
        },
      });

      // Past the TTL, but the timer never ran — the synchronous-expiry
      // branch in reviveStalePrefetchedEntry must still emit an eviction.
      state.now += 31_000;
      const revived = reviveStalePrefetchedEntry(pool, "place-A");

      expect(revived).toBeNull();
      expect(onReplay).not.toHaveBeenCalled();
      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledWith({
        placeId: "place-A",
        ageMs: 31_000,
      });
    });

    test("re-park displacement and disposeStalePrefetchPool do NOT fire onEvict", () => {
      const onReplay = jest.fn();
      const onEvict = jest.fn();
      const { pool } = buildControlledPool<StressPlace>({ ttlMs: 30_000 });
      pool.onReplay = onReplay;
      pool.onEvict = onEvict;

      // Park, then re-park the same id — displacement is not an eviction.
      parkStalePrefetchedEntry(pool, {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A1.mp3",
          cleanup: jest.fn(),
        },
      });
      parkStalePrefetchedEntry(pool, {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A2.mp3",
          cleanup: jest.fn(),
        },
      });
      expect(onEvict).not.toHaveBeenCalled();

      // Park another and tear down — dispose is not an eviction either.
      parkStalePrefetchedEntry(pool, {
        placeId: "place-B",
        place: { id: "place-B", name: "B" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/B.mp3",
          cleanup: jest.fn(),
        },
      });
      disposeStalePrefetchPool(pool);
      expect(onEvict).not.toHaveBeenCalled();
      expect(onReplay).not.toHaveBeenCalled();
    });

    test("onReplay/onEvict throws are swallowed so the cache flow never breaks", () => {
      const onReplay = jest.fn(() => {
        throw new Error("sentry down");
      });
      const onEvict = jest.fn(() => {
        throw new Error("sentry down");
      });
      const { pool, advance } = buildControlledPool<StressPlace>({
        ttlMs: 30_000,
      });
      pool.onReplay = onReplay;
      pool.onEvict = onEvict;

      parkStalePrefetchedEntry(pool, {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: jest.fn(),
        },
      });
      // Replay should not throw despite onReplay throwing.
      expect(() => reviveStalePrefetchedEntry(pool, "place-A")).not.toThrow();

      parkStalePrefetchedEntry(pool, {
        placeId: "place-B",
        place: { id: "place-B", name: "B" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/B.mp3",
          cleanup: jest.fn(),
        },
      });
      // TTL fire should not throw despite onEvict throwing.
      expect(() => advance(30_000)).not.toThrow();
      expect(onReplay).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledTimes(1);
    });

    test("runPrefetchCycle without a stale pool still cleans up displaced audio (back-compat)", async () => {
      const places: StressPlace[] = [
        { id: "place-A", name: "A" },
        { id: "place-B", name: "B" },
      ];
      const state = buildPipelineState(places);
      const aCleanup = jest.fn();
      state.prefetchedNarrationRef.current = {
        placeId: "place-A",
        place: places[0],
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: aCleanup,
        },
      };

      const fetchPayload = jest.fn(
        async (): Promise<NarrationPayload> => ({
          kind: "audio",
          audioUri: "file:///tmp/B.mp3",
          cleanup: jest.fn(),
        }),
      );

      await runPrefetchCycle({
        ...state,
        pickNext: () => places[1],
        fetchPayload,
        // No stalePool — legacy path: A must be cleaned up immediately.
      });

      expect(aCleanup).toHaveBeenCalledTimes(1);
      expect(state.prefetchedNarrationRef.current?.placeId).toBe("place-B");
    });
  });

  // --- Telemetry counter behaviour ---------------------------------------
  //
  // These tests focus specifically on the per-event counter increments. They
  // give us a single place to scan when chasing a "Sentry dashboard isn't
  // moving" report — if any of these regress, the dev overlay and the
  // Sentry counter both go silent.

  describe("prefetch event counters", () => {
    test("a fresh state starts every counter at zero", () => {
      const counters = emptyPrefetchCounters();
      expect(counters).toEqual({
        HIT: 0,
        MISS: 0,
        STALE_DISCARD: 0,
        STOP_WALK_DISCARD: 0,
        DEDUPE: 0,
      });
    });

    test("a successful prefetch followed by a matching consume produces exactly one HIT and zero misses", async () => {
      const places: StressPlace[] = [{ id: "place-H", name: "H" }];
      const state = buildPipelineState(places);
      const fetchPayload = jest.fn(
        async (): Promise<NarrationPayload> => ({
          kind: "text",
          text: "Hit narration",
        }),
      );

      await runPrefetchCycle({
        ...state,
        pickNext: () => places[0],
        fetchPayload,
      });

      // Now simulate fetchNarration consuming the cached entry for the
      // same place. The cache must be cleared by the caller first to
      // mirror the production "always consume / clear the cache" pattern.
      const cached = state.prefetchedNarrationRef.current;
      state.prefetchedNarrationRef.current = null;
      const result = consumePrefetchedNarration(
        cached,
        "place-H",
        undefined,
        state.onEvent,
      );

      expect(result.kind).toBe("hit");
      expect(state.counters.HIT).toBe(1);
      expect(state.counters.MISS).toBe(0);
      expect(state.counters.STALE_DISCARD).toBe(0);
      expect(state.counters.STOP_WALK_DISCARD).toBe(0);
      expect(state.counters.DEDUPE).toBe(0);
    });

    test("an empty cache lookup increments MISS without touching other counters", () => {
      const state = buildPipelineState([]);
      consumePrefetchedNarration(
        null,
        "place-anything",
        undefined,
        state.onEvent,
      );

      expect(state.counters).toEqual({
        HIT: 0,
        MISS: 1,
        STALE_DISCARD: 0,
        STOP_WALK_DISCARD: 0,
        DEDUPE: 0,
      });
    });
  });
});
