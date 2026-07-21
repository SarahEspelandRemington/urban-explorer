/**
 * TEMPORARY diagnostic scaffolding for A1a (iOS Now Playing, display-only).
 *
 * Narration is currently broken, so there is no way to exercise
 * NowPlaying.setNowPlaying / setPlaybackState / clear through real playback.
 * This component calls them directly and in isolation so the native
 * MPNowPlayingInfoCenter integration can be verified on a physical device
 * without depending on Walk Mode or narration state.
 *
 * The "Play Test Narration Clip" button isolates one further variable: does
 * an active expo-audio playback session (not narration-orchestration-
 * dependent, not silent) make Streetlit the iOS Now Playing app? It reuses
 * the exact production functions unmodified — enableBackgroundAudio() and
 * fetchNarrationPayload() (both already extracted/exported for standalone
 * use) — and calls expo-audio's createAudioPlayer()/play() directly, without
 * pulling in useNarration's queue/watchdog/Walk Mode orchestration. A
 * deliberate CHOICE, NOT a silent-audio workaround: it plays real,
 * server-generated narration audio.
 *
 * MUST BE REMOVED before any preview-profile build. __DEV__-gated at the
 * render site (app/walk-mode.tsx) as a second layer of protection, but this
 * file itself should not ship.
 */
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AudioPlayer } from "expo-audio";
import { NowPlaying } from "@/modules/expo-now-playing/src";
import { enableBackgroundAudio } from "@/hooks/useNarration";
import { fetchNarrationPayload } from "@/lib/fetchNarrationPayload";
import { API_BASE } from "@/lib/apiBase";
import { IS_EXPO_GO } from "@/lib/expoEnv";

// A real, well-documented place (not a synthetic/placeholder one) so a
// null/text-fallback result can't be explained away as the endpoint
// rejecting fabricated input — isolating this test to the one question it's
// meant to answer.
const TEST_PLACE = {
  id: "now-playing-dev-probe-test-clip",
  name: "Flatiron Building",
  category: "historic landmark",
  summary:
    "Iconic triangular 22-story skyscraper at the intersection of Fifth Avenue, Broadway, and East 22nd Street in Manhattan, completed in 1902.",
  facts: [
    "Designed by Daniel Burnham and completed in 1902.",
    "Its triangular footprint was shaped by the wedge-shaped plot at Fifth Avenue and Broadway.",
    "It was one of the tallest buildings in New York City at the time of its completion.",
  ],
};

export function NowPlayingDevProbe() {
  const [lastAction, setLastAction] = useState("(none yet)");
  const testPlayerRef = useRef<AudioPlayer | null>(null);
  const testCleanupRef = useRef<(() => void) | null>(null);

  const stopTestClip = () => {
    const player = testPlayerRef.current;
    if (player) {
      try {
        player.pause();
      } catch {}
      try {
        player.remove();
      } catch {}
      testPlayerRef.current = null;
    }
    const cleanup = testCleanupRef.current;
    testCleanupRef.current = null;
    if (cleanup) {
      try {
        cleanup();
      } catch {}
    }
  };

  useEffect(() => stopTestClip, []);

  const run = (label: string, fn: () => Promise<void>) => {
    fn()
      .then(() => {
        console.log(`[NowPlayingDevProbe] ${label} — resolved`);
        setLastAction(`${label} — ok (${new Date().toLocaleTimeString()})`);
      })
      .catch((err) => {
        console.log(`[NowPlayingDevProbe] ${label} — threw`, err);
        setLastAction(`${label} — ERROR: ${String(err)}`);
      });
  };

  const playTestClip = () =>
    run("playTestNarrationClip", async () => {
      stopTestClip();
      await enableBackgroundAudio();
      const payload = await fetchNarrationPayload(TEST_PLACE, {
        apiBase: API_BASE,
        isExpoGo: IS_EXPO_GO,
      });
      if (!payload) {
        throw new Error(
          "fetchNarrationPayload returned null (see breadcrumbs/console)",
        );
      }
      if (payload.kind !== "audio") {
        throw new Error(
          `fell back to text payload — audio endpoint did not return playable audio (text: "${payload.text.slice(0, 40)}...")`,
        );
      }
      testCleanupRef.current = payload.cleanup ?? null;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const expoAudio = require("expo-audio") as typeof import("expo-audio");
      const player = expoAudio.createAudioPlayer({ uri: payload.audioUri });
      testPlayerRef.current = player;
      player.play();
    });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NowPlaying dev probe (TEMP)</Text>
      <Text style={styles.line}>
        isSupported: {String(NowPlaying.isSupported)}
      </Text>
      <Text style={styles.line}>{lastAction}</Text>
      <View style={styles.row}>
        <Pressable
          style={styles.btn}
          onPress={() =>
            run("setNowPlaying", () =>
              NowPlaying.setNowPlaying("Test Place", "Streetlit", false, null),
            )
          }
        >
          <Text style={styles.btnText}>Set Now Playing</Text>
        </Pressable>
        <Pressable
          style={styles.btn}
          onPress={() =>
            run("setPlaybackState(true)", () =>
              NowPlaying.setPlaybackState(true),
            )
          }
        >
          <Text style={styles.btnText}>Set Paused</Text>
        </Pressable>
        <Pressable
          style={styles.btn}
          onPress={() =>
            run("setPlaybackState(false)", () =>
              NowPlaying.setPlaybackState(false),
            )
          }
        >
          <Text style={styles.btnText}>Set Playing</Text>
        </Pressable>
        <Pressable
          style={styles.btn}
          onPress={() => run("clear", () => NowPlaying.clear())}
        >
          <Text style={styles.btnText}>Clear</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={playTestClip}>
          <Text style={styles.btnText}>Play Test Narration Clip</Text>
        </Pressable>
        <Pressable
          style={styles.btn}
          onPress={() =>
            run("stopTestClip", async () => {
              stopTestClip();
            })
          }
        >
          <Text style={styles.btnText}>Stop Test Clip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 18,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f59e0b",
    backgroundColor: "#f59e0b22",
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
    marginBottom: 4,
  },
  line: {
    fontSize: 11,
    color: "#92400e",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  btn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#92400e",
  },
  btnText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "600",
  },
});
