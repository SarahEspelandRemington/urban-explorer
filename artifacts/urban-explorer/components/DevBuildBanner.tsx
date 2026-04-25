import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

const IS_EXPO_GO = Constants.appOwnership === "expo";

/**
 * Developer-only banner that shows at the top of the app while in __DEV__ mode.
 *
 * • In Expo Go   → amber warning: narration is in text-to-speech fallback mode.
 *                  Shows the EAS build command so the developer knows what to do next.
 * • In dev build → green confirmation: full audio pipeline (MP3 narration, lock-screen
 *                  controls, background location) is active.
 *
 * Prerequisite steps to trigger a dev build:
 *   1. npm install -g eas-cli          (once, on your machine)
 *   2. eas login                        (expo.dev account required)
 *   3. Apple Developer account ($99/yr) for iOS device provisioning
 *   4. cd artifacts/urban-explorer && eas build --profile development --platform ios
 *   5. Scan the QR code EAS emails you to install the .ipa directly on your iPhone.
 *
 * The banner is completely stripped from production builds (guarded by __DEV__).
 */
export function DevBuildBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (!__DEV__) return null;
  if (dismissed) return null;
  if (Platform.OS === "web") return null;

  const statusBarHeight = Constants.statusBarHeight ?? 44;

  return (
    <View
      style={[
        styles.banner,
        IS_EXPO_GO ? styles.expoGoBanner : styles.devBuildBanner,
        { top: statusBarHeight },
      ]}
    >
      <Feather
        name={IS_EXPO_GO ? "alert-circle" : "check-circle"}
        size={13}
        color="#fff"
        style={styles.icon}
      />
      <Text style={styles.text} numberOfLines={2}>
        {IS_EXPO_GO
          ? "Expo Go — narration uses text-to-speech fallback. Build with EAS for MP3 audio + background location: eas build --profile development --platform ios"
          : "Dev build active — MP3 narration, background location, and lock-screen controls are all enabled."}
      </Text>
      <Pressable onPress={() => setDismissed(true)} hitSlop={16} style={styles.closeBtn}>
        <Feather name="x" size={13} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  expoGoBanner: {
    backgroundColor: "#92400e",
  },
  devBuildBanner: {
    backgroundColor: "#166534",
  },
  icon: {
    flexShrink: 0,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 11,
    color: "#fff",
    lineHeight: 15,
    opacity: 0.95,
  },
  closeBtn: {
    flexShrink: 0,
    padding: 2,
  },
});
