import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

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
  storefront: "storefront-outline",
  alley: "road-variant",
  corner: "sign-direction",
  mural: "palette",
  infrastructure: "wrench",
  "former site": "history",
  "architectural detail": "eye-outline",
  residential: "home-variant",
};

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
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const { savePlace, removePlace, isPlaceSaved } = useDiscovery();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedPlace = places.find((p) => p.id === selectedId);

  const handleMarkerPress = (place: Place) => {
    setSelectedId(place.id);
  };

  const handleCardPress = () => {
    if (!selectedPlace) return;
    router.push({
      pathname: "/place-detail",
      params: {
        name: selectedPlace.name,
        latitude: String(selectedPlace.latitude),
        longitude: String(selectedPlace.longitude),
        category: selectedPlace.category,
        yearBuilt: selectedPlace.yearBuilt || "",
        summary: selectedPlace.summary,
        facts: JSON.stringify(selectedPlace.facts),
      },
    });
  };

  const handleSave = () => {
    if (!selectedPlace) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const saved = isPlaceSaved(selectedPlace.id);
    if (saved) {
      removePlace(selectedPlace.id);
    } else {
      savePlace(selectedPlace as Omit<SavedPlace, "savedAt">);
    }
  };

  const initialRegion = {
    latitude: userLatitude,
    longitude: userLongitude,
    latitudeDelta: 0.006,
    longitudeDelta: 0.006,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
        provider={PROVIDER_DEFAULT}
        onPress={() => setSelectedId(null)}
      >
        {places.map((place) => (
          <Marker
            key={place.id}
            coordinate={{
              latitude: place.latitude,
              longitude: place.longitude,
            }}
            title={place.name}
            pinColor={selectedId === place.id ? colors.accent : colors.primary}
            onPress={() => handleMarkerPress(place)}
          />
        ))}
      </MapView>

      {selectedPlace && (
        <View style={[styles.cardOverlay, { paddingBottom: 100 }]}>
          <Pressable
            onPress={handleCardPress}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.95 : 1,
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, { backgroundColor: colors.primary + "18" }]}>
                <MaterialCommunityIcons
                  name={(CATEGORY_ICONS[selectedPlace.category.toLowerCase()] || "map-marker") as any}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedPlace.name}
                </Text>
                <Text style={[styles.cardCategory, { color: colors.mutedForeground }]}>
                  {selectedPlace.category}
                  {selectedPlace.yearBuilt ? ` \u00B7 ${selectedPlace.yearBuilt}` : ""}
                </Text>
              </View>
              <Pressable onPress={handleSave} hitSlop={12}>
                <Feather
                  name="bookmark"
                  size={20}
                  color={isPlaceSaved(selectedPlace.id) ? colors.primary : colors.mutedForeground}
                />
              </Pressable>
            </View>
            <Text style={[styles.cardSummary, { color: colors.foreground }]} numberOfLines={2}>
              {selectedPlace.summary}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={[styles.cardCta, { color: colors.primary }]}>
                View details
              </Text>
              <Feather name="chevron-right" size={14} color={colors.primary} />
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  cardCategory: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textTransform: "capitalize",
    marginTop: 1,
  },
  cardSummary: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cardCta: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
