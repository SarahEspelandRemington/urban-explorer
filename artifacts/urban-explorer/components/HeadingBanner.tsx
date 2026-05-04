import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePathname } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useHeading } from "@/contexts/HeadingContext";
import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";

function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 528) return `${Math.round(feet)} ft`;
  const miles = meters * 0.000621371;
  return `${miles.toFixed(2)} mi`;
}

export function HeadingBanner() {
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const heading = useHeading();

  // Hide on the immersive Walk Mode screens — they have their own narration UI.
  if (pathname?.startsWith("/walk-mode")) {
    return null;
  }
  if (!heading.target && !heading.audioPlace) return null;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const top = insets.top + webTopInset + 8;
  const bearing = heading.bearingDegrees ?? 0;

  // Banner can be in two modes:
  //   - heading: showing a navigation target (with arrow + distance), audio optional
  //   - listening only: just a deep-dive audio session, no navigation target
  const navPlace = heading.target;
  const audioPlace = heading.audioPlace;
  const headlinePlace = navPlace ?? audioPlace!;
  const showNav = !!navPlace;

  const isPaused = heading.narration.isPaused;
  const isSpeaking = heading.narration.isSpeaking;
  const showAudioButton =
    !!audioPlace &&
    (isSpeaking || isPaused || heading.isAudioLoading || !!heading.audioError);

  const onTogglePause = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPaused) heading.narration.resume();
    else heading.narration.pause();
  };

  const onRetry = () => {
    const p = audioPlace ?? navPlace;
    if (p) heading.listen(p);
  };

  const onCancel = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    heading.cancel();
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top }]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={[
          styles.banner,
          {
            backgroundColor: colors.card,
            borderColor: colors.primary + "55",
            shadowColor: "#000",
          },
        ]}
        accessibilityLabel={
          showNav
            ? `${t.headingBanner.headingTo} ${headlinePlace.name}${
                heading.distanceMeters != null
                  ? `, ${formatDistance(heading.distanceMeters)} ${t.headingBanner.awayAccessibility}`
                  : ""
              }`
            : `${t.headingBanner.nowPlayingDeepDiveAboutAccessibility} ${headlinePlace.name}`
        }
      >
        <View
          style={[
            styles.arrowWrap,
            { backgroundColor: colors.primary + "1f" },
          ]}
        >
          {showNav ? (
            <View style={{ transform: [{ rotate: `${bearing}deg` }] }}>
              <Feather name="navigation-2" size={20} color={colors.primary} />
            </View>
          ) : (
            <Feather name="headphones" size={20} color={colors.primary} />
          )}
        </View>

        <View style={styles.textCol}>
          <View style={styles.topRow}>
            <Text
              style={[styles.label, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {showNav ? t.headingBanner.headingTo : t.walkMode.nowPlaying}
            </Text>
            {showNav && heading.distanceMeters != null && (
              <Text style={[styles.distance, { color: colors.primary }]}>
                {formatDistance(heading.distanceMeters)}
                {heading.cardinal ? ` · ${heading.cardinal}` : ""}
              </Text>
            )}
          </View>
          <Text
            style={[styles.name, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {headlinePlace.name}
          </Text>
          {heading.audioError ? (
            <Pressable
              onPress={onRetry}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t.headingBanner.retryAudioAccessibility}
            >
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {heading.audioError} {t.headingBanner.tapToRetry}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {showAudioButton && !heading.audioError && (
          <Pressable
            onPress={onTogglePause}
            hitSlop={12}
            disabled={heading.isAudioLoading}
            accessibilityRole="button"
            accessibilityLabel={
              heading.isAudioLoading
                ? t.headingBanner.loadingAudioAccessibility
                : isPaused
                  ? t.headingBanner.resumeAudioAccessibility
                  : t.headingBanner.pauseAudioAccessibility
            }
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: colors.muted,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {heading.isAudioLoading ? (
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <Feather
                name={isPaused ? "play" : "pause"}
                size={16}
                color={colors.foreground}
              />
            )}
          </Pressable>
        )}

        <Pressable
          onPress={onCancel}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t.headingBanner.stopHeadingAccessibility}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.muted,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather name="x" size={16} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 50,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  arrowWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, minWidth: 0 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  distance: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
