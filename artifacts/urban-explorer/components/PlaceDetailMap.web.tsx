import { Feather } from "@expo/vector-icons";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface PlaceDetailMapProps {
  latitude: number;
  longitude: number;
  name: string;
  address?: string;
}

export function PlaceDetailMap({ name, address }: PlaceDetailMapProps) {
  const colors = useColors();

  const handleOpenMaps = () => {
    const searchQuery = address || name;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
    Linking.openURL(url);
  };

  return (
    <Pressable
      onPress={handleOpenMaps}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.muted,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Feather name="map" size={24} color={colors.primary} />
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Open in Maps
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Get directions to this spot
        </Text>
      </View>
      <Feather name="external-link" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
