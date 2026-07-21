/**
 * TEMPORARY diagnostic scaffolding for A1a (iOS Now Playing, display-only).
 *
 * Narration is currently broken, so there is no way to exercise
 * NowPlaying.setNowPlaying / setPlaybackState / clear through real playback.
 * This component calls them directly and in isolation so the native
 * MPNowPlayingInfoCenter integration can be verified on a physical device
 * without depending on Walk Mode or narration state.
 *
 * MUST BE REMOVED before any preview-profile build. __DEV__-gated at the
 * render site (app/walk-mode.tsx) as a second layer of protection, but this
 * file itself should not ship.
 */
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NowPlaying } from "@/modules/expo-now-playing/src";

export function NowPlayingDevProbe() {
  const [lastAction, setLastAction] = useState("(none yet)");

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
