import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WalkModeMap } from "@/components/WalkModeMap";
import { useWalkMode, type WalkDensity } from "@/contexts/WalkModeContext";
import { useColors } from "@/hooks/useColors";
import { unlockWebSpeech } from "@/hooks/useNarration";

export default function WalkModeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const walk = useWalkMode();

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useEffect(() => {
    unlockWebSpeech();
    if (!walk.isWalking) {
      walk.startWalk();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    walk.stopWalk();
    router.dismissAll?.();
    router.replace("/(tabs)");
  };

  const setDensity = (d: WalkDensity) => {
    if (d === walk.density) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    walk.setDensity(d);
  };

  const togglePause = () => {
    if (walk.narration.isPaused) walk.narration.resume();
    else walk.narration.pause();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + webTopInset + 8,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Pressable
          onPress={handleStop}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel="End walk"
          style={({ pressed }) => [
            styles.headerHomeButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Feather name="x" size={16} color={colors.foreground} />
          <Text style={[styles.headerHomeText, { color: colors.foreground }]}>End</Text>
        </Pressable>

        <View style={styles.walkingIndicator}>
          <View style={[styles.liveDot, { backgroundColor: "#22c55e" }]} />
          <Text style={[styles.walkingText, { color: colors.foreground }]}>Walking</Text>
        </View>

        <View style={[styles.densityToggle, { backgroundColor: colors.muted }]}>
          {(["sparse", "dense"] as const).map((d) => {
            const active = walk.density === d;
            return (
              <Pressable
                key={d}
                onPress={() => setDensity(d)}
                accessibilityRole="button"
                accessibilityLabel={d === "sparse" ? "Sparse stories" : "Dense stories"}
                accessibilityState={{ selected: active }}
                style={[
                  styles.densityButton,
                  active && { backgroundColor: colors.card },
                ]}
              >
                <Text
                  style={[
                    styles.densityText,
                    {
                      color: active ? colors.foreground : colors.mutedForeground,
                      fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                    },
                  ]}
                >
                  {d === "sparse" ? "Sparse" : "Dense"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.mapContainer}>
        {walk.currentLocation ? (
          <WalkModeMap
            userLatitude={walk.currentLocation.latitude}
            userLongitude={walk.currentLocation.longitude}
            places={walk.nearbyPlaces}
            narratedIds={walk.narratedIds}
            onOpenPlace={(place) => {
              router.push({
                pathname: "/place-detail",
                params: {
                  name: place.name,
                  latitude: String(place.latitude),
                  longitude: String(place.longitude),
                  category: place.category ?? "",
                  yearBuilt: place.yearBuilt ?? "",
                  tags: JSON.stringify(place.tags ?? []),
                  summary: place.summary ?? "",
                  facts: JSON.stringify(place.facts ?? []),
                  address: place.address ?? "",
                },
              });
            }}
          />
        ) : (
          <View style={[styles.loadingMap, { backgroundColor: colors.muted }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Getting your location…
            </Text>
          </View>
        )}
      </View>

      <View style={styles.cardSlot}>
        {walk.narration.currentPlace ? (
          <Animated.View
            entering={Platform.OS !== "web" ? FadeInDown.springify() : undefined}
            exiting={Platform.OS !== "web" ? FadeOut : undefined}
            style={[styles.nowPlaying, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Now playing: ${walk.narration.currentPlace}`}
          >
            <View style={[styles.nowPlayingIcon, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="headphones" size={18} color={colors.primary} />
            </View>
            <View style={styles.nowPlayingText}>
              <Text style={[styles.nowPlayingLabel, { color: colors.mutedForeground }]}>
                Now playing
              </Text>
              <Text style={[styles.nowPlayingTitle, { color: colors.foreground }]} numberOfLines={2}>
                {walk.narration.currentPlace}
              </Text>
            </View>
            <Pressable
              onPress={togglePause}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel={walk.narration.isPaused ? "Resume" : "Pause"}
              style={[styles.iconBtn, { backgroundColor: colors.muted }]}
            >
              <Feather
                name={walk.narration.isPaused ? "play" : "pause"}
                size={18}
                color={colors.foreground}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                walk.narration.skip();
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Skip"
              style={[styles.iconBtn, { backgroundColor: colors.muted }]}
            >
              <Feather name="skip-forward" size={18} color={colors.foreground} />
            </Pressable>
          </Animated.View>
        ) : walk.isLoading ? (
          <Animated.View
            entering={Platform.OS !== "web" ? FadeIn : undefined}
            style={[styles.nowPlaying, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.scanningText, { color: colors.mutedForeground }]}>
              Listening for stories nearby…
            </Text>
          </Animated.View>
        ) : (
          <View style={[styles.nowPlaying, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.nowPlayingIcon, { backgroundColor: colors.muted }]}>
              <Feather name="navigation" size={18} color={colors.mutedForeground} />
            </View>
            <View style={styles.nowPlayingText}>
              <Text style={[styles.nowPlayingLabel, { color: colors.mutedForeground }]}>
                Keep walking
              </Text>
              <Text style={[styles.nowPlayingTitle, { color: colors.foreground }]}>
                {walk.density === "dense" ? "Stories will play often" : "Stories will play as you go"}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={[styles.statsLine, { color: colors.mutedForeground }]}>
          {walk.stats.placesNarrated} {walk.stats.placesNarrated === 1 ? "story" : "stories"} so far
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerHomeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  headerHomeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  walkingIndicator: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  walkingText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  densityToggle: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 3,
  },
  densityButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  densityText: { fontSize: 12 },
  mapContainer: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  loadingMap: {
    flex: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  cardSlot: {
    paddingHorizontal: 16,
    minHeight: 88,
  },
  nowPlaying: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  nowPlayingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  nowPlayingText: { flex: 1, minWidth: 0 },
  nowPlayingLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nowPlayingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  scanningText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    alignItems: "center",
  },
  statsLine: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
