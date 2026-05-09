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
          states[i] =
            typeof v === "function" ? (v as (p: T) => T)(states[i] as T) : v;
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
// audio player) by default. A handful of web-path tests below mutate
// Platform.OS to "web" for the duration of the test and restore it after.
const mockPlatform = { OS: "ios" as "ios" | "web" };
jest.mock("react-native", () => ({ Platform: mockPlatform }));

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

// ─── lib/sentryWalk ──────────────────────────────────────────────────────────
// Mocked so the playback-side fallback tests below can assert that
// trackNarrationFallback fires with the right reason on each silent-skip
// path. Mirrors the assertion pattern used in walkModeStress.test.ts for
// the fetch-side "write_failure" / "endpoint_error" / "bad_response" tests.
jest.mock("../lib/sentryWalk", () => ({
  trackNarrationFallback: jest.fn(),
  addWalkBreadcrumb: jest.fn(),
  setWalkScope: jest.fn(),
  trackPrefetchEvent: jest.fn(),
  trackNarrationPlayed: jest.fn(),
}));

import { useNarration } from "../hooks/useNarration";
import {
  trackNarrationFallback as mockedTrackNarrationFallback,
  trackNarrationPlayed as mockedTrackNarrationPlayed,
} from "../lib/sentryWalk";

const mockTrackNarrationFallback = mockedTrackNarrationFallback as jest.Mock;
const mockTrackNarrationPlayed = mockedTrackNarrationPlayed as jest.Mock;

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
//   ref[9]  audioWatchdogStartRef
//   ref[10] audioWatchdogRemainingRef
//   ref[11] audioWatchdogFireRef
//   ref[12] teardownAllRef
const REF_SPEAKING = 1;
const REF_GEN = 3;
const REF_QUEUE = 0;
const REF_WATCHDOG_FIRE = 11;

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
  mockTrackNarrationFallback.mockClear();
  mockTrackNarrationPlayed.mockClear();
  // Default: createAudioPlayer returns a working fake player. Individual
  // tests (e.g. the "playback_create" failure path) override this with
  // mockImplementationOnce to throw.
  mockCreateAudioPlayer.mockImplementation(() => {
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
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

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
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

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

describe("useNarration — pause/resume suspend and resume the audio watchdog", () => {
  // These tests rely on Jest's modern fake timers, which mock both setTimeout
  // AND Date.now(). suspendAudioWatchdog uses Date.now() to compute elapsed
  // time, and jest.advanceTimersByTime advances Date in lockstep.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("pause() during audio playback suspends the watchdog; resume() re-arms with remaining time", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    expect(mockCreatedPlayers.length).toBe(1);
    // Audio path arms the 60s watchdog and starts the player.
    expect(jest.getTimerCount()).toBe(1);
    const player = mockCreatedPlayers[0];
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(true);

    // 30s into the 60s window — watchdog still pending.
    jest.advanceTimersByTime(30_000);
    expect(jest.getTimerCount()).toBe(1);

    // pause() must (a) pause the underlying player and (b) suspend the
    // watchdog so the timer count drops to zero.
    n.pause();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    // Even an extended pause well past the original 60s ceiling must not
    // tear down the active playback — the suspended watchdog stays inert.
    jest.advanceTimersByTime(120_000);
    expect(jest.getTimerCount()).toBe(0);
    expect(player.remove).not.toHaveBeenCalled();
    expect(getSpeaking()).toBe(true);

    // resume() re-arms the watchdog with the ~30s remaining (60s - 30s
    // elapsed before the pause). Player is also resumed.
    n.resume();
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(1);

    // Just shy of the 30s remaining — still hasn't fired.
    jest.advanceTimersByTime(29_999);
    expect(jest.getTimerCount()).toBe(1);
    expect(getSpeaking()).toBe(true);
    expect(player.remove).not.toHaveBeenCalled();

    // One more ms tips it over: watchdog fires, onFinish runs, the player
    // is removed and speakingRef clears. This proves the timer was armed
    // for the REMAINING window, not a fresh 60s.
    jest.advanceTimersByTime(1);
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);
  });

  test("beginInterruption()/endInterruption() perform the same suspend/resume cycle on the watchdog", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    expect(mockCreatedPlayers.length).toBe(1);
    expect(jest.getTimerCount()).toBe(1);
    const player = mockCreatedPlayers[0];
    expect(player.play).toHaveBeenCalledTimes(1);

    // 20s into the watchdog window before the system grabs the audio
    // session (incoming phone call, Siri, navigation prompt).
    jest.advanceTimersByTime(20_000);
    expect(jest.getTimerCount()).toBe(1);

    n.beginInterruption();
    expect(player.pause).toHaveBeenCalledTimes(1);
    // Watchdog suspended for the duration of the interruption.
    expect(jest.getTimerCount()).toBe(0);

    // Long phone call — well past 60s — must not let the watchdog skip
    // the current narration. This is the regression the test guards.
    jest.advanceTimersByTime(120_000);
    expect(jest.getTimerCount()).toBe(0);
    expect(player.remove).not.toHaveBeenCalled();
    expect(getSpeaking()).toBe(true);

    // Interruption ends: re-arm with the ~40s remaining (60s - 20s).
    n.endInterruption();
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(1);

    // Just short of the remaining 40s — still pending.
    jest.advanceTimersByTime(39_999);
    expect(getSpeaking()).toBe(true);
    expect(player.remove).not.toHaveBeenCalled();

    // The final ms fires the (re-armed-for-40s) watchdog.
    jest.advanceTimersByTime(1);
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);
  });

  test("watchdog never fires while paused, even when fake timers run far past the 60s ceiling", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    expect(mockCreatedPlayers.length).toBe(1);
    expect(jest.getTimerCount()).toBe(1);
    const player = mockCreatedPlayers[0];

    // Pause almost immediately so essentially the entire pause window
    // sits beyond the watchdog ceiling. This is the worst case: a user
    // taps pause right after the narration begins and walks away.
    n.pause();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    // Three times the watchdog ceiling. Without the suspend bookkeeping,
    // this is exactly the scenario that would silently skip the story.
    jest.advanceTimersByTime(180_000);
    expect(jest.getTimerCount()).toBe(0);
    expect(player.remove).not.toHaveBeenCalled();
    // speakingRef stays true throughout — onFinish never ran, so the
    // narration is still considered active and ready to resume.
    expect(getSpeaking()).toBe(true);
  });
});

describe("useNarration — audio watchdog FIRES after 60s and unblocks the queue", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // This is the missing-coverage path: the existing tests verify the
  // watchdog gets cancelled on natural finish / on stop(), but if the
  // FIRE path itself ever broke (e.g. someone removes the setTimeout, or
  // the onFinish callback is hidden behind a never-true gen check) Walk
  // Mode would deadlock for the rest of the walk on a corrupt MP3 with
  // zero test signal. This test exercises the actual fire path.
  test("a stalled audio narration auto-advances to the next item after 60s", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    n.enqueueAudio("p2", "file:///cache/p2.mp3", "Place Two");

    // Only the first item should have begun playing. The second is queued.
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockCreatedPlayers.length).toBe(1);
    expect(mockCreatedPlayers[0].play).toHaveBeenCalledTimes(1);
    expect(getQueueLength()).toBe(1);
    expect(getSpeaking()).toBe(true);
    // Exactly one timer is armed: the 60s watchdog for item 1.
    expect(jest.getTimerCount()).toBe(1);

    const genAfterFirst = getSpeechGen();

    // Simulate a frozen player: never deliver didJustFinish, never deliver
    // an error status. Just advance time past the 60s threshold.
    jest.advanceTimersByTime(60_000);

    // The watchdog must have:
    //   1. invoked onFinish (which tore down the stuck player)
    //   2. re-entered processQueue() and started item 2
    //   3. captured a fresh generation for item 2
    expect(mockCreatedPlayers[0].remove).toHaveBeenCalledTimes(1);
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
    expect(mockCreatedPlayers.length).toBe(2);
    expect(mockCreatedPlayers[1].play).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(true);
    expect(getQueueLength()).toBe(0);
    expect(getSpeechGen()).toBe(genAfterFirst + 1);
  });

  test("watchdog clears speakingRef when it fires with an empty queue", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("only", "file:///cache/only.mp3", "Only Place");
    expect(getSpeaking()).toBe(true);
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(60_000);

    // No follow-up item, so onFinish tore down the player and left the
    // hook in an idle state — Walk Mode is unblocked, ready for the
    // next narration request.
    expect(mockCreatedPlayers[0].remove).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);
    expect(getQueueLength()).toBe(0);
    // The watchdog ref was cleared by clearAudioWatchdog inside teardownActive.
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a stale watchdog fire (after stop()) is gated by the gen check and does not double-tear-down", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    expect(mockCreatedPlayers.length).toBe(1);

    // Capture the watchdog's fire callback BEFORE we tear anything down.
    // armAudioWatchdog stores it in audioWatchdogFireRef so pause/resume can
    // re-arm it; we use the same ref to simulate a "ghost" watchdog that
    // somehow fires after stop() (e.g. a race where the timer fired into
    // microtask queue right as stop was called).
    const fire = ReactMock.__getRef(REF_WATCHDOG_FIRE).current as () => void;
    expect(typeof fire).toBe("function");

    const genBefore = getSpeechGen();
    n.stop();

    // stop() bumps generation, tears down the player exactly once, and
    // clears the watchdog timer.
    expect(getSpeechGen()).toBe(genBefore + 1);
    expect(mockCreatedPlayers[0].remove).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);

    // Now invoke the captured fire callback directly. The first thing
    // armAudioWatchdog's inner closure does is check
    //   if (speechGenRef.current !== myGen) return;
    // — so this MUST be a no-op. If the gen check ever regressed, fire()
    // would call onFinish() → teardownActive() → player.remove() a second
    // time AND re-enter processQueue() (firing a fresh utterance against
    // an empty queue is harmless, but a double-remove on a real native
    // AudioPlayer is a use-after-free).
    fire();

    expect(mockCreatedPlayers[0].remove).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
  });
});

// ─── Playback-side fallback telemetry ────────────────────────────────────────
//
// Walk Mode silently advances the queue when expo-audio fails post-fetch.
// Without these telemetry calls, the "Walk Mode Audio Fallback" Sentry
// dashboard would show zero events on a regression in expo-audio or a new
// OS audio-stack issue, and the only signal would be user complaints. These
// tests pin each silent-skip path to a specific `trackNarrationFallback`
// reason value so the dashboard's `group by reason` panel keeps surfacing
// every failure mode.
//
// Mirrors the assertion pattern used in walkModeStress.test.ts for the
// fetch-side reasons ("write_failure" / "endpoint_error" / "bad_response").

describe("useNarration — playback-side silent skips emit trackNarrationFallback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("createAudioPlayer throw emits 'playback_create' and advances the queue", () => {
    const n = useFreshNarrationHook();

    // First enqueueAudio call: createAudioPlayer throws (corrupt cache file
    // / native runtime mismatch). Second item should still play once the
    // deferred drain fires.
    mockCreateAudioPlayer.mockImplementationOnce(() => {
      throw new Error("invalid file://");
    });

    const cleanup1 = jest.fn();
    n.enqueueAudio("p1", "file:///cache/bad.mp3", "Place One", cleanup1);
    n.enqueueAudio("p2", "file:///cache/p2.mp3", "Place Two");

    // Telemetry: the silent skip is reported with the right reason.
    expect(mockTrackNarrationFallback).toHaveBeenCalledWith("playback_create");
    expect(mockTrackNarrationFallback).toHaveBeenCalledTimes(1);

    // The bad file's cleanup ran so we don't leak the temp file.
    expect(cleanup1).toHaveBeenCalledTimes(1);

    // Item 1's createAudioPlayer threw, but item 2 began playing
    // synchronously when its enqueueAudio call re-entered processQueue
    // (the throw branch reset speakingRef before returning). So exactly
    // one player exists, and it's for item 2.
    expect(mockCreatedPlayers.length).toBe(1);
    expect(mockCreatedPlayers[0].play).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(true);

    // The deferred drain timer from item 1's throw branch is harmless —
    // when it fires it sees speakingRef=true (item 2 is playing) and
    // returns without creating a third player.
    jest.advanceTimersByTime(50);
    expect(mockCreatedPlayers.length).toBe(1);
  });

  test("player.play() throw emits 'playback_play' and advances the queue", () => {
    const n = useFreshNarrationHook();

    // Override the default fake-player impl so play() throws on the first
    // player. Subsequent players (item 2) use the default working impl.
    mockCreateAudioPlayer.mockImplementationOnce(() => {
      const listeners: Listener[] = [];
      const player: FakePlayer = {
        play: jest.fn(() => {
          throw new Error("audio session lost");
        }),
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

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    n.enqueueAudio("p2", "file:///cache/p2.mp3", "Place Two");

    // Telemetry: the silent skip is reported with the right reason.
    expect(mockTrackNarrationFallback).toHaveBeenCalledWith("playback_play");
    expect(mockTrackNarrationFallback).toHaveBeenCalledTimes(1);

    // teardownActive (run inside onFinish after play() threw) removed
    // the broken player and processQueue was re-entered for item 2.
    expect(mockCreatedPlayers[0].remove).toHaveBeenCalledTimes(1);
    expect(mockCreatedPlayers.length).toBe(2);
    expect(mockCreatedPlayers[1].play).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(true);
  });

  test("playbackStatusUpdate error state emits 'playback_status_error' and advances the queue", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    n.enqueueAudio("p2", "file:///cache/p2.mp3", "Place Two");

    expect(mockCreatedPlayers.length).toBe(1);
    const player = mockCreatedPlayers[0];
    expect(player.__listeners.length).toBe(1);

    // Drive a failure status — exactly the shape useNarration's regex
    // detects via /error|fail|cannot|invalid/i on playbackState.
    player.__listeners[0]({ playbackState: "error" });

    // Telemetry: the silent skip is reported with the right reason.
    expect(mockTrackNarrationFallback).toHaveBeenCalledWith(
      "playback_status_error",
    );
    expect(mockTrackNarrationFallback).toHaveBeenCalledTimes(1);

    // onFinish ran — the broken player was removed and item 2 began
    // playing in its place.
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(mockCreatedPlayers.length).toBe(2);
    expect(mockCreatedPlayers[1].play).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(true);
  });

  test("audio watchdog fire emits 'playback_watchdog' and advances the queue", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    n.enqueueAudio("p2", "file:///cache/p2.mp3", "Place Two");

    expect(mockCreatedPlayers.length).toBe(1);
    expect(jest.getTimerCount()).toBe(1); // the 60s watchdog

    // Stalled decoder: never deliver didJustFinish, never deliver an error
    // status. Just advance time past the 60s threshold.
    jest.advanceTimersByTime(60_000);

    // Telemetry: the silent skip is reported with the right reason.
    expect(mockTrackNarrationFallback).toHaveBeenCalledWith(
      "playback_watchdog",
    );
    expect(mockTrackNarrationFallback).toHaveBeenCalledTimes(1);

    // The watchdog tore down the stuck player and started item 2.
    expect(mockCreatedPlayers[0].remove).toHaveBeenCalledTimes(1);
    expect(mockCreatedPlayers.length).toBe(2);
    expect(mockCreatedPlayers[1].play).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(true);
  });

  test("a successful natural-finish does NOT emit a playback fallback", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    expect(mockCreatedPlayers.length).toBe(1);

    // didJustFinish is the happy path — no telemetry should fire.
    mockCreatedPlayers[0].__listeners[0]({ didJustFinish: true });

    expect(mockTrackNarrationFallback).not.toHaveBeenCalled();
    expect(getSpeaking()).toBe(false);
  });
});

// ─── Text-path fallback telemetry ────────────────────────────────────────────
//
// The text path is used on web AND as the cross-platform fallback when the
// audio fetch failed. Three silent-skip paths exist that previously emitted
// no telemetry: native Speech.speak's onError, web utterance.onerror, and the
// empty-text guard in processQueue. A regression in expo-speech, the Web
// Speech API, or the text endpoint would only surface as user complaints —
// these tests pin each path to its trackNarrationFallback reason value so
// the dashboard's `group by reason` panel keeps surfacing every failure mode.

describe("useNarration — text-path silent skips emit trackNarrationFallback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("Speech.speak onError on native emits 'text_speak_error' and advances the queue", () => {
    const n = useFreshNarrationHook();

    n.enqueue("p1", "first text", "Place One");
    n.enqueue("p2", "second text", "Place Two");
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeechSpeak.mock.calls[0][0]).toBe("first text");
    const opts1 = lastSpeechOpts();

    // Simulate expo-speech reporting an error (engine unavailable, locale
    // missing on a new OS version, etc.). useNarration's onError must:
    //   1. emit the right telemetry reason
    //   2. call onFinish() which advances the queue to item 2
    opts1.onError(new Error("expo-speech failed"));

    expect(mockTrackNarrationFallback).toHaveBeenCalledWith("text_speak_error");
    expect(mockTrackNarrationFallback).toHaveBeenCalledTimes(1);

    // Item 2 began playing in place of the failed item 1.
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(2);
    expect(mockSpeechSpeak.mock.calls[1][0]).toBe("second text");
    expect(getSpeaking()).toBe(true);
  });

  test("empty-text guard emits 'text_empty' and advances the queue", () => {
    const n = useFreshNarrationHook();

    // Enqueue an empty narration first (the empty-text guard fires on this
    // one) followed by a real one. Without the telemetry, the empty payload
    // would silently skip a place with zero dashboard signal.
    n.enqueue("p1", "", "Place One");
    n.enqueue("p2", "real text", "Place Two");

    // The first item hit the empty-text guard, which emits the telemetry
    // and then calls onFinish() → processQueue() so item 2 begins playing.
    expect(mockTrackNarrationFallback).toHaveBeenCalledWith("text_empty");
    expect(mockTrackNarrationFallback).toHaveBeenCalledTimes(1);

    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeechSpeak.mock.calls[0][0]).toBe("real text");
    expect(getSpeaking()).toBe(true);
  });

  test("a successful Speech.speak onDone does NOT emit a text fallback", () => {
    const n = useFreshNarrationHook();

    n.enqueue("p1", "first text", "Place One");
    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    const opts = lastSpeechOpts();

    // onDone is the happy path — no telemetry should fire.
    opts.onDone();

    expect(mockTrackNarrationFallback).not.toHaveBeenCalled();
    expect(getSpeaking()).toBe(false);
  });
});

// ─── Web text-path fallback telemetry ────────────────────────────────────────
//
// The web branch of useNarration uses window.speechSynthesis instead of
// expo-speech. We flip Platform.OS to "web" via the shared mockPlatform
// holder, install a minimal speechSynthesis stub on globalThis, run a fresh
// hook, and drive utterance.onerror directly to assert the telemetry path.

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  onend: ((e?: unknown) => void) | null;
  onerror: ((e?: unknown) => void) | null;
  voice: unknown;
}

describe("useNarration — web utterance.onerror emits 'text_web_error'", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPlatform.OS = "web";

    // Capture the utterance passed to speak() so the test can drive its
    // onerror handler directly.
    const synthState: { utterance: FakeUtterance | null } = { utterance: null };
    const fakeSynth = {
      cancel: jest.fn(),
      speak: jest.fn((u: FakeUtterance) => {
        synthState.utterance = u;
      }),
      pause: jest.fn(),
      resume: jest.fn(),
      getVoices: jest.fn(() => []),
      speaking: false,
    };
    const g = globalThis as unknown as {
      window?: unknown;
      SpeechSynthesisUtterance?: unknown;
      __synthState?: typeof synthState;
    };
    const prevWindow = g.window;
    const prevUtter = g.SpeechSynthesisUtterance;
    g.window = { speechSynthesis: fakeSynth };
    g.SpeechSynthesisUtterance = function (this: FakeUtterance, text: string) {
      this.text = text;
      this.lang = "";
      this.rate = 1;
      this.pitch = 1;
      this.onend = null;
      this.onerror = null;
      this.voice = null;
    } as unknown as typeof SpeechSynthesisUtterance;
    g.__synthState = synthState;

    restore = () => {
      mockPlatform.OS = "ios";
      g.window = prevWindow;
      g.SpeechSynthesisUtterance = prevUtter;
      delete g.__synthState;
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    restore?.();
    restore = null;
  });

  test("utterance.onerror on web emits 'text_web_error' and advances the queue", () => {
    const n = useFreshNarrationHook();

    n.enqueue("p1", "first text", "Place One");

    const synthState = (
      globalThis as unknown as {
        __synthState: { utterance: FakeUtterance | null };
      }
    ).__synthState;
    expect(synthState.utterance).not.toBeNull();
    expect(typeof synthState.utterance!.onerror).toBe("function");

    // Drive the Web Speech API's error path. useNarration's onerror handler
    // must emit the telemetry reason and run onFinish (which clears the
    // speaking flag because the queue is empty).
    synthState.utterance!.onerror!({ error: "synthesis-failed" });

    expect(mockTrackNarrationFallback).toHaveBeenCalledWith("text_web_error");
    expect(mockTrackNarrationFallback).toHaveBeenCalledTimes(1);
    expect(getSpeaking()).toBe(false);
  });
});

// ─── trackNarrationPlayed denominator emission ───────────────────────────────
//
// The Walk Mode Audio Fallback dashboard's Panel 3 ("Audio fallback rate %")
// divides sum(narration.audio_fallback) by sum(narration.played). For the
// rate to be trustworthy, narration.played must fire exactly once per queued
// item that successfully started playback — and NEVER fire for items that
// failed before playback (playback_create / playback_play throws, text_empty
// guard). These tests pin each path so a regression that drops or
// double-counts the denominator would fail loudly here, before it skews the
// production dashboard.

describe("useNarration — trackNarrationPlayed fires once per actually-started playback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("audio path: emits 'audio' once after player.play() succeeds", () => {
    const n = useFreshNarrationHook();

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");

    expect(mockCreatedPlayers.length).toBe(1);
    expect(mockCreatedPlayers[0].play).toHaveBeenCalledTimes(1);
    expect(mockTrackNarrationPlayed).toHaveBeenCalledWith("audio");
    expect(mockTrackNarrationPlayed).toHaveBeenCalledTimes(1);
  });

  test("native text path: emits 'text' once after Speech.speak is invoked", () => {
    const n = useFreshNarrationHook();

    n.enqueue("p1", "first text", "Place One");

    expect(mockSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(mockTrackNarrationPlayed).toHaveBeenCalledWith("text");
    expect(mockTrackNarrationPlayed).toHaveBeenCalledTimes(1);
  });

  test("playback_create failure does NOT emit narration.played (denominator stays clean)", () => {
    const n = useFreshNarrationHook();

    // First enqueueAudio: createAudioPlayer throws, so play() is never
    // reached. No narration.played should fire for item 1. Item 2 plays
    // normally and contributes one narration.played("audio").
    mockCreateAudioPlayer.mockImplementationOnce(() => {
      throw new Error("invalid file://");
    });
    n.enqueueAudio("p1", "file:///cache/bad.mp3", "Place One");
    n.enqueueAudio("p2", "file:///cache/p2.mp3", "Place Two");

    expect(mockTrackNarrationFallback).toHaveBeenCalledWith("playback_create");
    // Exactly one narration.played, for item 2 only.
    expect(mockTrackNarrationPlayed).toHaveBeenCalledTimes(1);
    expect(mockTrackNarrationPlayed).toHaveBeenCalledWith("audio");
  });

  test("playback_play (player.play() throws) does NOT emit narration.played", () => {
    const n = useFreshNarrationHook();

    // Item 1: play() throws. Item 2: works normally. Only item 2 counts.
    mockCreateAudioPlayer.mockImplementationOnce(() => {
      const listeners: Listener[] = [];
      const player: FakePlayer = {
        play: jest.fn(() => {
          throw new Error("audio session lost");
        }),
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

    n.enqueueAudio("p1", "file:///cache/p1.mp3", "Place One");
    n.enqueueAudio("p2", "file:///cache/p2.mp3", "Place Two");

    expect(mockTrackNarrationFallback).toHaveBeenCalledWith("playback_play");
    // Exactly one narration.played, for item 2 only.
    expect(mockTrackNarrationPlayed).toHaveBeenCalledTimes(1);
    expect(mockTrackNarrationPlayed).toHaveBeenCalledWith("audio");
  });

  test("text_empty guard does NOT emit narration.played", () => {
    const n = useFreshNarrationHook();

    n.enqueue("p1", "", "Place One");
    n.enqueue("p2", "real text", "Place Two");

    expect(mockTrackNarrationFallback).toHaveBeenCalledWith("text_empty");
    // Only item 2 actually started speaking, so only one narration.played.
    expect(mockTrackNarrationPlayed).toHaveBeenCalledTimes(1);
    expect(mockTrackNarrationPlayed).toHaveBeenCalledWith("text");
  });
});
