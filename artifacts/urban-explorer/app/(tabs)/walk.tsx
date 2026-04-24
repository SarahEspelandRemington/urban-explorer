import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useWalkMode } from "@/contexts/WalkModeContext";
import { useColors } from "@/hooks/useColors";
import { unlockWebSpeech } from "@/hooks/useNarration";
import { loadRecentRoutes, type RecentRoute } from "@/lib/recentRoutes";

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(secs: number): string {
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const WALK_BANNER_KEY = "walk_banner_dismissed";

export default function WalkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isWalking } = useWalkMode();

  const [recentRoutes, setRecentRoutes] = useState<RecentRoute[]>([]);

  useEffect(() => {
    AsyncStorage.setItem(WALK_BANNER_KEY, "1");
  }, []);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadRecentRoutes().then((routes) => {
        if (active) setRecentRoutes(routes);
      });
      return () => { active = false; };
    }, []),
  );

  const handleStartWalking = () => {
    unlockWebSpeech();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/walk-mode");
  };

  const handlePlanRoute = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/walk-plan");
  };

  const handleResumeWalk = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/walk-mode");
  };

  const handleReRunRoute = (route: RecentRoute) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/walk-plan",
      params: {
        prefillStart: route.startText,
        prefillEnd: route.endText,
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + webTopInset + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Walk</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Explore the city with live audio stories
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + webBottomInset + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isWalking && (
          <Pressable
            onPress={handleResumeWalk}
            style={({ pressed }) => [
              styles.inProgressCard,
              {
                backgroundColor: colors.primary + "14",
                borderColor: colors.primary + "60",
                opacity: pressed ? 0.88 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Resume active walk"
            accessibilityHint="Return to your active walking session"
          >
            <View style={styles.inProgressLeft}>
              <View
                style={[
                  styles.inProgressDot,
                  { backgroundColor: colors.primary },
                ]}
              />
              <View style={styles.inProgressText}>
                <Text style={[styles.inProgressTitle, { color: colors.primary }]}>
                  Walk in Progress
                </Text>
                <Text
                  style={[styles.inProgressSub, { color: colors.mutedForeground }]}
                >
                  Tap to return to your active session
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.resumeButton,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text style={[styles.resumeText, { color: colors.primaryForeground }]}>
                Resume
              </Text>
            </View>
          </Pressable>
        )}

        <Pressable
          onPress={handleStartWalking}
          style={({ pressed }) => [
            styles.actionCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.primary + "40",
              borderWidth: 1.5,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start Walking — audio tour"
          accessibilityHint="Start a free-roam audio walking tour"
        >
          <View
            style={[
              styles.actionIcon,
              { backgroundColor: colors.primary + "18" },
            ]}
          >
            <Feather name="headphones" size={26} color={colors.primary} />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: colors.foreground }]}>
              Start Walking
            </Text>
            <Text
              style={[
                styles.actionDescription,
                { color: colors.mutedForeground },
              ]}
            >
              Free-roam mode — stories play automatically as you approach
              historic buildings and places.
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>

        <Pressable
          onPress={handlePlanRoute}
          style={({ pressed }) => [
            styles.actionCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Plan a Route"
          accessibilityHint="Plan a walking route and pre-load stories"
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.muted }]}>
            <Feather name="navigation" size={26} color={colors.mutedForeground} />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: colors.foreground }]}>
              Plan a Route
            </Text>
            <Text
              style={[
                styles.actionDescription,
                { color: colors.mutedForeground },
              ]}
            >
              Set a start and end point. We'll pre-load stories for every
              historic place along your path.
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>

        <View
          style={[
            styles.tipCard,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[styles.tipText, { color: colors.mutedForeground }]}>
            Headphones recommended — stories narrate automatically as you walk.
          </Text>
        </View>

        <View style={styles.recentSection}>
          <Text style={[styles.recentLabel, { color: colors.mutedForeground }]}>
            Recent Routes
          </Text>

          {recentRoutes.length === 0 ? (
            <View
              style={[
                styles.emptyState,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Feather name="map" size={20} color={colors.mutedForeground} />
              <Text style={[styles.emptyStateText, { color: colors.mutedForeground }]}>
                Your planned routes will appear here after your first walk.
              </Text>
            </View>
          ) : (
            recentRoutes.map((route) => (
              <Pressable
                key={route.id}
                onPress={() => handleReRunRoute(route)}
                style={({ pressed }) => [
                  styles.recentCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Re-run route from ${route.startText} to ${route.endText}`}
              >
                <View style={[styles.recentIconWrap, { backgroundColor: colors.muted }]}>
                  <Feather name="map-pin" size={16} color={colors.mutedForeground} />
                </View>
                <View style={styles.recentInfo}>
                  <Text
                    style={[styles.recentFrom, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {route.startText}
                  </Text>
                  <View style={styles.recentToRow}>
                    <Feather name="arrow-right" size={10} color={colors.mutedForeground} />
                    <Text
                      style={[styles.recentTo, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {route.endText}
                    </Text>
                  </View>
                  {(route.distanceMeters != null || route.durationSeconds != null) && (
                    <View style={styles.recentMeta}>
                      {route.distanceMeters != null && (
                        <Text style={[styles.recentMetaText, { color: colors.mutedForeground }]}>
                          {formatDistance(route.distanceMeters)}
                        </Text>
                      )}
                      {route.distanceMeters != null && route.durationSeconds != null && (
                        <Text style={[styles.recentMetaDot, { color: colors.mutedForeground }]}>·</Text>
                      )}
                      {route.durationSeconds != null && (
                        <Text style={[styles.recentMetaText, { color: colors.mutedForeground }]}>
                          {formatDuration(route.durationSeconds)}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  inProgressCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  inProgressLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  inProgressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  inProgressText: {
    flex: 1,
    gap: 2,
  },
  inProgressTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  inProgressSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  resumeButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    flexShrink: 0,
  },
  resumeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 16,
    padding: 18,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  actionText: {
    flex: 1,
    gap: 4,
  },
  actionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  actionDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  recentSection: {
    gap: 8,
    marginTop: 8,
  },
  recentLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 2,
  },
  emptyState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  emptyStateText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  recentIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  recentInfo: {
    flex: 1,
    gap: 2,
  },
  recentFrom: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.2,
  },
  recentToRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  recentTo: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  recentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  recentMetaText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  recentMetaDot: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
