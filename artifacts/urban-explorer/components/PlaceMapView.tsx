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
import MapView, {
  Callout,
  Marker,
  PROVIDER_DEFAULT,
  type Region,
} from "react-native-maps";

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
  address?: string;
  tags?: string[];
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
  const lastFetchCenter = useRef({ lat: userLatitude, lng: userLongitude });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateToDetail = useCallback(
    (place: Place) => {
      router.push({
        pathname: "/place-detail",
        params: {
          name: place.name,
          latitude: String(place.latitude),
          longitude: String(place.longitude),
          category: place.category,
          yearBuilt: place.yearBuilt || "",
          summary: place.summary,
          facts: JSON.stringify(place.facts),
          address: place.address || "",
          tags: JSON.stringify(place.tags || []),
        },
      });
    },
    [router],
  );

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
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {places.map((place) => (
          <Marker
            key={place.id}
            coordinate={{
              latitude: place.latitude,
              longitude: place.longitude,
            }}
            pinColor={colors.primary}
          >
            <Callout
              tooltip
              onPress={() => navigateToDetail(place)}
            >
              <View style={[styles.calloutContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.calloutHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.primary + "18" }]}>
                    <MaterialCommunityIcons
                      name={(CATEGORY_ICONS[place.category.toLowerCase()] || "map-marker") as any}
                      size={16}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.calloutHeaderText}>
                    <Text style={[styles.calloutName, { color: colors.foreground }]} numberOfLines={1}>
                      {place.name}
                    </Text>
                    <Text style={[styles.calloutCategory, { color: colors.mutedForeground }]}>
                      {place.category}
                      {place.yearBuilt ? ` · ${place.yearBuilt}` : ""}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.calloutSummary, { color: colors.foreground }]} numberOfLines={2}>
                  {place.summary}
                </Text>
                <View style={styles.calloutFooter}>
                  <Text style={[styles.calloutCta, { color: colors.primary }]}>
                    Tap for details →
                  </Text>
                </View>
              </View>
              <View style={styles.calloutArrow}>
                <View style={[styles.calloutArrowInner, { backgroundColor: colors.card, borderColor: colors.border }]} />
              </View>
            </Callout>
          </Marker>
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
  calloutContainer: {
    width: 260,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  calloutArrow: {
    alignItems: "center",
    marginTop: -1,
  },
  calloutArrowInner: {
    width: 14,
    height: 14,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    transform: [{ rotate: "45deg" }],
    marginTop: -8,
  },
  calloutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  calloutHeaderText: {
    flex: 1,
  },
  calloutName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  calloutCategory: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textTransform: "capitalize",
    marginTop: 1,
  },
  calloutSummary: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginBottom: 8,
  },
  calloutFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  calloutCta: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
