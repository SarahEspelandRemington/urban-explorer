import { Feather } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PlaceCard } from "@/components/PlaceCard";
import { useDiscovery } from "@/contexts/DiscoveryContext";
import { useColors } from "@/hooks/useColors";
import { useRatingPaceWarning } from "@/hooks/useRatingPaceWarning";

export default function SavedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { savedPlaces } = useDiscovery();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { showWarning: showRatingPaceWarning, recordRating, dismissWarning } =
    useRatingPaceWarning();

  const handlePlaceRated = useCallback(
    (_placeId: string, newRating: "up" | "down" | null) => {
      if (newRating !== null) {
        recordRating();
      }
    },
    [recordRating],
  );

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

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
        <Text style={[styles.title, { color: colors.foreground }]}>Saved</Text>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {savedPlaces.length} {savedPlaces.length === 1 ? "place" : "places"}
        </Text>
      </View>

      <FlatList
        data={savedPlaces}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isExpanded = expandedId === item.id;
          return (
            <PlaceCard
              place={item}
              index={index}
              expanded={isExpanded}
              onToggleExpand={() => setExpandedId(isExpanded ? null : item.id)}
              onRate={handlePlaceRated}
            />
          );
        }}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + webBottomInset + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          showRatingPaceWarning ? (
            <Animated.View
              entering={FadeIn.duration(250)}
              exiting={FadeOut.duration(200)}
              style={styles.ratingPaceWarning}
              accessibilityRole="alert"
              accessibilityLabel="You're rating quickly — pace yourself"
            >
              <Feather name="clock" size={14} color="#92400e" />
              <Text style={styles.ratingPaceWarningText}>
                You're rating quickly — pace yourself
              </Text>
              <Pressable
                onPress={dismissWarning}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss warning"
              >
                <Feather name="x" size={14} color="#92400e" style={{ opacity: 0.7 }} />
              </Pressable>
            </Animated.View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="bookmark" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No saved places yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Bookmark places you discover to revisit them later
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
  },
  count: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  list: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 120,
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  ratingPaceWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  ratingPaceWarningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#92400e",
  },
});
