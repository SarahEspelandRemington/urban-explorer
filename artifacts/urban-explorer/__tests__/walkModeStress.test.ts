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
 *  2. NowPlaying desync — stopWalk must call NowPlaying.clear() synchronously
 *     before narration.stop() so the lock-screen widget is never re-instated
 *     by a late React effect after the walk ends.
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
    const fakeLoc = { coords: { latitude: 51.5, longitude: -0.1, altitude: 0, accuracy: 5, altitudeAccuracy: 5, heading: 0, speed: 0 }, timestamp: Date.now() } as Parameters<typeof dispatchLocation>[0];
    dispatchLocation(fakeLoc);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(fakeLoc);
  });

  test("dispatchLocation is a no-op after session.stop()", () => {
    const cb = jest.fn();
    const session = installSessionCallback(cb);
    session.stop();
    const fakeLoc = { coords: { latitude: 51.5, longitude: -0.1, altitude: 0, accuracy: 5, altitudeAccuracy: 5, heading: 0, speed: 0 }, timestamp: Date.now() } as Parameters<typeof dispatchLocation>[0];
    dispatchLocation(fakeLoc);
    expect(cb).not.toHaveBeenCalled();
  });

  test("dispatchLocation goes to new session after old session stops", () => {
    const cbA = jest.fn();
    const cbB = jest.fn();
    const sA = installSessionCallback(cbA);
    installSessionCallback(cbB);
    sA.stop();
    const fakeLoc = { coords: { latitude: 51.5, longitude: -0.1, altitude: 0, accuracy: 5, altitudeAccuracy: 5, heading: 0, speed: 0 }, timestamp: Date.now() } as Parameters<typeof dispatchLocation>[0];
    dispatchLocation(fakeLoc);
    expect(cbB).toHaveBeenCalledTimes(1);
    expect(cbA).not.toHaveBeenCalled();
  });
});

// ─── Test group 2: NowPlaying desync — real executeStopWalkSync ──────────────
//
// lib/walkStopSession.ts#executeStopWalkSync is the production utility that
// WalkModeContext.stopWalk delegates to for the synchronous stop-ordering.
// These tests exercise the REAL function and will fail if anyone reorders the
// calls inside executeStopWalkSync.

import { executeStopWalkSync } from "../lib/walkStopSession";

describe("executeStopWalkSync (NowPlaying stop-ordering guard)", () => {
  function buildDeps() {
    const callOrder: string[] = [];
    return {
      callOrder,
      isWalkingRef: { current: true },
      nowPlayingUnsub: jest.fn(() => { callOrder.push("nowPlayingUnsub"); }),
      nowPlayingClear: jest.fn(() => { callOrder.push("NowPlaying.clear"); }),
      narrationStop: jest.fn(() => { callOrder.push("narration.stop"); }),
    };
  }

  test("sets isWalkingRef.current to false", () => {
    const deps = buildDeps();
    executeStopWalkSync(deps);
    expect(deps.isWalkingRef.current).toBe(false);
  });

  test("NowPlaying.clear() fires before narration.stop()", () => {
    const deps = buildDeps();
    executeStopWalkSync(deps);
    const clearIdx = deps.callOrder.indexOf("NowPlaying.clear");
    const stopIdx  = deps.callOrder.indexOf("narration.stop");
    expect(clearIdx).toBeGreaterThanOrEqual(0);
    expect(stopIdx).toBeGreaterThanOrEqual(0);
    expect(clearIdx).toBeLessThan(stopIdx);
  });

  test("isWalkingRef is set to false before NowPlaying.clear()", () => {
    const deps = buildDeps();
    let refAtClearTime: boolean | null = null;
    deps.nowPlayingClear.mockImplementation(() => {
      deps.callOrder.push("NowPlaying.clear");
      refAtClearTime = deps.isWalkingRef.current;
    });

    executeStopWalkSync(deps);

    expect(refAtClearTime).toBe(false);
  });

  test("nowPlayingUnsub is called before NowPlaying.clear()", () => {
    const deps = buildDeps();
    executeStopWalkSync(deps);
    const unsubIdx = deps.callOrder.indexOf("nowPlayingUnsub");
    const clearIdx = deps.callOrder.indexOf("NowPlaying.clear");
    expect(unsubIdx).toBeGreaterThanOrEqual(0);
    expect(unsubIdx).toBeLessThan(clearIdx);
  });

  test("NowPlaying.clear() is called exactly once", () => {
    const deps = buildDeps();
    executeStopWalkSync(deps);
    expect(deps.nowPlayingClear).toHaveBeenCalledTimes(1);
  });

  test("nowPlayingUnsub is skipped (not called) when null", () => {
    const deps = buildDeps();
    const depsNoUnsub = { ...deps, nowPlayingUnsub: null };
    expect(() => executeStopWalkSync(depsNoUnsub)).not.toThrow();
    expect(deps.nowPlayingClear).toHaveBeenCalledTimes(1);
    expect(deps.narrationStop).toHaveBeenCalledTimes(1);
  });

  test("late effect guarded by isWalkingRef cannot reinstate NowPlaying widget", () => {
    const deps = buildDeps();
    const setNowPlayingCalls: string[] = [];

    executeStopWalkSync(deps);

    function lateEffect(isWalkingRef: { current: boolean }) {
      if (!isWalkingRef.current) return;
      setNowPlayingCalls.push("setNowPlaying");
    }

    lateEffect(deps.isWalkingRef);
    expect(setNowPlayingCalls).toHaveLength(0);
  });
});

// ─── Test group 3: fetchNarrationPayload — Paths.cache fallback ───────────────
//
// lib/fetchNarrationPayload.ts wraps writeNarrationAudioToCache in a try/catch.
// Tests verify the throw is caught and the function falls through to the text
// endpoint, returning { kind: "text" } rather than propagating the error.

jest.mock("../lib/walkAudioCache", () => ({ writeNarrationAudioToCache: jest.fn() }));
jest.mock("../lib/apiToken", () => ({ authHeaders: jest.fn(async () => ({})) }));
jest.mock("../lib/sentryWalk", () => ({
  addWalkBreadcrumb: jest.fn(),
  trackNarrationFallback: jest.fn(),
}));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

describe("fetchNarrationPayload — graceful text fallback when Paths.cache is bad", () => {
  const mockPlace = {
    id: "place-abc",
    name: "Old Town Hall",
    category: "historic",
    summary: "Built in 1887.",
    facts: ["It was the first civic building in the district."],
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
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as { writeNarrationAudioToCache: jest.Mock };
    writeNarrationAudioToCache.mockImplementation(() => { throw new TypeError("Paths.cache is undefined"); });
    mockFetch
      .mockResolvedValueOnce(audioFetch(16))
      .mockResolvedValueOnce(textFetch("An old town hall."));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const result = await fetchNarrationPayload(mockPlace, OPTS);
    expect(result).toEqual({ kind: "text", text: "An old town hall." });
  });

  test("does not throw when writeNarrationAudioToCache throws (error is swallowed)", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as { writeNarrationAudioToCache: jest.Mock };
    writeNarrationAudioToCache.mockImplementation(() => { throw new Error("disk full"); });
    mockFetch
      .mockResolvedValueOnce(audioFetch(8))
      .mockResolvedValueOnce(textFetch("Fallback narration."));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    await expect(fetchNarrationPayload(mockPlace, OPTS)).resolves.not.toThrow();
  });

  test("returns audio payload when writeNarrationAudioToCache succeeds", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as { writeNarrationAudioToCache: jest.Mock };
    const mockCleanup = jest.fn();
    writeNarrationAudioToCache.mockReturnValue({ uri: "file:///cache/walk-narr-abc.mp3", cleanup: mockCleanup });
    mockFetch.mockResolvedValueOnce(audioFetch(16));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const result = await fetchNarrationPayload(mockPlace, OPTS);
    expect(result).toEqual({ kind: "audio", audioUri: "file:///cache/walk-narr-abc.mp3", cleanup: mockCleanup });
  });

  test("returns null when audio buffer is empty AND text endpoint fails", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as { writeNarrationAudioToCache: jest.Mock };
    writeNarrationAudioToCache.mockReturnValue(null);
    mockFetch
      .mockResolvedValueOnce(audioFetch(0))
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const result = await fetchNarrationPayload(mockPlace, OPTS);
    expect(result).toBeNull();
  });

  test("skips audio endpoint entirely when isExpoGo=true, returns text", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as { writeNarrationAudioToCache: jest.Mock };
    mockFetch.mockResolvedValueOnce(textFetch("Expo Go narration."));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const result = await fetchNarrationPayload(mockPlace, { ...OPTS, isExpoGo: true });
    expect(result).toEqual({ kind: "text", text: "Expo Go narration." });
    expect(writeNarrationAudioToCache).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("trackNarrationFallback called with 'write_failure' when cache write throws", async () => {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache") as { writeNarrationAudioToCache: jest.Mock };
    writeNarrationAudioToCache.mockImplementation(() => { throw new TypeError("Paths.cache is null"); });
    mockFetch
      .mockResolvedValueOnce(audioFetch(8))
      .mockResolvedValueOnce(textFetch("Fallback."));

    const { fetchNarrationPayload } = require("../lib/fetchNarrationPayload");
    const { trackNarrationFallback } = require("../lib/sentryWalk");
    await fetchNarrationPayload(mockPlace, OPTS);
    expect(trackNarrationFallback).toHaveBeenCalledWith("write_failure");
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
  runPrefetchCycle,
  type NarrationPayload,
  type PrefetchEntry,
} from "../lib/narrationPrefetchPipeline";

interface StressPlace { id: string; name: string }

interface PipelineState {
  isWalkingRef: { current: boolean };
  narratedIdsRef: { current: Map<string, number> };
  prefetchedNarrationRef: { current: PrefetchEntry<StressPlace> | null };
  prefetchInFlightRef: { current: string | null };
  placesRef: { current: StressPlace[] };
}

function buildPipelineState(places: StressPlace[]): PipelineState {
  return {
    isWalkingRef: { current: true },
    narratedIdsRef: { current: new Map<string, number>() },
    prefetchedNarrationRef: { current: null },
    prefetchInFlightRef: { current: null },
    placesRef: { current: places },
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
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
        payload: { kind: "audio", audioUri: "file:///tmp/A.mp3", cleanup: staleCleanup },
      };

      const result = consumePrefetchedNarration(stale, "place-B");

      expect(result.kind).toBe("miss");
      expect(staleCleanup).toHaveBeenCalledTimes(1);
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

      const result = consumePrefetchedNarration(cached, "place-B");

      expect(result.kind).toBe("hit");
      if (result.kind === "hit") {
        expect(result.entry.payload).toEqual(cached.payload);
      }
      expect(cleanup).not.toHaveBeenCalled();
    });

    test("null cache returns miss without throwing", () => {
      expect(() => consumePrefetchedNarration(null, "place-X")).not.toThrow();
      expect(consumePrefetchedNarration(null, "place-X").kind).toBe("miss");
    });

    test("cleanup throw is swallowed so the consumer can continue", () => {
      const stale: PrefetchEntry<StressPlace> = {
        placeId: "place-A",
        place: { id: "place-A", name: "A" },
        payload: {
          kind: "audio",
          audioUri: "file:///tmp/A.mp3",
          cleanup: () => { throw new Error("fs error"); },
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
      payload: { kind: "audio", audioUri: "file:///tmp/A.mp3", cleanup: staleCleanup },
    };

    const fetchPayload = jest.fn(async (): Promise<NarrationPayload> => ({
      kind: "audio",
      audioUri: "file:///tmp/B.mp3",
      cleanup: jest.fn(),
    }));

    await runPrefetchCycle({
      ...state,
      pickNext: () => places[0],
      fetchPayload,
    });

    expect(staleCleanup).toHaveBeenCalledTimes(1);
    expect(state.prefetchedNarrationRef.current?.placeId).toBe("place-B");
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
      const secondCycle = runPrefetchCycle({ ...state, pickNext, fetchPayload });

      expect(state.prefetchInFlightRef.current).toBe("place-D");
      expect(fetchPayload).toHaveBeenCalledTimes(1);
      // The deduped call returns undefined since it short-circuits.
      expect(secondCycle).toBeUndefined();

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
      const fetchPayload = jest.fn(async (place: StressPlace): Promise<NarrationPayload> => {
        return place.id === "place-A" ? gateA.promise : gateB.promise;
      });

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
      const clearCache = () => { cacheRef.current = null; };
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
});
