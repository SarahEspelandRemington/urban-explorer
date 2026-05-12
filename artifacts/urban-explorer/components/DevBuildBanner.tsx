import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import { IS_EXPO_GO } from "../lib/expoEnv";
import { captureMessage, hasDsn } from "../lib/sentry";

// Versioned key — bump the suffix if we ever want to force the banner to
// re-appear (e.g. to surface a new dev-only notice).
const DISMISS_KEY = "urban-explorer.devBanner.dismissed.v1";

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
  // `null` = still loading the persisted preference; `true`/`false` = known.
  // Hide while loading so a dismissed banner never flashes on cold launch.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [sentryBtnSent, setSentryBtnSent] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(DISMISS_KEY)
      .then((v) => {
        if (!cancelled) setDismissed(v === "1");
      })
      .catch(() => {
        if (!cancelled) setDismissed(false);
      });
    return () => {
      cancelled = true;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (btnTimer.current) clearTimeout(btnTimer.current);
    };
  }, []);

  function handleDismiss() {
    setDismissed(true);
    // Fire-and-forget; banner already hidden, so a write failure is harmless.
    AsyncStorage.setItem(DISMISS_KEY, "1").catch(() => {
      /* ignore */
    });
  }

  if (!__DEV__) return null;
  if (dismissed !== false) return null;
  if (Platform.OS === "web") return null;

  const statusBarHeight = Constants.statusBarHeight ?? 44;

  function showToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.timing(toastAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, 3000);
  }

  function handleTestSentry() {
    captureMessage("Test event from Urban Explorer dev build");
    setSentryBtnSent(true);
    if (btnTimer.current) clearTimeout(btnTimer.current);
    btnTimer.current = setTimeout(() => setSentryBtnSent(false), 3000);
    showToast();
  }

  const toastOpacity = toastAnim;
  const toastTranslateY = toastAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  const bannerHeight = 36;

  return (
    <>
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
            ? "Expo Go — TTS fallback. For full audio: eas build --profile development --platform ios"
            : "Dev build — MP3 narration, background location & lock-screen controls active."}
        </Text>
        {hasDsn && (
          <Pressable
            onPress={handleTestSentry}
            hitSlop={8}
            style={[styles.sentryBtn, sentryBtnSent && styles.sentryBtnSent]}
          >
            <Text style={styles.sentryBtnText}>
              {sentryBtnSent ? "Sent ✓" : "Test Sentry"}
            </Text>
          </Pressable>
        )}
        <Pressable onPress={handleDismiss} hitSlop={16} style={styles.closeBtn}>
          <Feather name="x" size={13} color="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          { top: statusBarHeight + bannerHeight + 8 },
          {
            opacity: toastOpacity,
            transform: [{ translateY: toastTranslateY }],
          },
        ]}
      >
        <Text style={styles.toastText}>
          Sentry event sent — check your dashboard
        </Text>
      </Animated.View>
    </>
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
  sentryBtn: {
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sentryBtnSent: {
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  sentryBtnText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "600",
  },
  closeBtn: {
    flexShrink: 0,
    padding: 2,
  },
  toast: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 9999,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
});
