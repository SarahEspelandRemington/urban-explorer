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
