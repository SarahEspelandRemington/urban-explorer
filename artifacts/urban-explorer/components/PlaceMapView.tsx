import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from "react-native-maps";

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
  school: "school",
  arts_centre: "palette",
  theatre: "drama-masks",
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
  onMapRegionDiscover?: (lat: number, lng: number) => void;
  isLoadingMore?: boolean;
}

const PAN_DISTANCE_THRESHOLD = 150;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function PlaceMapView({
  places,
  userLatitude,
  userLongitude,
  onMapRegionDiscover,
  isLoadingMore,
}: PlaceMapViewProps) {
  const colors = useColors();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const { savePlace, removePlace, isPlaceSaved } = useDiscovery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastFetchCenter = useRef({ lat: userLatitude, lng: userLongitude });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      if (!onMapRegionDiscover) return;

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        const dist = haversineDistance(
          lastFetchCenter.current.lat,
          lastFetchCenter.current.lng,
          region.latitude,
          region.longitude,
        );

        if (dist > PAN_DISTANCE_THRESHOLD) {
          lastFetchCenter.current = { lat: region.latitude, lng: region.longitude };
          onMapRegionDiscover(region.latitude, region.longitude);
        }
      }, 800);
    },
    [onMapRegionDiscover],
  );

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
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {places.map((place) => (
          <Marker
            key={place.id}
            coordinate={{
              latitude: place.latitude,
              longitude: place.longitude,
            }}
            pinColor={selectedId === place.id ? colors.accent : colors.primary}
            onPress={() => handleMarkerPress(place)}
          />
        ))}
      </MapView>

      {isLoadingMore && (
        <View
          style={[
            styles.loadingBadge,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingBadgeText, { color: colors.mutedForeground }]}>
            Finding places...
          </Text>
        </View>
      )}

      {selectedPlace && (
        <View style={styles.cardOverlay}>
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
  loadingBadge: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    zIndex: 10,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  loadingBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  cardOverlay: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 20,
    elevation: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
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
