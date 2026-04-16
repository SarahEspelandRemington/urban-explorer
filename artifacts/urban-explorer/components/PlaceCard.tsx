import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDiscovery, type SavedPlace } from "@/contexts/DiscoveryContext";
import { useColors } from "@/hooks/useColors";

const CATEGORY_ICONS: Record<string, string> = {
  building: "office-building",
  monument: "pillar",
  park: "tree",
  bridge: "bridge",
  church: "church",
  museum: "bank",
  theater: "drama-masks",
  "historic site": "castle",
};

type CategoryColorKey = "categorySage" | "categoryTerracotta" | "categoryMauve";

const CATEGORY_COLOR_MAP: Record<string, CategoryColorKey> = {
  building: "categorySage",
  monument: "categoryTerracotta",
  park: "categorySage",
  bridge: "categoryMauve",
  church: "categoryTerracotta",
  museum: "categoryMauve",
  theater: "categoryTerracotta",
  "historic site": "categoryMauve",
};

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
}

export const PlaceCard = React.memo(function PlaceCard({ place, index }: PlaceCardProps) {
  const colors = useColors();
  const router = useRouter();
  const { savePlace, removePlace, isPlaceSaved } = useDiscovery();
  const placeId = `${place.name}-${place.latitude}-${place.longitude}`;
  const saved = isPlaceSaved(placeId);

  const iconName = CATEGORY_ICONS[place.category.toLowerCase()] || "map-marker";
  const colorKey = CATEGORY_COLOR_MAP[place.category.toLowerCase()] || "categorySage";
  const categoryColor = (colors as any)[colorKey] || colors.primary;

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

  return (
    <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(index * 80).springify() : undefined}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.95 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.categoryRow}>
            <View style={[styles.iconContainer, { backgroundColor: categoryColor + "18" }]}>
              <MaterialCommunityIcons
                name={iconName as any}
                size={14}
                color={categoryColor}
              />
            </View>
            <Text style={[styles.category, { color: categoryColor }]}>
              {place.category}
            </Text>
          </View>
          {place.distanceMeters != null && (
            <Text style={[styles.distance, { color: colors.mutedForeground }]}>
              {place.distanceMeters < 1000
                ? `${Math.round(place.distanceMeters)}m`
                : `${(place.distanceMeters / 1000).toFixed(1)}km`}
            </Text>
          )}
        </View>

        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {place.name}
        </Text>

        <Text style={[styles.summary, { color: colors.mutedForeground }]} numberOfLines={2}>
          {place.summary}
        </Text>

        <View style={styles.bottomRow}>
          <View style={styles.tagsRow}>
            {place.yearBuilt && place.yearBuilt !== "unknown" && (
              <View style={[styles.tag, { backgroundColor: colors.muted }]}>
                <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
                  {place.yearBuilt}
                </Text>
              </View>
            )}
            {(place.tags || []).slice(0, 2).map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: colors.muted }]}>
                <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={handleSave} hitSlop={12} style={styles.saveButton}>
              <Feather
                name="bookmark"
                size={16}
                color={saved ? categoryColor : colors.mutedForeground}
                style={{ opacity: saved ? 1 : 0.5 }}
              />
            </Pressable>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconContainer: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  category: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  distance: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  summary: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    flex: 1,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  saveButton: {
    padding: 2,
  },
});
