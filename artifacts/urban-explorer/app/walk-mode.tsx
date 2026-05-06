import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WalkModeMap } from "@/components/WalkModeMap";
import { useT } from "@/contexts/LocaleContext";
import { useWalkMode, type WalkDensity } from "@/contexts/WalkModeContext";
import { useColors } from "@/hooks/useColors";
import { unlockWebSpeech } from "@/hooks/useNarration";
import {
  BUILDING_TYPE_GROUPS,
  type BuildingGroupKey,
} from "@/constants/buildingTypeGroups";

export default function WalkModeScreen() {
  const colors = useColors();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const walk = useWalkMode();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useEffect(() => {
    unlockWebSpeech();
    if (!walk.isWalking) {
      walk.startWalk();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = () => {
    Alert.alert(t.walkMode.confirmEndTitle, t.walkMode.confirmEndMessage, [
      { text: t.walkMode.confirmEndCancel, style: "cancel" },
      {
        text: t.walkMode.confirmEndOk,
        style: "destructive",
        onPress: () => {
          if (Platform.OS !== "web")
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          walk.stopWalk();
          router.dismissAll?.();
          router.replace("/(tabs)/walk");
        },
      },
    ]);
  };

  const setDensity = (d: WalkDensity) => {
    if (d === walk.density) return;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    walk.setDensity(d);
  };

  const togglePause = () => {
    if (walk.narration.isPaused) walk.narration.resume();
    else walk.narration.pause();
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleBuildingGroup = (key: BuildingGroupKey) => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = new Set(walk.enabledBuildingGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    walk.setEnabledBuildingGroups(next);
  };

  const togglePrefetchStats = (next: boolean) => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    walk.setShowPrefetchStats(next);
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
          accessibilityLabel={t.walkMode.endWalkAccessibility}
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
          <Text style={[styles.headerHomeText, { color: colors.foreground }]}>
            {t.walkMode.end}
          </Text>
        </Pressable>

        <View style={styles.walkingIndicator}>
          <View style={[styles.liveDot, { backgroundColor: "#22c55e" }]} />
          <Text style={[styles.walkingText, { color: colors.foreground }]}>
            {t.walkMode.walking}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <View
            style={[styles.densityToggle, { backgroundColor: colors.muted }]}
          >
            {(["sparse", "dense"] as const).map((d) => {
              const active = walk.density === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDensity(d)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    d === "sparse"
                      ? t.walkMode.fewerResultsAccessibility
                      : t.walkMode.moreResultsAccessibility
                  }
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
                        color: active
                          ? colors.foreground
                          : colors.mutedForeground,
                        fontFamily: active
                          ? "Inter_600SemiBold"
                          : "Inter_500Medium",
                      },
                    ]}
                  >
                    {d === "sparse" ? t.walkMode.sparse : t.walkMode.dense}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => {
              if (Platform.OS !== "web")
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSettingsVisible(true);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t.walkMode.buildingFiltersAccessibility}
            style={({ pressed }) => [
              styles.settingsBtn,
              {
                backgroundColor:
                  walk.enabledBuildingGroups.size > 0
                    ? colors.primary + "22"
                    : colors.muted,
                borderColor:
                  walk.enabledBuildingGroups.size > 0
                    ? colors.primary
                    : colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Feather
              name="sliders"
              size={14}
              color={
                walk.enabledBuildingGroups.size > 0
                  ? colors.primary
                  : colors.mutedForeground
              }
            />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSettingsVisible(false)}
        >
          <Pressable
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => {}}
          >
            <View
              style={[styles.modalHandle, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t.walkMode.buildingFilters}
            </Text>
            <Text
              style={[
                styles.modalDescription,
                { color: colors.mutedForeground },
              ]}
            >
              {t.walkMode.buildingFiltersDescription}
            </Text>
            <ScrollView
              style={styles.modalGroups}
              showsVerticalScrollIndicator={false}
            >
              {__DEV__ && (
                <Pressable
                  onPress={() => togglePrefetchStats(!walk.showPrefetchStats)}
                  style={[
                    styles.groupRow,
                    { borderBottomColor: colors.border },
                  ]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: walk.showPrefetchStats }}
                  accessibilityLabel={t.walkMode.showPrefetchStats}
                >
                  <View style={styles.groupText}>
                    <Text
                      style={[styles.groupName, { color: colors.foreground }]}
                    >
                      {t.walkMode.showPrefetchStats}
                    </Text>
                    <Text
                      style={[
                        styles.groupDesc,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {t.walkMode.showPrefetchStatsDescription}
                    </Text>
                  </View>
                  <Switch
                    value={walk.showPrefetchStats}
                    onValueChange={togglePrefetchStats}
                    trackColor={{
                      false: colors.muted,
                      true: colors.primary + "80",
                    }}
                    thumbColor={
                      walk.showPrefetchStats
                        ? colors.primary
                        : colors.mutedForeground
                    }
                  />
                </Pressable>
              )}
              {BUILDING_TYPE_GROUPS.map((group) => {
                const key = group.key as BuildingGroupKey;
                const enabled = walk.enabledBuildingGroups.has(key);
                const labelKey =
                  `buildingGroup${group.key.charAt(0).toUpperCase()}${group.key.slice(1)}` as keyof typeof t.walkMode;
                const descKey =
                  `buildingGroup${group.key.charAt(0).toUpperCase()}${group.key.slice(1)}Desc` as keyof typeof t.walkMode;
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleBuildingGroup(key)}
                    style={[
                      styles.groupRow,
                      {
                        borderBottomColor: colors.border,
                      },
                    ]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: enabled }}
                  >
                    <View style={styles.groupText}>
                      <Text
                        style={[styles.groupName, { color: colors.foreground }]}
                      >
                        {String(t.walkMode[labelKey])}
                      </Text>
                      <Text
                        style={[
                          styles.groupDesc,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {String(t.walkMode[descKey])}
                      </Text>
                    </View>
                    <Switch
                      value={enabled}
                      onValueChange={() => toggleBuildingGroup(key)}
                      trackColor={{
                        false: colors.muted,
                        true: colors.primary + "80",
                      }}
                      thumbColor={
                        enabled ? colors.primary : colors.mutedForeground
                      }
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => setSettingsVisible(false)}
              style={[
                styles.modalCloseBtn,
                { backgroundColor: colors.primary },
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.modalCloseBtnText}>{t.common.ok}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
            <Text
              style={[styles.loadingText, { color: colors.mutedForeground }]}
            >
              {t.walkMode.gettingLocation}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.cardSlot}>
        {walk.narration.currentPlace ? (
          <Animated.View
            entering={
              Platform.OS !== "web" ? FadeInDown.springify() : undefined
            }
            exiting={Platform.OS !== "web" ? FadeOut : undefined}
            style={[
              styles.nowPlaying,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={t.walkMode.nowPlayingPlaceAccessibility(
              walk.narration.currentPlace,
            )}
          >
            {(() => {
              const photoUrl = walk.currentNarrationPlace?.photoUrl;
              return photoUrl ? (
                <Image
                  source={{ uri: photoUrl }}
                  style={styles.nowPlayingPhoto}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.nowPlayingIcon,
                    { backgroundColor: colors.primary + "18" },
                  ]}
                >
                  <Feather name="headphones" size={18} color={colors.primary} />
                </View>
              );
            })()}
            <View style={styles.nowPlayingText}>
              <View style={styles.nowPlayingLabelRow}>
                <Text
                  style={[
                    styles.nowPlayingLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {t.walkMode.nowPlaying}
                </Text>
                {walk.isReplay ? (
                  <Animated.View
                    entering={
                      Platform.OS !== "web" ? FadeIn.duration(200) : undefined
                    }
                    exiting={
                      Platform.OS !== "web" ? FadeOut.duration(200) : undefined
                    }
                    style={[
                      styles.replayBadge,
                      {
                        backgroundColor: colors.primary + "1f",
                        borderColor: colors.primary + "55",
                      },
                    ]}
                    accessibilityLabel={t.walkMode.replayBadge}
                  >
                    <Feather
                      name="rotate-ccw"
                      size={10}
                      color={colors.primary}
                    />
                    <Text
                      style={[
                        styles.replayBadgeText,
                        { color: colors.primary },
                      ]}
                    >
                      {t.walkMode.replayBadge}
                    </Text>
                  </Animated.View>
                ) : null}
              </View>
              <Text
                style={[styles.nowPlayingTitle, { color: colors.foreground }]}
                numberOfLines={2}
              >
                {walk.narration.currentPlace}
              </Text>
            </View>
            <Pressable
              onPress={togglePause}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel={
                walk.narration.isPaused
                  ? t.walkMode.resumeAccessibility
                  : t.walkMode.pauseAccessibility
              }
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
                if (Platform.OS !== "web")
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel={t.walkMode.skipAccessibility}
              style={[styles.iconBtn, { backgroundColor: colors.muted }]}
            >
              <Feather
                name="skip-forward"
                size={18}
                color={colors.foreground}
              />
            </Pressable>
          </Animated.View>
        ) : walk.isLoading ? (
          <Animated.View
            entering={Platform.OS !== "web" ? FadeIn : undefined}
            style={[
              styles.nowPlaying,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text
              style={[styles.scanningText, { color: colors.mutedForeground }]}
            >
              {t.walkMode.listening}
            </Text>
          </Animated.View>
        ) : (
          <View
            style={[
              styles.nowPlaying,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[styles.nowPlayingIcon, { backgroundColor: colors.muted }]}
            >
              <Feather
                name="navigation"
                size={18}
                color={colors.mutedForeground}
              />
            </View>
            <View style={styles.nowPlayingText}>
              <Text
                style={[
                  styles.nowPlayingLabel,
                  { color: colors.mutedForeground },
                ]}
              >
                {t.walkMode.keepWalking}
              </Text>
              <Text
                style={[styles.nowPlayingTitle, { color: colors.foreground }]}
              >
                {walk.density === "dense"
                  ? t.walkMode.storiesOften
                  : t.walkMode.storiesAsYouGo}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={[styles.statsLine, { color: colors.mutedForeground }]}>
          {t.walkMode.storiesSoFar(walk.stats.placesNarrated)}
        </Text>
        {__DEV__ || walk.showPrefetchStats ? (
          <Text
            style={[styles.debugLine, { color: colors.mutedForeground }]}
            accessibilityLabel="Prefetch cache stats"
          >
            {(() => {
              const s = walk.prefetchStats;
              // Hit-rate denominator is HIT + MISS only — these are the
              // events that come exclusively from fetchNarration's lookup
              // path. STALE_DISCARD also fires when runPrefetchCycle
              // overwrites a stale cache entry, so including it would
              // conflate "lookup miss" with "prefetch churn" and
              // understate the real lookup hit rate.
              const lookups = s.HIT + s.MISS;
              const rate =
                lookups > 0 ? Math.round((s.HIT / lookups) * 100) : 0;
              return `prefetch  hit ${s.HIT}/${lookups} (${rate}%)  stale ${s.STALE_DISCARD}  stop ${s.STOP_WALK_DISCARD}  dedupe ${s.DEDUPE}`;
            })()}
          </Text>
        ) : null}
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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  nowPlayingPhoto: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  nowPlayingText: { flex: 1, minWidth: 0 },
  nowPlayingLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nowPlayingLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  replayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  replayBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  nowPlayingTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
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
  debugLine: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    opacity: 0.7,
  },
  settingsBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  modalDescription: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 16,
    lineHeight: 18,
  },
  modalGroups: {
    maxHeight: 300,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  groupText: { flex: 1, minWidth: 0 },
  groupName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  groupDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  modalCloseBtn: {
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCloseBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
