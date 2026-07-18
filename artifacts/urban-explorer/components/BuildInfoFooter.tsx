import * as Application from "expo-application";
import Constants from "expo-constants";
import React from "react";
import { Alert, Platform, Pressable, StyleSheet, Text } from "react-native";

import { useColors } from "@/hooks/useColors";
import { API_BASE } from "@/lib/apiBase";

/**
 * Always-tappable build info readout for field-test debugging (confirming
 * which build a device is running and which API it's pointed at).
 *
 * Build number uses `Application.nativeBuildVersion` (CFBundleVersion /
 * versionCode) rather than `Updates.updateId`, because this project has no
 * EAS Update channel/runtimeVersion configured — `updateId` is always null
 * here. `nativeBuildVersion` reflects what's actually baked into the
 * installed native binary and changes on every EAS build.
 */
export function BuildInfoFooter() {
  const colors = useColors();

  const version = Constants.expoConfig?.version ?? "unknown";
  const buildNumber =
    Platform.OS === "web"
      ? "web"
      : (Application.nativeBuildVersion ?? "unknown");
  const buildDate = Constants.expoConfig?.extra?.buildDate as
    | string
    | undefined;

  function showDetails() {
    Alert.alert(
      "Build Info",
      [
        `Version: ${version}`,
        `Build: ${buildNumber}`,
        `Build date: ${buildDate ? new Date(buildDate).toLocaleString() : "unknown"}`,
        `API: ${API_BASE}`,
      ].join("\n"),
    );
  }

  return (
    <Pressable
      onPress={showDetails}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Show build info"
      style={styles.container}
    >
      <Text
        style={[styles.text, { color: colors.mutedForeground }]}
        numberOfLines={1}
      >
        v{version} ({buildNumber})
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-end",
    paddingVertical: 2,
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  text: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    opacity: 0.5,
  },
});
