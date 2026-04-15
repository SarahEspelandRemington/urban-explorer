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
    <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(index * 100).springify() : undefined}>
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
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primary + "18" }]}>
            <MaterialCommunityIcons
              name={iconName as any}
              size={22}
              color={colors.primary}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
              {place.name}
            </Text>
            <View style={styles.meta}>
              <Text style={[styles.category, { color: colors.mutedForeground }]}>
                {place.category}
              </Text>
              {place.yearBuilt ? (
                <>
                  <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
                  <Text style={[styles.category, { color: colors.mutedForeground }]}>
                    {place.yearBuilt}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
          <Pressable onPress={handleSave} hitSlop={12}>
            <Feather
              name={saved ? "bookmark" : "bookmark"}
              size={20}
              color={saved ? colors.primary : colors.mutedForeground}
              style={saved ? { opacity: 1 } : { opacity: 0.6 }}
            />
          </Pressable>
        </View>

        <Text style={[styles.summary, { color: colors.foreground }]} numberOfLines={2}>
          {place.summary}
        </Text>

        {(place.tags && place.tags.length > 0) && (
          <View style={styles.tagsRow}>
            {place.tags.slice(0, 3).map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: colors.muted }]}>
                <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
                  #{tag}
                </Text>
              </View>
            ))}
          </View>
        )}

        {place.facts.length > 0 && (
          <View style={[styles.factPreview, { backgroundColor: colors.muted }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[styles.factText, { color: colors.foreground }]} numberOfLines={2}>
              {place.facts[0]}
            </Text>
          </View>
        )}

        {place.distanceMeters != null && (
          <View style={styles.footer}>
            <Feather name="navigation" size={12} color={colors.mutedForeground} />
            <Text style={[styles.distance, { color: colors.mutedForeground }]}>
              {place.distanceMeters < 1000
                ? `${Math.round(place.distanceMeters)}m away`
                : `${(place.distanceMeters / 1000).toFixed(1)}km away`}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  category: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textTransform: "capitalize",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  summary: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 10,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  factPreview: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  factText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  distance: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
