import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/contexts/LocaleContext";
import { useWalkMode } from "@/contexts/WalkModeContext";
import { useColors } from "@/hooks/useColors";
import { unlockWebSpeech } from "@/hooks/useNarration";
import {
  deleteRecentRoute,
  loadRecentRoutes,
  type RecentRoute,
} from "@/lib/recentRoutes";
import {
  STARTUP_KEYS,
  getStartupValue,
  setStartupValue,
} from "@/lib/startupStorage";

const UNDO_DURATION_MS = 4000;
const WALK_WELCOME_KEY = STARTUP_KEYS.walkWelcomeDismissed;

interface PendingDelete {
  route: RecentRoute;
  index: number;
  timer: ReturnType<typeof setTimeout>;
  progress: Animated.Value;
}

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

const WALK_BANNER_KEY = STARTUP_KEYS.walkBannerDismissed;

export default function WalkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { isWalking } = useWalkMode();

  const [recentRoutes, setRecentRoutes] = useState<RecentRoute[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const toastAnim = useRef(new Animated.Value(0)).current;
  const pendingDeleteRef = useRef<PendingDelete | null>(null);

  // Visiting the Walk tab counts as acknowledging the Explore-tab "Tap Walk
  // tab to start your audio tour" hint, so suppress that on the next render.
  // Write-through so a same-session re-mount of Explore sees the dismissal
  // instead of the boot snapshot.
  useEffect(() => {
    setStartupValue(WALK_BANNER_KEY, "1").catch(() => {});
  }, []);

  // First-run welcome card on the Walk tab itself. Hidden by default so we
  // don't briefly flash it before the storage read resolves; we show it only
  // when the persisted dismiss flag is missing.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getStartupValue(WALK_WELCOME_KEY).then((val) => {
      if (cancelled) return;
      if (val == null) setShowWelcome(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    setStartupValue(WALK_WELCOME_KEY, "1").catch(() => {});
  }, []);

  useEffect(() => {
    pendingDeleteRef.current = pendingDelete;
  }, [pendingDelete]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadRecentRoutes().then((routes) => {
        if (active) setRecentRoutes(routes);
      });
      return () => {
        active = false;
        const pd = pendingDeleteRef.current;
        if (pd) {
          clearTimeout(pd.timer);
          deleteRecentRoute(pd.route.id);
          setPendingDelete(null);
        }
      };
    }, []),
  );

  const commitDelete = useCallback(
    async (id: string) => {
      await deleteRecentRoute(id);
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setPendingDelete(null));
    },
    [toastAnim],
  );

  const handleDeleteRoute = useCallback(
    async (route: RecentRoute, index: number) => {
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const pd = pendingDeleteRef.current;
      if (pd) {
        clearTimeout(pd.timer);
        await deleteRecentRoute(pd.route.id);
      }

      setRecentRoutes((prev) => prev.filter((r) => r.id !== route.id));

      const progress = new Animated.Value(1);
      Animated.timing(progress, {
        toValue: 0,
        duration: UNDO_DURATION_MS,
        useNativeDriver: false,
      }).start();

      const timer = setTimeout(() => {
        commitDelete(route.id);
      }, UNDO_DURATION_MS);

      const newPending: PendingDelete = { route, index, timer, progress };
      setPendingDelete(newPending);

      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    },
    [toastAnim, commitDelete],
  );

  const handleUndo = useCallback(() => {
    const pd = pendingDeleteRef.current;
    if (!pd) return;
    clearTimeout(pd.timer);
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRecentRoutes((prev) => {
      const next = [...prev];
      next.splice(pd.index, 0, pd.route);
      return next;
    });
    Animated.timing(toastAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setPendingDelete(null));
  }, [toastAnim]);

  const handleStartWalking = () => {
    unlockWebSpeech();
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/walk-mode");
  };

  const handlePlanRoute = () => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/walk-plan");
  };

  const handleResumeWalk = () => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/walk-mode");
  };

  const handleReRunRoute = (route: RecentRoute) => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/walk-plan",
      params: {
        prefillStart: route.startText,
        prefillEnd: route.endText,
      },
    });
  };

  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const renderRightActions = useCallback(
    (
      route: RecentRoute,
      index: number,
      dragX: Animated.AnimatedInterpolation<number>,
    ) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.7],
        extrapolate: "clamp",
      });
      return (
        <Pressable
          onPress={() => {
            swipeableRefs.current.get(route.id)?.close();
            handleDeleteRoute(route, index);
          }}
          style={styles.deleteAction}
          accessibilityRole="button"
          accessibilityLabel="Delete route"
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Feather name="trash-2" size={20} color="#fff" />
          </Animated.View>
        </Pressable>
      );
    },
    [handleDeleteRoute],
  );

  const toastTranslateY = toastAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

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
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Walk</Text>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web")
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings-messages");
            }}
            style={({ pressed }) => [
              styles.editMessagesBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.muted,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t.walk.editMessages}
          >
            <Feather
              name="message-square"
              size={13}
              color={colors.mutedForeground}
            />
            <Text
              style={[
                styles.editMessagesBtnText,
                { color: colors.mutedForeground },
              ]}
            >
              {t.walk.editMessages}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {t.walk.subtitle}
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
        {showWelcome && !isWalking && (
          <View
            style={[
              styles.welcomeCard,
              {
                backgroundColor: colors.primary + "14",
                borderColor: colors.primary + "40",
              },
            ]}
            accessibilityRole="summary"
            accessibilityLabel={t.walk.welcomeTitle}
          >
            <View style={styles.welcomeHeader}>
              <View
                style={[
                  styles.welcomeIcon,
                  { backgroundColor: colors.primary + "22" },
                ]}
              >
                <Feather name="compass" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
                {t.walk.welcomeTitle}
              </Text>
            </View>
            <Text
              style={[styles.welcomeBody, { color: colors.mutedForeground }]}
            >
              {t.walk.welcomeBody}
            </Text>
            <Pressable
              onPress={dismissWelcome}
              style={({ pressed }) => [
                styles.welcomeButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t.walk.welcomeDismiss}
            >
              <Text
                style={[
                  styles.welcomeButtonText,
                  { color: colors.primaryForeground },
                ]}
              >
                {t.walk.welcomeDismiss}
              </Text>
            </Pressable>
          </View>
        )}

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
                <Text
                  style={[styles.inProgressTitle, { color: colors.primary }]}
                >
                  Walk in Progress
                </Text>
                <Text
                  style={[
                    styles.inProgressSub,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Tap to return to your active session
                </Text>
              </View>
            </View>
            <View
              style={[styles.resumeButton, { backgroundColor: colors.primary }]}
            >
              <Text
                style={[styles.resumeText, { color: colors.primaryForeground }]}
              >
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
          <Feather
            name="chevron-right"
            size={20}
            color={colors.mutedForeground}
          />
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
          accessibilityLabel={t.walkPlan.title}
          accessibilityHint="Plan a walking route and pre-load stories"
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.muted }]}>
            <Feather
              name="navigation"
              size={26}
              color={colors.mutedForeground}
            />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: colors.foreground }]}>
              {t.walkPlan.title}
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
          <Feather
            name="chevron-right"
            size={20}
            color={colors.mutedForeground}
          />
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

          {recentRoutes.length === 0 && !pendingDelete ? (
            <View
              style={[
                styles.emptyState,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Feather name="map" size={20} color={colors.mutedForeground} />
              <Text
                style={[
                  styles.emptyStateText,
                  { color: colors.mutedForeground },
                ]}
              >
                Your planned routes will appear here after your first walk.
              </Text>
            </View>
          ) : (
            recentRoutes.map((route, index) => (
              <Swipeable
                key={route.id}
                ref={(ref) => {
                  if (ref) swipeableRefs.current.set(route.id, ref);
                  else swipeableRefs.current.delete(route.id);
                }}
                renderRightActions={(_, dragX) =>
                  renderRightActions(route, index, dragX)
                }
                rightThreshold={40}
                overshootRight={false}
                friction={2}
              >
                <Pressable
                  onPress={() => handleReRunRoute(route)}
                  onLongPress={() => {
                    if (Platform.OS !== "web")
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    swipeableRefs.current.get(route.id)?.openRight();
                  }}
                  delayLongPress={400}
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
                  accessibilityHint="Swipe left or long-press to delete"
                >
                  <View
                    style={[
                      styles.recentIconWrap,
                      { backgroundColor: colors.muted },
                    ]}
                  >
                    <Feather
                      name="map-pin"
                      size={16}
                      color={colors.mutedForeground}
                    />
                  </View>
                  <View style={styles.recentInfo}>
                    <Text
                      style={[styles.recentFrom, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {route.startText}
                    </Text>
                    <View style={styles.recentToRow}>
                      <Feather
                        name="arrow-right"
                        size={10}
                        color={colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.recentTo,
                          { color: colors.mutedForeground },
                        ]}
                        numberOfLines={1}
                      >
                        {route.endText}
                      </Text>
                    </View>
                    {(route.distanceMeters != null ||
                      route.durationSeconds != null) && (
                      <View style={styles.recentMeta}>
                        {route.distanceMeters != null && (
                          <Text
                            style={[
                              styles.recentMetaText,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {formatDistance(route.distanceMeters)}
                          </Text>
                        )}
                        {route.distanceMeters != null &&
                          route.durationSeconds != null && (
                            <Text
                              style={[
                                styles.recentMetaDot,
                                { color: colors.mutedForeground },
                              ]}
                            >
                              ·
                            </Text>
                          )}
                        {route.durationSeconds != null && (
                          <Text
                            style={[
                              styles.recentMetaText,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {formatDuration(route.durationSeconds)}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                  <Feather
                    name="chevron-right"
                    size={16}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </Swipeable>
            ))
          )}
        </View>
      </ScrollView>

      {pendingDelete && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              bottom: insets.bottom + webBottomInset + 90,
              transform: [{ translateY: toastTranslateY }],
              opacity: toastAnim,
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.toast}>
            <Animated.View
              style={[
                styles.toastProgress,
                {
                  width: pendingDelete.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
            <Text style={styles.toastText} numberOfLines={1}>
              Route deleted
            </Text>
            <Pressable
              onPress={handleUndo}
              style={({ pressed }) => [
                styles.undoButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Undo route deletion"
            >
              <Text style={styles.undoText}>Undo</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editMessagesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editMessagesBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
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
  welcomeCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  welcomeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  welcomeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  welcomeBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  welcomeButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
  },
  welcomeButtonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
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
  deleteAction: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
    borderRadius: 14,
    marginLeft: 8,
  },
  toastContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "stretch",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D2035",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  toastProgress: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#FFFFFF",
  },
  undoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  undoText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
});
