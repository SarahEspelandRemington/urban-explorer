import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface WalkPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface WalkModeMapProps {
  userLatitude: number;
  userLongitude: number;
  places: WalkPlace[];
  narratedIds: Set<string>;
  routeGeometry?: [number, number][];
  startPoint?: { latitude: number; longitude: number } | null;
  endPoint?: { latitude: number; longitude: number } | null;
  followUser?: boolean;
}

export function WalkModeMap({
  userLatitude,
  userLongitude,
  places,
  narratedIds,
  routeGeometry,
}: WalkModeMapProps) {
  const colors = useColors();
  const hasRoute = routeGeometry && routeGeometry.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <Feather name={hasRoute ? "map" : "map-pin"} size={32} color={colors.primary} />
      <Text style={[styles.coords, { color: colors.foreground }]}>
        {userLatitude.toFixed(5)}, {userLongitude.toFixed(5)}
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {hasRoute ? `Route · ${routeGeometry!.length} pts · ` : ""}
        {places.length} places · {narratedIds.size} narrated
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  coords: { fontSize: 14, fontFamily: "Inter_500Medium" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
