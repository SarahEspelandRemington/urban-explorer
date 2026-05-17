import type { AudioPlayer, AudioStatus } from "expo-audio";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import {
  trackNarrationFallback,
  trackNarrationPlayed,
} from "../lib/sentryWalk";
import { IS_EXPO_GO } from "../lib/expoEnv";

/**
 * Lazy accessor for expo-audio. The static import is intentionally avoided at
 * module scope because expo-audio registers a native module initializer on
 * import. In Expo Go the bundled native runtime may not satisfy the JS
 * package's expected API version, which causes a hard native crash (the OS
 * kills the process before the JS error overlay can render). Requiring it
 * lazily, and only on native non-Expo-Go builds, prevents the initializer from
 * running at all in Expo Go.
 */
function getExpoAudio() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-audio") as typeof import("expo-audio");
}

interface NarrationItem {
  id: string;
  placeName: string;
  // Exactly one playback source is set per item.
  text?: string; // text path: web SpeechSynthesisUtterance, or native Speech.speak fallback
  audioUri?: string; // audio path: native expo-audio, plays a local file://...mp3
  cleanup?: () => void; // optional disposer (e.g. delete the temp MP3 when done)
}

let webSpeechUnlocked = false;

export function unlockWebSpeech() {
  if (Platform.OS !== "web" || webSpeechUnlocked) return;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
    webSpeechUnlocked = true;
  } catch {}
}

let backgroundAudioConfigured = false;

/**
 * Configure the system audio session so that text-to-speech playback continues
 * when the screen is locked or the app is backgrounded. Safe to call multiple
 * times — only the first call actually flips the OS-level audio mode. No-op on
 * web (the browser tab keeps speechSynthesis alive on its own).
 */
export async function enableBackgroundAudio(): Promise<void> {
  if (Platform.OS === "web" || IS_EXPO_GO || backgroundAudioConfigured) return;
  try {
    await getExpoAudio().setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "duckOthers",
    });
    backgroundAudioConfigured = true;
  } catch {}
}

export function useNarration() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPlace, setCurrentPlace] = useState<string | null>(null);
  // Tracks the id of the item the audio engine is currently playing.
  // Set alongside currentPlace so callers can look up the full WalkPlace.
  const [currentPlaceId, setCurrentPlaceId] = useState<string | null>(null);
  const queueRef = useRef<NarrationItem[]>([]);
  const speakingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monotonically increasing counter. Each call to processQueue that actually
  // starts an utterance captures the current value. Any callback (Speech.speak
  // onDone/onError/onStopped, or expo-audio playbackStatusUpdate) ignores
  // itself if speechGenRef.current has moved past its captured value — this
  // prevents stale callbacks (which can fire after stop() or arrive
  // out-of-order) from corrupting queue state and triggering simultaneous
  // playbacks, which causes a native crash.
  const speechGenRef = useRef(0);

  // True while a system audio interruption (phone call, Siri, navigation
  // prompt) is in effect. While set we pause any active playback and refuse
  // to start new ones; endInterruption resumes / drains the queue.
  const interruptedRef = useRef(false);

  // Currently active expo-audio player (if any). Held so pause/resume/stop/skip
  // can control it. We MUST call .remove() to free the native resource —
  // failure to do so leaks audio sessions and eventually crashes iOS.
  const currentPlayerRef = useRef<AudioPlayer | null>(null);
  const currentCleanupRef = useRef<(() => void) | null>(null);
  // The playbackStatusUpdate subscription for the active player. We track it
  // explicitly because expo-audio's player.remove() does not document
  // listener-detachment, and a leaked listener can fire stale callbacks.
  const currentSubRef = useRef<{ remove: () => void } | null>(null);
  // Watchdog timer. If the OS never reports didJustFinish (corrupt MP3,
  // decoder stall, lost audio session, etc.) we still need to advance the
  // queue so Walk Mode doesn't deadlock. Generous 60s upper bound — our
  // narrations are 30-45 words (~10-20s), so anything past 60s is broken.
  // The watchdog must NOT fire while playback is paused / interrupted, or
  // we'd silently skip the current story after a long pause. We track the
  // remaining-ms so pause() / beginInterruption() can suspend it and
  // resume() / endInterruption() can re-arm it from where it left off.
  const audioWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioWatchdogStartRef = useRef<number>(0);
  const audioWatchdogRemainingRef = useRef<number>(0);
  const AUDIO_WATCHDOG_MS = 60_000;
  const audioWatchdogFireRef = useRef<(() => void) | null>(null);

  const armAudioWatchdog = useCallback((ms: number, fire: () => void) => {
    if (audioWatchdogRef.current) clearTimeout(audioWatchdogRef.current);
    audioWatchdogStartRef.current = Date.now();
    audioWatchdogRemainingRef.current = ms;
    audioWatchdogFireRef.current = fire;
    audioWatchdogRef.current = setTimeout(fire, ms);
  }, []);

  const suspendAudioWatchdog = useCallback(() => {
    if (!audioWatchdogRef.current) return;
    clearTimeout(audioWatchdogRef.current);
    audioWatchdogRef.current = null;
    const elapsed = Date.now() - audioWatchdogStartRef.current;
    audioWatchdogRemainingRef.current = Math.max(
      1000,
      audioWatchdogRemainingRef.current - elapsed,
    );
  }, []);

  const resumeAudioWatchdog = useCallback(() => {
    if (audioWatchdogRef.current) return; // already running
    const fire = audioWatchdogFireRef.current;
    if (!fire) return; // no active playback to guard
    audioWatchdogStartRef.current = Date.now();
    audioWatchdogRef.current = setTimeout(
      fire,
      audioWatchdogRemainingRef.current,
    );
  }, []);

  const clearAudioWatchdog = useCallback(() => {
    if (audioWatchdogRef.current) {
      clearTimeout(audioWatchdogRef.current);
      audioWatchdogRef.current = null;
    }
    audioWatchdogFireRef.current = null;
    audioWatchdogRemainingRef.current = 0;
  }, []);

  // Tear down whatever is currently playing (audio player or speech engine)
  // and run the temp-file cleanup. Used by stop/skip and by the natural
  // end-of-utterance handler below. MUST be safe to call multiple times.
  const teardownActive = useCallback(() => {
    clearAudioWatchdog();
    if (currentSubRef.current) {
      try {
        currentSubRef.current.remove();
      } catch {}
      currentSubRef.current = null;
    }
    const player = currentPlayerRef.current;
    if (player) {
      try {
        player.pause();
      } catch {}
      try {
        player.remove();
      } catch {}
      currentPlayerRef.current = null;
    }
    const cleanup = currentCleanupRef.current;
    currentCleanupRef.current = null;
    if (cleanup) {
      try {
        cleanup();
      } catch {}
    }
  }, [clearAudioWatchdog]);

  const processQueue = useCallback(() => {
    if (speakingRef.current || queueRef.current.length === 0) return;
    if (interruptedRef.current) return;

    const item = queueRef.current.shift()!;
    speakingRef.current = true;
    setIsSpeaking(true);
    setCurrentPlace(item.placeName);
    setCurrentPlaceId(item.id);

    // Capture the generation for this specific playback. Any callback that
    // arrives after a newer playback has started is silently ignored.
    const myGen = ++speechGenRef.current;

    const onFinish = () => {
      if (speechGenRef.current !== myGen) return;
      teardownActive();
      speakingRef.current = false;
      setIsSpeaking(false);
      setCurrentPlace(null);
      setCurrentPlaceId(null);
      processQueue();
    };

    // --- Audio path: play the MP3 file via expo-audio ----------------------
    // Used on native when the server returned natural-voice TTS audio.
    // IS_EXPO_GO items never have audioUri (fetchNarrationPayload skips the
    // audio endpoint entirely), but guard here too for defence-in-depth so we
    // never call into expo-audio in Expo Go even if that gate changes.
    if (item.audioUri && Platform.OS !== "web" && !IS_EXPO_GO) {
      if (__DEV__)
        console.log(
          `[narration audio] play "${item.placeName}" uri=${item.audioUri} gen=${myGen}`,
        );
      let player: AudioPlayer;
      try {
        player = getExpoAudio().createAudioPlayer({ uri: item.audioUri });
      } catch (err) {
        if (__DEV__)
          console.log(`[narration audio] createAudioPlayer threw:`, err);
        // Surface the silent skip to the audio-fallback dashboard so a
        // regression in expo-audio / a corrupt cache file doesn't go
        // unnoticed (the user just gets a gap in their tour, no crash).
        try {
          trackNarrationFallback("playback_create");
        } catch {}
        // If we can't even create the player, run cleanup and advance the
        // queue so we don't hang the walk-mode pipeline.
        if (item.cleanup) {
          try {
            item.cleanup();
          } catch {}
        }
        speakingRef.current = false;
        setIsSpeaking(false);
        setCurrentPlace(null);
        setCurrentPlaceId(null);
        // Defer to break out of the current call stack before re-entering.
        setTimeout(() => processQueue(), 50);
        return;
      }
      currentPlayerRef.current = player;
      currentCleanupRef.current = item.cleanup ?? null;

      // Watchdog: force-advance if didJustFinish never arrives. Cancelled by
      // teardownActive() on natural end, error path, or stop/skip; suspended
      // (and resumed) by pause/beginInterruption/resume/endInterruption so
      // that long pauses don't silently skip the current story.
      armAudioWatchdog(AUDIO_WATCHDOG_MS, () => {
        if (speechGenRef.current !== myGen) return;
        if (__DEV__)
          console.log(
            `[narration audio] watchdog tripped gen=${myGen}, forcing advance`,
          );
        // Surface the silent skip to the audio-fallback dashboard. Without
        // this, a decoder stall / lost audio session would leave the queue
        // moving on with zero telemetry, masking a real regression.
        try {
          trackNarrationFallback("playback_watchdog");
        } catch {}
        onFinish();
      });

      const sub = player.addListener(
        "playbackStatusUpdate",
        (status: AudioStatus) => {
          if (speechGenRef.current !== myGen) return;
          // Null-check: if teardownActive already ran (currentSubRef cleared before
          // player.remove()), this is a stale event fired by the OS during teardown.
          // Exit early rather than risk calling remove() on an already-removed player.
          if (!currentSubRef.current) return;
          if (status.didJustFinish) {
            if (__DEV__)
              console.log(`[narration audio] didJustFinish gen=${myGen}`);
            onFinish();
            return;
          }
          // expo-audio doesn't expose a typed error field on AudioStatus, but
          // playbackState / reasonForWaitingToPlay are free-form strings the
          // platforms use to report failure ("error", "failed", "cannotPlay",
          // "notSupportedFile", etc). Treat any of those as a play failure and
          // advance the queue so Walk Mode doesn't stall.
          const errSignal =
            (typeof status.playbackState === "string" &&
              /error|fail|cannot|invalid/i.test(status.playbackState)) ||
            (typeof status.reasonForWaitingToPlay === "string" &&
              /error|fail|cannot|noItem/i.test(status.reasonForWaitingToPlay));
          if (errSignal) {
            if (__DEV__)
              console.log(
                `[narration audio] error status gen=${myGen}, advancing:`,
                status.playbackState,
                status.reasonForWaitingToPlay,
              );
            // Surface the silent skip to the audio-fallback dashboard. The
            // OS told us decoding failed; if we don't track it the dashboard
            // will show zero events while users get a gap in their tour.
            try {
              trackNarrationFallback("playback_status_error");
            } catch {}
            onFinish();
          }
        },
      );
      currentSubRef.current = sub;

      try {
        player.play();
        // Audio playback successfully started — count it toward the
        // dashboard's "narrations played" denominator. Emitted only after
        // play() returns without throwing, so playback_create / playback_play
        // failures stay out of the denominator (the rate stays meaningful).
        try {
          trackNarrationPlayed("audio");
        } catch {}
      } catch (err) {
        if (__DEV__) console.log(`[narration audio] play() threw:`, err);
        // Surface the silent skip to the audio-fallback dashboard. play()
        // throws on lost audio sessions / decoder unavailability — Walk
        // Mode advances the queue, so without this the failure is invisible.
        try {
          trackNarrationFallback("playback_play");
        } catch {}
        // teardownActive (run inside onFinish) will remove the listener and
        // the watchdog, so we don't need to do it manually here.
        onFinish();
      }
      return;
    }

    // --- Text path: web SpeechSynthesisUtterance, or native Speech.speak ----
    const fallbackText = item.text ?? "";
    if (!fallbackText) {
      // Nothing to play — advance the queue. Surface the silent skip to the
      // audio-fallback dashboard: an empty prefetched payload (e.g. text
      // endpoint regression, malformed cached entry) would otherwise leave
      // a gap in the user's tour with zero telemetry.
      try {
        trackNarrationFallback("text_empty");
      } catch {}
      onFinish();
      return;
    }

    if (Platform.OS === "web") {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(fallbackText);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      utterance.pitch = 1.05;
      utterance.onend = onFinish;
      utterance.onerror = (e) => {
        if (__DEV__) console.warn("Speech error:", e);
        // Surface the silent skip to the audio-fallback dashboard. A Web
        // Speech API regression (voice unavailable, synth backend down)
        // would otherwise be invisible — the user just gets a gap.
        try {
          trackNarrationFallback("text_web_error");
        } catch {}
        onFinish();
      };

      const voices = window.speechSynthesis.getVoices();
      const preferredNames = [
        "samantha",
        "karen",
        "daniel",
        "moira",
        "tessa",
        "rishi",
        "google us english",
        "google uk english",
      ];
      const premium = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          preferredNames.some((n) => v.name.toLowerCase().includes(n)),
      );
      const fallback =
        voices.find(
          (v) =>
            v.lang.startsWith("en-") &&
            !v.name.toLowerCase().includes("compact"),
        ) || voices.find((v) => v.lang.startsWith("en"));
      const selectedVoice = premium || fallback;
      if (selectedVoice) utterance.voice = selectedVoice;

      window.speechSynthesis.speak(utterance);
      // Web text playback successfully started (synchronous handoff to the
      // browser's speech synth) — count it toward the dashboard's
      // "narrations played" denominator.
      try {
        trackNarrationPlayed("text");
      } catch {}

      retryTimerRef.current = setTimeout(() => {
        if (speakingRef.current && !window.speechSynthesis.speaking) {
          if (__DEV__) console.warn("Speech did not start, retrying...");
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        }
      }, 500);
    } else {
      // Native fallback if the audio endpoint failed and we got plain text.
      if (__DEV__)
        console.log(
          `[Speech.speak] starting "${item.placeName}" (${fallbackText.length} chars, gen=${myGen})`,
        );
      Speech.speak(fallbackText, {
        language: "en-US",
        rate: 0.9,
        pitch: 1.05,
        onDone: () => {
          if (__DEV__) console.log(`[Speech.speak] onDone gen=${myGen}`);
          onFinish();
        },
        // Note: trackNarrationPlayed("text") is fired synchronously *after*
        // Speech.speak returns below. expo-speech does not throw for typical
        // failures (it surfaces them via onError instead), so the call
        // returning is the closest we get to "playback started" on native.
        onStopped: () => {
          // On iOS, Speech.stop() triggers onStopped (not onDone/onError).
          // Guard with the generation check so a stop() for a previous utterance
          // doesn't corrupt the new one. Do NOT call processQueue here —
          // stop() and skip() handle that after bumping the generation counter.
          if (__DEV__)
            console.log(
              `[Speech.speak] onStopped gen=${myGen} current=${speechGenRef.current}`,
            );
          if (speechGenRef.current !== myGen) return;
          speakingRef.current = false;
          setIsSpeaking(false);
          setCurrentPlace(null);
          setCurrentPlaceId(null);
        },
        onError: (err) => {
          if (__DEV__) console.log(`[Speech.speak] onError gen=${myGen}:`, err);
          if (__DEV__) console.warn("Speech error:", err);
          // Surface the silent skip to the audio-fallback dashboard. An
          // expo-speech regression (engine unavailable, locale missing on
          // a new OS version) would otherwise leave the dashboard at zero
          // while users get a gap in their tour.
          try {
            trackNarrationFallback("text_speak_error");
          } catch {}
          onFinish();
        },
      });
      // Native text playback was handed to expo-speech without throwing —
      // count it toward the dashboard's "narrations played" denominator.
      // (Speech.speak surfaces failures via onError, not by throwing, so
      // this is the closest synchronous "started" signal we have.)
      try {
        trackNarrationPlayed("text");
      } catch {}
    }
  }, [teardownActive, armAudioWatchdog]);

  // Public API: play a text narration (used by web, and as a fallback on
  // native when the audio endpoint failed).
  const enqueue = useCallback(
    (id: string, text: string, placeName: string) => {
      queueRef.current.push({ id, text, placeName });
      processQueue();
    },
    [processQueue],
  );

  // Public API: play a pre-rendered MP3 from a local file URI (the natural-
  // voice TTS path on native). The optional cleanup runs once playback
  // finishes or is aborted, so callers can delete the temp file safely.
  const enqueueAudio = useCallback(
    (id: string, audioUri: string, placeName: string, cleanup?: () => void) => {
      queueRef.current.push({ id, audioUri, placeName, cleanup });
      processQueue();
    },
    [processQueue],
  );

  const stop = useCallback(() => {
    // Bump generation first so any in-flight callbacks are immediately
    // invalidated before the underlying engines are torn down.
    speechGenRef.current++;
    // Run cleanup on any queued-but-not-yet-played items so we don't leak
    // their temp files.
    for (const queued of queueRef.current) {
      if (queued.cleanup) {
        try {
          queued.cleanup();
        } catch {}
      }
    }
    queueRef.current = [];
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    teardownActive();
    if (Platform.OS === "web") {
      window.speechSynthesis.cancel();
    } else {
      Speech.stop();
    }
    speakingRef.current = false;
    interruptedRef.current = false;
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentPlace(null);
    setCurrentPlaceId(null);
  }, [teardownActive]);

  const pause = useCallback(() => {
    if (currentPlayerRef.current) {
      try {
        currentPlayerRef.current.pause();
      } catch {}
      suspendAudioWatchdog();
    } else if (Platform.OS === "web") {
      window.speechSynthesis.pause();
    } else {
      Speech.pause();
    }
    setIsPaused(true);
  }, [suspendAudioWatchdog]);

  const resume = useCallback(() => {
    if (currentPlayerRef.current) {
      try {
        currentPlayerRef.current.play();
      } catch {}
      resumeAudioWatchdog();
    } else if (Platform.OS === "web") {
      window.speechSynthesis.resume();
    } else {
      Speech.resume();
    }
    setIsPaused(false);
  }, [resumeAudioWatchdog]);

  const beginInterruption = useCallback(() => {
    if (interruptedRef.current) return;
    interruptedRef.current = true;
    if (!speakingRef.current) return;
    try {
      if (currentPlayerRef.current) {
        currentPlayerRef.current.pause();
        suspendAudioWatchdog();
      } else if (Platform.OS === "web") {
        window.speechSynthesis.pause();
      } else {
        Speech.pause();
      }
    } catch {}
    setIsPaused(true);
  }, [suspendAudioWatchdog]);

  const endInterruption = useCallback(() => {
    if (!interruptedRef.current) return;
    interruptedRef.current = false;
    if (speakingRef.current) {
      try {
        if (currentPlayerRef.current) {
          currentPlayerRef.current.play();
          resumeAudioWatchdog();
        } else if (Platform.OS === "web") {
          window.speechSynthesis.resume();
        } else {
          Speech.resume();
        }
      } catch {}
      setIsPaused(false);
    } else {
      // No active utterance — drain anything that landed in the queue while
      // we were interrupted (or just no-op if empty).
      processQueue();
    }
  }, [processQueue, resumeAudioWatchdog]);

  // Unmount safety net. The hook is owned by long-lived providers
  // (WalkModeContext / HeadingContext) so this rarely fires, but if a
  // provider tears down mid-playback we must still release the native player,
  // remove the listener, cancel the watchdog, and delete temp files. We
  // intentionally do NOT use stop() here because its identity is captured at
  // mount time only — see deps comment below.
  const teardownAllRef = useRef<() => void>(() => {});
  teardownAllRef.current = () => {
    speechGenRef.current++;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    for (const queued of queueRef.current) {
      if (queued.cleanup) {
        try {
          queued.cleanup();
        } catch {}
      }
    }
    queueRef.current = [];
    teardownActive();
    if (Platform.OS === "web") {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    } else {
      try {
        Speech.stop();
      } catch {}
    }
  };
  useEffect(() => {
    // Empty-deps effect: cleanup runs once, on unmount only.
    return () => {
      teardownAllRef.current?.();
    };
  }, []);

  const skip = useCallback(() => {
    // Bump generation before stopping so the callback from the current
    // playback is ignored and doesn't race with the next processQueue() call.
    speechGenRef.current++;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    teardownActive();
    if (Platform.OS === "web") {
      window.speechSynthesis.cancel();
    } else {
      Speech.stop();
    }
    speakingRef.current = false;
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentPlace(null);
    setCurrentPlaceId(null);
    setTimeout(() => processQueue(), 100);
  }, [processQueue, teardownActive]);

  return {
    enqueue,
    enqueueAudio,
    stop,
    pause,
    resume,
    skip,
    beginInterruption,
    endInterruption,
    isSpeaking,
    isPaused,
    currentPlace,
    currentPlaceId,
    queueLength: queueRef.current.length,
  };
}
