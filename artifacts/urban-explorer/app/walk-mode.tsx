import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WalkModeMap } from "@/components/WalkModeMap";
import { useWalkMode } from "@/contexts/WalkModeContext";
import { useColors } from "@/hooks/useColors";
import { unlockWebSpeech } from "@/hooks/useNarration";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function WalkModeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const walk = useWalkMode();
  const [elapsed, setElapsed] = useState(0);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const planned = walk.plannedRoute;
  const totalRouteMeters = planned?.distanceMeters ?? 0;
  const progressPct =
    totalRouteMeters > 0
      ? Math.max(0, Math.min(100, (walk.routeProgressMeters / totalRouteMeters) * 100))
      : 0;

  useEffect(() => {
    if (!walk.isWalking) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - walk.stats.startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [walk.isWalking, walk.stats.startTime]);

  useEffect(() => {
    unlockWebSpeech();
    if (!walk.isWalking) {
      walk.startWalk();
    }
    return () => {};
  }, []);

  const handleStop = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    walk.stopWalk();
    walk.setPlannedRoute(null);
    router.back();
  };

  const totalStories = planned ? planned.places.length : walk.nearbyPlaces.length;

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
        <View style={styles.headerTop}>
          <Pressable
            onPress={handleStop}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel="End walk and go back"
            style={styles.headerButton}
          >
            <Feather name="x" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.walkingIndicator}>
            <View style={[styles.liveDot, { backgroundColor: "#22c55e" }]} />
            <Text style={[styles.walkingText, { color: colors.foreground }]}>
              {planned ? "On Route" : "Walking"}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (walk.narration.isPaused) walk.narration.resume();
              else walk.narration.pause();
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel={walk.narration.isPaused ? "Resume narration" : "Pause narration"}
            style={styles.headerButton}
          >
            <Feather
              name={walk.narration.isPaused ? "volume-x" : "volume-2"}
              size={22}
              color={colors.foreground}
            />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Feather name="clock" size={14} color={colors.mutedForeground} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {formatDuration(elapsed)}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <MaterialCommunityIcons name="map-marker-check" size={14} color={colors.mutedForeground} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {walk.stats.placesNarrated}/{totalStories} stories
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Feather name="navigation" size={14} color={colors.mutedForeground} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {planned
                ? `${formatDistance(walk.routeProgressMeters)} / ${formatDistance(totalRouteMeters)}`
                : formatDistance(walk.stats.distanceWalked)}
            </Text>
          </View>
        </View>

        {planned && (
          <View
            style={[styles.progressTrack, { backgroundColor: colors.border }]}
            accessibilityLabel={`Route progress: ${Math.round(progressPct)} percent`}
          >
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: `${progressPct}%` },
              ]}
            />
          </View>
        )}
      </View>

      <View style={styles.mapContainer}>
        {walk.currentLocation ? (
          <WalkModeMap
            userLatitude={walk.currentLocation.latitude}
            userLongitude={walk.currentLocation.longitude}
            places={walk.nearbyPlaces}
            narratedIds={walk.narratedIds}
            routeGeometry={planned?.geometry}
            startPoint={planned ? planned.start : null}
            endPoint={planned ? planned.end : null}
          />
        ) : (
          <View style={[styles.loadingMap, { backgroundColor: colors.muted }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Getting your location...
            </Text>
          </View>
        )}
      </View>

      {planned && walk.nextPlace && !walk.narration.currentPlace && (
        <Animated.View
          entering={Platform.OS !== "web" ? FadeInDown.springify() : undefined}
          style={[styles.nextCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Next up: ${walk.nextPlace.name} in ${walk.nextPlaceDistanceMeters} meters`}
        >
          <View style={[styles.nextIcon, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="navigation-2" size={16} color={colors.primary} />
          </View>
          <View style={styles.nextText}>
            <Text style={[styles.nextLabel, { color: colors.mutedForeground }]}>Next up</Text>
            <Text style={[styles.nextPlace, { color: colors.foreground }]} numberOfLines={1}>
              {walk.nextPlace.name}
            </Text>
          </View>
          {walk.nextPlaceDistanceMeters !== null && (
            <Text style={[styles.nextDistance, { color: colors.primary }]}>
              {formatDistance(walk.nextPlaceDistanceMeters)}
            </Text>
          )}
        </Animated.View>
      )}

      {walk.narration.currentPlace && (
        <Animated.View
          entering={Platform.OS !== "web" ? FadeInDown.springify() : undefined}
          exiting={Platform.OS !== "web" ? FadeOut : undefined}
          style={[styles.narrationCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Now playing: ${walk.narration.currentPlace}`}
        >
          <View style={styles.narrationHeader}>
            <View style={[styles.narrationIcon, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="headphones" size={16} color={colors.primary} />
            </View>
            <View style={styles.narrationText}>
              <Text style={[styles.narrationLabel, { color: colors.mutedForeground }]}>
                Now playing
              </Text>
              <Text style={[styles.narrationPlace, { color: colors.foreground }]} numberOfLines={1}>
                {walk.narration.currentPlace}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                walk.narration.skip();
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              hitSlop={20}
              accessibilityRole="button"
              accessibilityLabel="Skip to next narration"
              style={styles.headerButton}
            >
              <Feather name="skip-forward" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {walk.isLoading && !walk.narration.currentPlace && (
        <Animated.View
          entering={Platform.OS !== "web" ? FadeIn : undefined}
          style={[styles.narrationCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Scanning for nearby stories"
        >
          <View style={styles.narrationHeader}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.scanningText, { color: colors.mutedForeground }]}>
              Scanning for nearby stories...
            </Text>
          </View>
        </Animated.View>
      )}

      {walk.nearbyPlaces.length > 0 && !walk.isLoading && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.placeChips}
        >
          {walk.nearbyPlaces.map((place) => {
            const isNarrated = walk.narratedIds.has(place.id);
            return (
              <View
                key={place.id}
                style={[
                  styles.placeChip,
                  {
                    backgroundColor: isNarrated ? colors.primary + "18" : colors.card,
                    borderColor: isNarrated ? colors.primary + "40" : colors.border,
                  },
                ]}
              >
                <Feather
                  name={isNarrated ? "check-circle" : "map-pin"}
                  size={12}
                  color={isNarrated ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.placeChipText,
                    { color: isNarrated ? colors.primary : colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {place.name}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleStop}
          style={({ pressed }) => [
            styles.stopButton,
            {
              backgroundColor: "#ef4444",
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="End walk"
        >
          <Feather name="square" size={18} color="#fff" />
          <Text style={styles.stopText}>End Walk</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  walkingIndicator: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  walkingText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  statValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  statDivider: { width: 1, height: 16 },
  progressTrack: {
    marginTop: 12,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
  mapContainer: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 8,
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
  nextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  nextIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  nextText: { flex: 1 },
  nextLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nextPlace: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  nextDistance: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  narrationCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  narrationHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  narrationIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  narrationText: { flex: 1 },
  narrationLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  narrationPlace: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  scanningText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  placeChips: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  placeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 200,
  },
  placeChipText: { fontSize: 12, fontFamily: "Inter_500Medium", flexShrink: 1 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 8 },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  stopText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
