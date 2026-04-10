import { Feather } from "@expo/vector-icons";
import React from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PlaceCard } from "@/components/PlaceCard";
import { useDiscovery } from "@/contexts/DiscoveryContext";
import { useColors } from "@/hooks/useColors";

export default function SavedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { savedPlaces } = useDiscovery();

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
        renderItem={({ item, index }) => (
          <PlaceCard place={item} index={index} />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + webBottomInset + 90 },
        ]}
        showsVerticalScrollIndicator={false}
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
});
