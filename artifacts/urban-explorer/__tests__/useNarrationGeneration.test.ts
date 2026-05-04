/**
 * Tests for the narration queue generation counter (speechGenRef) in
 * hooks/useNarration.ts.
 *
 * speechGenRef is a critical correctness invariant: every call to
 * processQueue() captures the current value, and every callback
 * (Speech.speak onDone/onStopped/onError, expo-audio playbackStatusUpdate,
 * audio watchdog) ignores itself if speechGenRef has moved past its captured
 * value. If this guard breaks, two narrations can play simultaneously, which
 * crashes the native audio session.
 *
 * Coverage:
 *   1. stop() bumps the generation counter so a stale onStopped (which iOS
 *      delivers after Speech.stop()) is ignored — speakingRef remains false
 *      and processQueue is NOT re-entered.
 *   2. skip() bumps the generation counter and then drains the queue so the
 *      NEXT enqueued item begins playing on the deferred restart.
 *   3. The audio watchdog timer armed by armAudioWatchdog() is cancelled by
 *      teardownActive() (via clearAudioWatchdog) when the natural-finish
 *      generation check passes — no late watchdog fire is possible.
 */

(global as { __DEV__?: boolean }).__DEV__ = false;

// ─── Minimal React mock ──────────────────────────────────────────────────────
//
// useNarration is a hook that uses useState/useRef/useCallback/useEffect. The
// project does not depend on @testing-library/react or react-test-renderer,
// so we provide a tiny in-process hook runtime:
//   - useRef returns a stable { current } across calls within one hook call
//   - useState returns [value, setter] (we don't need re-renders)
//   - useCallback returns the function unchanged
//   - useEffect is captured but never invoked (we don't test unmount here)
//
// State is owned by the mock factory's closure so it survives the jest.mock
// hoist. Helpers (__resetReactState, __getRef) are exposed as named exports
// for the tests to call.

jest.mock("react", () => {
  const refs: Array<{ current: unknown }> = [];
  const states: unknown[] = [];
  let refIdx = 0;
  let stateIdx = 0;

  return {
    useState: <T>(initial: T) => {
      const i = stateIdx++;
      if (states.length <= i) states.push(initial);
      return [
        states[i] as T,
        (v: T | ((prev: T) => T)) => {
          states[i] = typeof v === "function" ? (v as (p: T) => T)(states[i] as T) : v;
        },
      ];
    },
    useRef: <T>(initial: T) => {
      const i = refIdx++;
      if (refs.length <= i) refs.push({ current: initial });
      return refs[i] as { current: T };
    },
    useCallback: <T extends (...a: unknown[]) => unknown>(fn: T) => fn,
    useEffect: () => {},
    __resetReactState: () => {
      refs.length = 0;
      states.length = 0;
      refIdx = 0;
      stateIdx = 0;
    },
    __getRef: (i: number) => refs[i] as { current: unknown },
  };
});

const ReactMock = require("react") as {
  __resetReactState: () => void;
  __getRef: (i: number) => { current: unknown };
};

// ─── react-native ────────────────────────────────────────────────────────────
// Force the native code paths in useNarration (Speech.speak fallback, expo-
// audio player). The web branch uses window.speechSynthesis which we don't
// want to model here.
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

// ─── expo-speech ─────────────────────────────────────────────────────────────
// The `mock` prefix is required so the jest.mock factory (which is hoisted)
// can reference these jest.fn instances without tripping the out-of-scope
// variable check.
const mockSpeechSpeak = jest.fn();
const mockSpeechStop = jest.fn();
const mockSpeechPause = jest.fn();
const mockSpeechResume = jest.fn();

jest.mock("expo-speech", () => ({
  speak: mockSpeechSpeak,
  stop: mockSpeechStop,
  pause: mockSpeechPause,
  resume: mockSpeechResume,
}));

// ─── expo-audio ──────────────────────────────────────────────────────────────
// Each createAudioPlayer call returns a fake player that records play/pause/
// remove invocations and exposes the listeners array so tests can drive
// playbackStatusUpdate events directly.
type AudioStatusLite = {
  didJustFinish?: boolean;
  playbackState?: string;
  reasonForWaitingToPlay?: string;
};
type Listener = (status: AudioStatusLite) => void;
interface FakePlayer {
  play: jest.Mock;
  pause: jest.Mock;
  remove: jest.Mock;
  addListener: jest.Mock;
  __listeners: Listener[];
  __subRemove: jest.Mock | null;
}

const mockCreatedPlayers: FakePlayer[] = [];
const mockSetAudioModeAsync = jest.fn(async () => {});
const mockCreateAudioPlayer = jest.fn(() => {
  const listeners: Listener[] = [];
  const player: FakePlayer = {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((_event: string, l: Listener) => {
      listeners.push(l);
      const subRemove = jest.fn(() => {
        const idx = listeners.indexOf(l);
        if (idx >= 0) listeners.splice(idx, 1);
      });
      player.__subRemove = subRemove;
      return { remove: subRemove };
    }),
    __listeners: listeners,
    __subRemove: null,
  };
  mockCreatedPlayers.push(player);
  return player;
});

jest.mock("expo-audio", () => ({
  setAudioModeAsync: mockSetAudioModeAsync,
  createAudioPlayer: mockCreateAudioPlayer,
}));

import { useNarration } from "../hooks/useNarration";

// ─── Test harness ────────────────────────────────────────────────────────────

// Layout of refs in the order useNarration declares them:
//   ref[0]  queueRef
//   ref[1]  speakingRef
//   ref[2]  retryTimerRef
//   ref[3]  speechGenRef
//   ref[4]  interruptedRef
//   ref[5]  currentPlayerRef
//   ref[6]  currentCleanupRef
//   ref[7]  currentSubRef
//   ref[8]  audioWatchdogRef
//   ref[9..11] audio watchdog bookkeeping
//   ref[12] teardownAllRef
const REF_SPEAKING = 1;
const REF_GEN = 3;
const REF_QUEUE = 0;

// Named with the `use` prefix so eslint-plugin-react-hooks treats it as a
// custom hook (it calls useNarration internally). It is in fact only called
// from test bodies — that's intentional, our React mock makes that safe.
function useFreshNarrationHook() {
  ReactMock.__resetReactState();
  mockSpeechSpeak.mockClear();
  mockSpeechStop.mockClear();
  mockSpeechPause.mockClear();
  mockSpeechResume.mockClear();
  mockCreateAudioPlayer.mockClear();
  mockCreatedPlayers.length = 0;
  return useNarration();
}

function getSpeechGen(): number {
  return ReactMock.__getRef(REF_GEN).current as number;
}

function getSpeaking(): boolean {
  return ReactMock.__getRef(REF_SPEAKING).current as boolean;
}

function getQueueLength(): number {
  return (ReactMock.__getRef(REF_QUEUE).current as unknown[]).length;
}

interface SpeechOpts {
  onDone: () => void;
  onStopped: () => void;
  onError: (err: unknown) => void;
}

function lastSpeechOpts(): SpeechOpts {
  const calls = mockSpeechSpeak.mock.calls;
  return calls[calls.length - 1][1] as SpeechOpts;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useNarration — stop() bumps generation, stale callbacks are ignored", () => {
  test("stop() increments speechGenRef and a stale onStopped is a no-op", () => {
    const n = useFreshNarrationHook();

    n.enqueue("p1", "First narration text", "Place One");
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    const opts1 = lastSpeechOpts();
    expect(getSpeaking()).toBe(true);

    // A second item is queued behind the first so we can detect any stray
    // re-entry into processQueue caused by a stale callback.
    n.enqueue("p2", "Second narration text", "Place Two");
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(getQueueLength()).toBe(1);

    const genBefore = getSpeechGen();
    n.stop();

    // stop() must (a) bump the generation, (b) clear speakingRef, and
    // (c) clear the queue so nothing else can play.
    expect(getSpeechGen()).toBe(genBefore + 1);
    expect(getSpeaking()).toBe(false);
    expect(getQueueLength()).toBe(0);
    expect(mockSpeechStop).toHaveBeenCalledTimes(1);

    // iOS delivers Speech.speak's onStopped AFTER Speech.stop() — exactly
    // the stale-callback case the generation counter exists to defend.
    // Invoking it must NOT mutate speakingRef and must NOT call Speech.speak
    // again (which would happen if processQueue were re-entered).
    opts1.onStopped();
    expect(getSpeaking()).toBe(false);
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
  });

  test("stale onDone after stop() does not start a new utterance", () => {
    const n = useFreshNarrationHook();

    n.enqueue("p1", "first", "Place One");
    n.enqueue("p2", "second", "Place Two");
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    const opts1 = lastSpeechOpts();

    n.stop();

    // onDone takes the onFinish path which would normally call processQueue.
    // The gen check inside onFinish must short-circuit it, leaving speakingRef
    // false and Speech.speak still called only once.
    opts1.onDone();
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);
  });
});

describe("useNarration — skip() bumps generation and drains the queue for the next item", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test("skip() bumps gen, then NEXT item starts on the deferred drain", () => {
    const n = useFreshNarrationHook();

    n.enqueue("p1", "first text", "Place One");
    n.enqueue("p2", "second text", "Place Two");
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeechSpeak.mock.calls[0][0]).toBe("first text");
    const opts1 = lastSpeechOpts();
    const genAfterFirst = getSpeechGen();

    n.skip();

    // skip() bumps the generation immediately so any in-flight callback for
    // item1 is invalidated before item2's playback begins.
    expect(getSpeechGen()).toBe(genAfterFirst + 1);
    expect(mockSpeechStop).toHaveBeenCalledTimes(1);

    // skip() defers processQueue() with setTimeout(_, 100) to break out of
    // the call stack before re-entering. Advance fake timers to fire it.
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100);

    expect(mockSpeechSpeak).toHaveBeenCalledTimes(2);
    expect(mockSpeechSpeak.mock.calls[1][0]).toBe("second text");
    expect(getSpeaking()).toBe(true);
    // The drain consumed item2; the queue should now be empty.
    expect(getQueueLength()).toBe(0);
    // Generation advanced again when processQueue captured myGen for item2.
    expect(getSpeechGen()).toBe(genAfterFirst + 2);

    // The stale onStopped from item1 must NOT corrupt the now-active item2
    // — the gen check exits early.
    opts1.onStopped();
    expect(getSpeaking()).toBe(true);
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(2);
  });

  test("skip() with empty queue still bumps gen and tears down active playback", () => {
    const n = useFreshNarrationHook();

    n.enqueue("only", "only text", "Only Place");
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    const opts = lastSpeechOpts();
    const genBefore = getSpeechGen();

    n.skip();
    expect(getSpeechGen()).toBe(genBefore + 1);

    // Drain timer fires but the queue is empty, so processQueue is a no-op
    // and Speech.speak is not called again.
    jest.advanceTimersByTime(100);
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);

    // Stale callback from the cancelled utterance is still ignored.
    opts.onStopped();
    expect(getSpeaking()).toBe(false);
  });
});

describe("useNarration — audio watchdog is cancelled by teardownActive()", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test("watchdog timer is cleared when didJustFinish fires (gen check passes)", () => {
    const n = useFreshNarrationHook();
    expect(jest.getTimerCount()).toBe(0);

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");

    // The audio path arms a 60s watchdog AND creates a player that begins
    // playback immediately.
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockCreatedPlayers.length).toBe(1);
    expect(jest.getTimerCount()).toBe(1); // the watchdog
    const player = mockCreatedPlayers[0];
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.__listeners.length).toBe(1);
    expect(getSpeaking()).toBe(true);

    // Trigger natural finish — the gen check passes (gen unchanged), so
    // onFinish runs, which calls teardownActive(), which calls
    // clearAudioWatchdog(), which clearTimeouts the watchdog.
    player.__listeners[0]({ didJustFinish: true });

    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);

    // Belt and braces: even if we now advance time well past the 60s
    // watchdog window, the (cancelled) watchdog can't fire and trigger
    // a second teardown.
    jest.advanceTimersByTime(120_000);
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);
  });

  test("watchdog is also cleared by stop() while audio playback is active", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    expect(jest.getTimerCount()).toBe(1);
    expect(mockCreatedPlayers.length).toBe(1);

    const genBefore = getSpeechGen();
    n.stop();

    // stop() bumps the generation so any in-flight playbackStatusUpdate
    // is ignored, and teardownActive() cancels the watchdog.
    expect(getSpeechGen()).toBe(genBefore + 1);
    expect(jest.getTimerCount()).toBe(0);
    expect(mockCreatedPlayers[0].remove).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);

    // A late playbackStatusUpdate (e.g. didJustFinish delivered by the OS
    // during teardown) must be a no-op. The hook's stale-callback guard is
    // BOTH the gen check AND the currentSubRef null-check; either one is
    // sufficient to short-circuit, and the player must not be removed twice.
    const stalePlayer = mockCreatedPlayers[0];
    if (stalePlayer.__listeners.length > 0) {
      stalePlayer.__listeners[0]({ didJustFinish: true });
    }
    expect(stalePlayer.remove).toHaveBeenCalledTimes(1);
  });
});
