import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { getCategoryColor, getCategoryIcon } from "@/constants/categories";
import { useDiscovery, type SavedPlace } from "@/contexts/DiscoveryContext";
import { useColors } from "@/hooks/useColors";

function formatWalkDistance(meters?: number): string {
  if (meters == null) return "";
  if (meters < 80) return "< 1 min";
  if (meters < 800) {
    const mins = Math.round(meters / 80);
    return `${mins} min`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
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
  };
  index: number;
  isNearest?: boolean;
}

export const PlaceCard = React.memo(function PlaceCard({ place, index, isNearest }: PlaceCardProps) {
  const colors = useColors();
  const router = useRouter();
  const { savePlace, removePlace, isPlaceSaved } = useDiscovery();
  const placeId = `${place.name}-${place.latitude}-${place.longitude}`;
  const saved = isPlaceSaved(placeId);

  const iconName = getCategoryIcon(place.category);
  const categoryColor = getCategoryColor(place.category, colors);
  const walkTime = formatWalkDistance(place.distanceMeters);

  const handleSave = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (saved) {
      removePlace(placeId);
    } else {
      savePlace({ ...place, id: placeId } as Omit<SavedPlace, "savedAt">);
    }
  };

  const handlePress = () => {
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
      },
    });
  };

  if (isNearest) {
    return (
      <Animated.View entering={Platform.OS !== "web" ? FadeInDown.springify() : undefined}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.heroCard,
            {
              backgroundColor: colors.card,
              borderColor: categoryColor + "40",
              opacity: pressed ? 0.95 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <View style={styles.heroTop}>
            <View style={[styles.heroIconContainer, { backgroundColor: categoryColor + "20" }]}>
              <MaterialCommunityIcons name={iconName as any} size={22} color={categoryColor} />
            </View>
            <View style={styles.heroActions}>
              <Pressable onPress={handleSave} hitSlop={16} style={styles.saveButton}>
                <Feather
                  name="bookmark"
                  size={20}
                  color={saved ? categoryColor : colors.mutedForeground}
                />
              </Pressable>
            </View>
          </View>

          <Text style={[styles.heroName, { color: colors.foreground }]} numberOfLines={2}>
            {place.name}
          </Text>

          <View style={styles.heroMeta}>
            {walkTime ? (
              <View style={[styles.walkBadge, { backgroundColor: colors.primary + "18" }]}>
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

          <Text style={[styles.heroSummary, { color: colors.mutedForeground }]} numberOfLines={2}>
            {place.summary}
          </Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(index * 60).springify() : undefined}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.compactCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.95 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        <View style={[styles.compactIcon, { backgroundColor: categoryColor + "18" }]}>
          <MaterialCommunityIcons name={iconName as any} size={18} color={categoryColor} />
        </View>

        <View style={styles.compactInfo}>
          <Text style={[styles.compactName, { color: colors.foreground }]} numberOfLines={1}>
            {place.name}
          </Text>
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

        <Pressable onPress={handleSave} hitSlop={12} style={styles.compactSave}>
          <Feather
            name="bookmark"
            size={16}
            color={saved ? categoryColor : colors.mutedForeground}
            style={{ opacity: saved ? 1 : 0.4 }}
          />
        </Pressable>

        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 12,
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

  compactCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
    gap: 12,
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
  compactSave: {
    padding: 4,
  },
  saveButton: {
    padding: 4,
  },
});
