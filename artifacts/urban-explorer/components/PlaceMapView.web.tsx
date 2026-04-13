import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Place {
  id: string;
  name: string;
  category: string;
  yearBuilt?: string;
  summary: string;
  facts: string[];
  latitude: number;
  longitude: number;
  distanceMeters?: number;
}

interface PlaceMapViewProps {
  places: Place[];
  userLatitude: number;
  userLongitude: number;
}

export function PlaceMapView({ places, userLatitude, userLongitude }: PlaceMapViewProps) {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <Feather name="map" size={40} color={colors.mutedForeground} />
      <Text style={[styles.title, { color: colors.foreground }]}>
        Map View
      </Text>
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        Map view is available on your phone via Expo Go. Use the list view to browse places here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  text: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
