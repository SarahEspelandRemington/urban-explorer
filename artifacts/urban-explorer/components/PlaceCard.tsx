import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";

import { NoteModal } from "@/components/NoteModal";
import { PlaceActions } from "@/components/PlaceActions";
import { getCategoryColor, getCategoryIcon } from "@/constants/categories";
import { useDiscovery, type SavedPlace } from "@/contexts/DiscoveryContext";
import { buildPlaceId } from "@/lib/placeId";
import { useT } from "@/contexts/LocaleContext";
import { storageKey, useUserRatings } from "@/contexts/UserRatingsContext";
import { useColors } from "@/hooks/useColors";
import { useRatePlace, type RatePlaceResponse } from "@workspace/api-client-react";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatWalkDistance(
  meters: number | undefined,
  pc: { walkLessThan: string; walkMin: (n: number) => string; walkFt: (n: number) => string; walkMi: (s: string) => string },
): string {
  if (meters == null) return "";
  if (meters < 80) return pc.walkLessThan;
  if (meters < 800) {
    const mins = Math.round(meters / 80);
    return pc.walkMin(mins);
  }
  const feet = meters * 3.28084;
  if (feet < 528) return pc.walkFt(Math.round(feet));
  const miles = meters * 0.000621371;
  return pc.walkMi(miles.toFixed(2));
}

interface CommunityRating {
  up: number;
  down: number;
  netScore: number;
}

interface PlaceCardProps {
  place: {
    id: string;
    name: string;
    category: string;
    yearBuilt?: string;
    tags?: string[];
    summary: string;
    facts: string[];
    latitude: number;
    longitude: number;
    address?: string;
    distanceMeters?: number;
    netScore?: number;
    communityRating?: CommunityRating;
    photoUrl?: string;
    note?: string;
  };
  index: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onRate?: (placeId: string, newRating: "up" | "down" | null, prevRating: "up" | "down" | null) => void;
  onSaveConfirm?: (saved: boolean) => void;
}

export const PlaceCard = React.memo(function PlaceCard({ place, index, expanded, onToggleExpand, onRate, onSaveConfirm }: PlaceCardProps) {
  const colors = useColors();
  const t = useT();
  const router = useRouter();
  const { savePlace, removePlace, isPlaceSaved, updateNote } = useDiscovery();
  const placeId = buildPlaceId(place.name, place.latitude, place.longitude);
  const saved = isPlaceSaved(placeId);
  const [noteModalVisible, setNoteModalVisible] = useState(false);

  // Bookmark scale animation
  const bookmarkScale = useSharedValue(1);

  const { getRating, setLocalRating, isLoaded, userId } = useUserRatings();
  const [userRating, setUserRating] = useState<"up" | "down" | null>(null);
  const [communityRating, setCommunityRating] = useState<CommunityRating | undefined>(place.communityRating);
  const rateMutation = useRatePlace();

  const ratingStorageKey = storageKey(userId, placeId);

  useEffect(() => {
    if (isLoaded) {
      setUserRating(getRating(placeId));
      return;
    }
    AsyncStorage.getItem(ratingStorageKey).then((stored) => {
      if (stored === "up" || stored === "down") {
        setUserRating(stored);
      } else {
        setUserRating(null);
      }
    });
  }, [ratingStorageKey, placeId, getRating, isLoaded]);

  const iconName = getCategoryIcon(place.category);
  const categoryColor = getCategoryColor(place.category, colors);
  const walkTime = formatWalkDistance(place.distanceMeters, t.placeCard);
  const isLowRated = (place.netScore ?? 0) < -1;
  const isTopPick = (place.netScore ?? 0) > 2;

  const prevIsTopPick = useRef(isTopPick);
  const badgeScale = useSharedValue(isTopPick ? 1 : 0);
  const badgeOpacity = useSharedValue(isTopPick ? 1 : 0);

  useEffect(() => {
    if (isTopPick && !prevIsTopPick.current) {
      badgeScale.value = 0;
      badgeOpacity.value = 0;
      badgeScale.value = withSpring(1, { damping: 10, stiffness: 200 });
      badgeOpacity.value = withTiming(1, { duration: 180 });
    } else if (!isTopPick) {
      badgeScale.value = 0;
      badgeOpacity.value = 0;
    }
    prevIsTopPick.current = isTopPick;
  }, [isTopPick]);

  const badgeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
    opacity: badgeOpacity.value,
  }));

  const bookmarkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookmarkScale.value }],
  }));

  const handleSave = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    bookmarkScale.value = withSequence(
      withSpring(1.35, { damping: 8, stiffness: 300 }),
      withSpring(1, { damping: 12, stiffness: 250 }),
    );
    if (saved) {
      removePlace(placeId);
      onSaveConfirm?.(false);
    } else {
      savePlace({ ...place, id: placeId } as Omit<SavedPlace, "savedAt" | "note">);
      onSaveConfirm?.(true);
      setNoteModalVisible(true);
    }
  };

  const handleRate = (tapped: "up" | "down") => {
    const previousRating = userRating;
    const newRating: "up" | "down" | null = previousRating === tapped ? null : tapped;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setUserRating(newRating);
    setLocalRating(placeId, newRating);
    if (newRating === null) {
      AsyncStorage.removeItem(ratingStorageKey);
    } else {
      AsyncStorage.setItem(ratingStorageKey, newRating);
    }
    onRate?.(placeId, newRating, previousRating);

    rateMutation.mutate(
      {
        data: {
          placeId,
          placeName: place.name,
          category: place.category,
          latitude: place.latitude,
          longitude: place.longitude,
          rating: newRating ?? "none",
          ...(previousRating != null ? { previousRating } : {}),
        },
      },
      {
        onSuccess: (result: RatePlaceResponse) => {
          setCommunityRating({ up: result.up, down: result.down, netScore: result.up - result.down });
        },
        onError: (error: unknown) => {
          const status = (error as { status?: number })?.status;
          if (status === 429) {
            Alert.alert(
              t.placeCard.rateLimitTitle,
              t.placeCard.rateLimitBody,
              [{ text: t.common.ok }],
            );
          } else {
            Alert.alert(
              t.placeCard.saveErrTitle,
              t.placeCard.saveErrBody,
              [{ text: t.common.ok }],
            );
          }
          setUserRating(previousRating);
          setLocalRating(placeId, previousRating);
          if (previousRating === null) {
            AsyncStorage.removeItem(ratingStorageKey);
          } else {
            AsyncStorage.setItem(ratingStorageKey, previousRating);
          }
          onRate?.(placeId, previousRating, newRating);
        },
      },
    );
  };

  const navigateToDetail = () => {
    router.push({
      pathname: "/place-detail",
      params: {
        name: place.name,
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        category: place.category,
        yearBuilt: place.yearBuilt || "",
        tags: JSON.stringify(place.tags || []),
        summary: place.summary,
        facts: JSON.stringify(place.facts),
        address: place.address || "",
        photoUrl: place.photoUrl || "",
      },
    });
  };

  const toggleExpand = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleExpand?.();
  };

  const saveLabel = saved ? `Remove ${place.name} from saved` : `Save ${place.name}`;

  const BookmarkIcon = (
    <Animated.View style={bookmarkAnimStyle}>
      <Feather
        name={saved ? "bookmark" : "bookmark"}
        size={20}
        color={saved ? categoryColor : colors.mutedForeground}
        style={{ opacity: saved ? 1 : 0.45 }}
      />
    </Animated.View>
  );

  const CompactBookmarkIcon = (
    <Animated.View style={bookmarkAnimStyle}>
      <Feather
        name="bookmark"
        size={16}
        color={saved ? categoryColor : colors.mutedForeground}
        style={{ opacity: saved ? 1 : 0.4 }}
      />
    </Animated.View>
  );

  if (expanded) {
    return (
      <>
        <Animated.View
          entering={Platform.OS !== "web" ? FadeInDown.delay(index === 0 ? 0 : index * 60).springify() : undefined}
          style={isLowRated ? { opacity: 0.55 } : undefined}
        >
          <Pressable
            onPress={toggleExpand}
            accessibilityRole="button"
            accessibilityLabel={`${place.name}, ${place.category}${walkTime ? `, ${walkTime} walk` : ""}. Tap to collapse`}
            style={({ pressed }) => [
              styles.heroCard,
              {
                backgroundColor: colors.card,
                borderColor: categoryColor + "40",
                opacity: pressed ? 0.95 : 1,
              },
            ]}
          >
            {place.photoUrl ? (
              <Image
                source={{ uri: place.photoUrl }}
                style={styles.heroPhoto}
                resizeMode="cover"
                accessibilityLabel={`Photo of ${place.name}`}
              />
            ) : null}
            <View style={styles.heroContent}>
            <View style={styles.heroTop}>
              <View
                style={[styles.heroIconContainer, { backgroundColor: categoryColor + "20" }]}
                accessibilityLabel={place.category}
              >
                <MaterialCommunityIcons name={iconName as any} size={22} color={categoryColor} />
              </View>
              <View style={styles.heroActions}>
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); handleRate("up"); }}
                  hitSlop={16}
                  style={styles.actionButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Thumbs up for ${place.name}`}
                  accessibilityState={{ selected: userRating === "up" }}
                >
                  <Feather
                    name="thumbs-up"
                    size={18}
                    color={userRating === "up" ? "#22c55e" : colors.mutedForeground}
                    style={{ opacity: userRating === "up" ? 1 : 0.45 }}
                  />
                </Pressable>
                {communityRating != null ? (
                  <Text
                    style={[
                      styles.communityScore,
                      {
                        color:
                          communityRating.netScore > 0
                            ? "#22c55e"
                            : communityRating.netScore < 0
                            ? "#ef4444"
                            : colors.mutedForeground,
                      },
                    ]}
                    accessibilityLabel={`Community score: ${communityRating.netScore > 0 ? "+" : ""}${communityRating.netScore}`}
                  >
                    {communityRating.netScore > 0 ? "+" : ""}{communityRating.netScore}
                  </Text>
                ) : null}
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); handleRate("down"); }}
                  hitSlop={16}
                  style={styles.actionButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Thumbs down for ${place.name}`}
                  accessibilityState={{ selected: userRating === "down" }}
                >
                  <Feather
                    name="thumbs-down"
                    size={18}
                    color={userRating === "down" ? "#ef4444" : colors.mutedForeground}
                    style={{ opacity: userRating === "down" ? 1 : 0.45 }}
                  />
                </Pressable>
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); handleSave(); }}
                  hitSlop={16}
                  style={styles.actionButton}
                  accessibilityRole="button"
                  accessibilityLabel={saveLabel}
                  accessibilityState={{ selected: saved }}
                >
                  {BookmarkIcon}
                </Pressable>
                <Pressable
                  onPress={navigateToDetail}
                  hitSlop={16}
                  style={styles.detailArrow}
                  accessibilityRole="button"
                  accessibilityLabel={`View full details for ${place.name}`}
                  accessibilityHint="Opens the detail screen"
                >
                  <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>

            <Text style={[styles.heroName, { color: colors.foreground }]} numberOfLines={2}>
              {place.name}
            </Text>

            <View style={styles.heroMeta}>
              {isTopPick ? (
                <Animated.View
                  style={[styles.topPickBadge, badgeAnimStyle]}
                  accessibilityLabel="Top pick"
                >
                  <Feather name="star" size={11} color="#f59e0b" />
                  <Text style={styles.topPickBadgeText}>{t.placeCard.topPick}</Text>
                </Animated.View>
              ) : null}
              {walkTime ? (
                <View
                  style={[styles.walkBadge, { backgroundColor: colors.primary + "18" }]}
                  accessibilityLabel={`${walkTime} walk`}
                >
                  <Feather name="navigation" size={12} color={colors.primary} />
                  <Text style={[styles.walkBadgeText, { color: colors.primary }]}>
                    {walkTime}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.heroCategory, { color: categoryColor }]}>
                {place.category}
              </Text>
            </View>

            <Text style={[styles.heroSummary, { color: colors.mutedForeground }]} numberOfLines={3}>
              {place.summary}
            </Text>

            {place.note ? (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); setNoteModalVisible(true); }}
                style={[styles.noteChip, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}
                accessibilityRole="button"
                accessibilityLabel="Edit note"
              >
                <Feather name="edit-3" size={11} color={colors.primary} />
                <Text style={[styles.noteChipText, { color: colors.primary }]} numberOfLines={1}>
                  {place.note}
                </Text>
              </Pressable>
            ) : null}

            <PlaceActions
              place={{
                id: placeId,
                name: place.name,
                category: place.category,
                yearBuilt: place.yearBuilt,
                summary: place.summary,
                facts: place.facts,
                latitude: place.latitude,
                longitude: place.longitude,
              }}
            />
            </View>
          </Pressable>
        </Animated.View>
        <NoteModal
          visible={noteModalVisible}
          placeName={place.name}
          existingNote={place.note}
          onSave={(note) => {
            updateNote(placeId, note);
            setNoteModalVisible(false);
          }}
          onSkip={() => setNoteModalVisible(false)}
        />
      </>
    );
  }

  return (
    <>
      <Animated.View
        entering={Platform.OS !== "web" ? FadeInDown.delay(index * 60).springify() : undefined}
        style={isLowRated ? { opacity: 0.55 } : undefined}
      >
        <Pressable
          onPress={toggleExpand}
          accessibilityRole="button"
          accessibilityLabel={`${place.name}, ${place.category}${walkTime ? `, ${walkTime} walk` : ""}. Tap to expand`}
          style={({ pressed }) => [
            styles.compactCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.95 : 1,
            },
          ]}
        >
          {place.photoUrl ? (
            <Image
              source={{ uri: place.photoUrl }}
              style={[styles.compactThumb, { borderColor: categoryColor + "40" }]}
              resizeMode="cover"
              accessibilityLabel={`Photo of ${place.name}`}
            />
          ) : (
            <View style={[styles.compactIcon, { backgroundColor: categoryColor + "18" }]}>
              <MaterialCommunityIcons name={iconName as any} size={18} color={categoryColor} />
            </View>
          )}

          <View style={styles.compactInfo}>
            <View style={styles.compactNameRow}>
              <Text style={[styles.compactName, { color: colors.foreground }]} numberOfLines={1}>
                {place.name}
              </Text>
              {isTopPick ? (
                <Animated.View style={[styles.compactTopStarWrapper, badgeAnimStyle]}>
                  <Feather name="star" size={12} color="#f59e0b" />
                </Animated.View>
              ) : null}
            </View>
            <Text style={[styles.compactCategory, { color: colors.mutedForeground }]} numberOfLines={1}>
              {place.category}
              {place.yearBuilt && place.yearBuilt !== "unknown" ? ` · ${place.yearBuilt}` : ""}
            </Text>
          </View>

          {walkTime ? (
            <Text style={[styles.compactDistance, { color: colors.primary }]}>
              {walkTime}
            </Text>
          ) : null}

          <View style={styles.compactRatingRow}>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); handleRate("up"); }}
              hitSlop={12}
              style={styles.compactRatingBtn}
              accessibilityRole="button"
              accessibilityLabel={`Thumbs up for ${place.name}`}
              accessibilityState={{ selected: userRating === "up" }}
            >
              <Feather
                name="thumbs-up"
                size={13}
                color={userRating === "up" ? "#22c55e" : colors.mutedForeground}
                style={{ opacity: userRating === "up" ? 1 : 0.35 }}
              />
            </Pressable>
            {communityRating != null ? (
              <Text
                style={[
                  styles.compactScore,
                  {
                    color:
                      communityRating.netScore > 0
                        ? "#22c55e"
                        : communityRating.netScore < 0
                        ? "#ef4444"
                        : colors.mutedForeground,
                  },
                ]}
                accessibilityLabel={`Community score: ${communityRating.netScore > 0 ? "+" : ""}${communityRating.netScore}`}
              >
                {communityRating.netScore > 0 ? "+" : ""}{communityRating.netScore}
              </Text>
            ) : null}
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); handleRate("down"); }}
              hitSlop={12}
              style={styles.compactRatingBtn}
              accessibilityRole="button"
              accessibilityLabel={`Thumbs down for ${place.name}`}
              accessibilityState={{ selected: userRating === "down" }}
            >
              <Feather
                name="thumbs-down"
                size={13}
                color={userRating === "down" ? "#ef4444" : colors.mutedForeground}
                style={{ opacity: userRating === "down" ? 1 : 0.35 }}
              />
            </Pressable>
          </View>

          <Pressable
            onPress={(e) => { e.stopPropagation?.(); handleSave(); }}
            hitSlop={16}
            style={styles.compactSave}
            accessibilityRole="button"
            accessibilityLabel={saveLabel}
            accessibilityState={{ selected: saved }}
          >
            {CompactBookmarkIcon}
          </Pressable>

          <Pressable
            onPress={navigateToDetail}
            hitSlop={16}
            style={styles.detailArrowCompact}
            accessibilityRole="button"
            accessibilityLabel={`View details for ${place.name}`}
          >
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
          </Pressable>
        </Pressable>
      </Animated.View>
      <NoteModal
        visible={noteModalVisible}
        placeName={place.name}
        existingNote={place.note}
        onSave={(note) => {
          updateNote(placeId, note);
          setNoteModalVisible(false);
        }}
        onSkip={() => setNoteModalVisible(false)}
      />
    </>
  );
});

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: "hidden",
    marginBottom: 8,
  },
  heroPhoto: {
    width: "100%",
    height: 160,
    marginBottom: 0,
  },
  compactThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  heroContent: {
    padding: 18,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  heroIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 8,
    lineHeight: 28,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  walkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  walkBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  heroCategory: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroSummary: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  noteChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  noteChipText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  compactCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
    gap: 12,
    minHeight: 56,
  },
  compactIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  compactInfo: {
    flex: 1,
    gap: 2,
  },
  compactName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  compactCategory: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  compactDistance: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginRight: 4,
  },
  communityScore: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    minWidth: 22,
    textAlign: "center",
  },
  compactScore: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    minWidth: 18,
    textAlign: "center",
  },
  compactRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  compactRatingBtn: {
    width: 26,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  compactSave: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  detailArrow: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  detailArrowCompact: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -10,
  },
  topPickBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "#f59e0b1a",
  },
  topPickBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#f59e0b",
  },
  compactNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  compactTopStarWrapper: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
