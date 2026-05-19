import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import MapView, {
  Callout,
  Marker,
  PROVIDER_DEFAULT,
  type Region,
} from "react-native-maps";

import { getCategoryIcon } from "@/constants/categories";
import { useColors } from "@/hooks/useColors";

// Module-level cache so geocoded addresses survive across re-renders.
// Capped at MAX_GEOCODE_CACHE_SIZE entries; oldest entries are evicted first.
const MAX_GEOCODE_CACHE_SIZE = 200;
const geocodeCache = new Map<string, { latitude: number; longitude: number }>();

function setCachedGeocode(
  key: string,
  value: { latitude: number; longitude: number },
): void {
  if (geocodeCache.size >= MAX_GEOCODE_CACHE_SIZE) {
    const firstKey = geocodeCache.keys().next().value;
    if (firstKey !== undefined) geocodeCache.delete(firstKey);
  }
  geocodeCache.set(key, value);
}

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
  onPendingCenterChange?: (center: { lat: number; lng: number } | null) => void;
  isLoadingMore?: boolean;
}

const PAN_DISTANCE_THRESHOLD = 150;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
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
  onPendingCenterChange,
  isLoadingMore,
}: PlaceMapViewProps) {
  const colors = useColors();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const lastFetchCenter = useRef({ lat: userLatitude, lng: userLongitude });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the user pans 150m+ from the last search, we show a "Search this area"
  // button instead of auto-firing. pendingCenter stores where they panned to.
  const [pendingCenter, setPendingCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Clear the pending button once loading begins (either from this button or
  // from an external trigger), so the button doesn't linger during the fetch.
  useEffect(() => {
    if (isLoadingMore) {
      setPendingCenter(null);
    }
  }, [isLoadingMore]);

  // Notify parent whenever the pending center changes so it can use the
  // map's current pan position when the user switches range without first
  // tapping "Search this area".
  useEffect(() => {
    onPendingCenterChange?.(pendingCenter);
  }, [pendingCenter, onPendingCenterChange]);

  // Geocoded coordinates keyed by place id. Pins start at the AI-provided
  // lat/lng and silently snap to the geocoded position once it resolves.
  const [geocodedCoords, setGeocodedCoords] = useState<
    Record<string, { latitude: number; longitude: number }>
  >({});

  // Track which marker's callout is open so we can apply the selected-state
  // halo ring. Clears automatically when the callout is dismissed.
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const geocodePlaces = async () => {
      for (const place of places) {
        if (!place.address || cancelled) continue;
        const cacheKey = place.address.toLowerCase().trim();

        // Use cached result immediately to avoid re-geocoding on re-renders.
        const cached = geocodeCache.get(cacheKey);
        if (cached) {
          setGeocodedCoords((prev) => ({ ...prev, [place.id]: cached }));
          continue;
        }

        try {
          const results = await Location.geocodeAsync(place.address);
          if (cancelled) break;
          if (results.length > 0) {
            const coords = {
              latitude: results[0].latitude,
              longitude: results[0].longitude,
            };
            setCachedGeocode(cacheKey, coords);
            setGeocodedCoords((prev) => ({ ...prev, [place.id]: coords }));
          }
        } catch {
          // Keep AI coordinates if geocoding fails.
        }
      }
    };

    geocodePlaces();
    return () => {
      cancelled = true;
    };
    // Re-run only when the set of places changes (not on every object identity change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places.map((p) => p.id).join(",")]);

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
          // Show the "Search this area" button rather than auto-firing.
          setPendingCenter({ lat: region.latitude, lng: region.longitude });
        }
      }, 600);
    },
    [onMapRegionDiscover],
  );

  const handleSearchThisArea = useCallback(() => {
    if (!pendingCenter || !onMapRegionDiscover) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Advance the fetch-center now so a subsequent pan measures from here.
    lastFetchCenter.current = pendingCenter;
    setPendingCenter(null);
    onMapRegionDiscover(pendingCenter.lat, pendingCenter.lng);
  }, [pendingCenter, onMapRegionDiscover]);

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
        {places.map((place) => {
          // Prefer the geocoded coordinate (Apple/Google Maps native geocoder)
          // over the raw AI-provided lat/lng, which can be off by a block or more.
          const markerCoord = geocodedCoords[place.id] ?? {
            latitude: place.latitude,
            longitude: place.longitude,
          };
          const isSelectedExplore = selectedMarkerId === place.id;
          return (
            <Marker
              key={place.id}
              coordinate={markerCoord}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={selectedMarkerId !== null}
              onSelect={() => setSelectedMarkerId(place.id)}
              onDeselect={() => setSelectedMarkerId(null)}
            >
              <View style={styles.pinWrapper}>
                {isSelectedExplore && (
                  <View
                    style={[
                      styles.pinHalo,
                      {
                        borderColor: colors.primary + "80",
                        backgroundColor: colors.primary + "0D",
                      },
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.pin,
                    {
                      backgroundColor: isSelectedExplore
                        ? colors.primary
                        : colors.primary + "CC",
                      borderColor: "#fff",
                    },
                  ]}
                />
              </View>
              <Callout tooltip onPress={() => navigateToDetail(place)}>
                <View
                  style={[
                    styles.calloutContainer,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.calloutHeader}>
                    <View
                      style={[
                        styles.iconContainer,
                        { backgroundColor: colors.primary + "18" },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={getCategoryIcon(place.category) as any}
                        size={16}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.calloutHeaderText}>
                      <Text
                        style={[
                          styles.calloutName,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {place.name}
                      </Text>
                      <Text
                        style={[
                          styles.calloutCategory,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {place.category}
                        {place.yearBuilt ? ` · ${place.yearBuilt}` : ""}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.calloutSummary,
                      { color: colors.foreground },
                    ]}
                    numberOfLines={2}
                  >
                    {place.summary}
                  </Text>
                  <View style={styles.calloutFooter}>
                    <Text
                      style={[styles.calloutCta, { color: colors.primary }]}
                    >
                      Tap for details →
                    </Text>
                  </View>
                </View>
                <View style={styles.calloutArrow}>
                  <View
                    style={[
                      styles.calloutArrowInner,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {isLoadingMore && (
        <View
          style={[
            styles.topBadge,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text
            style={[styles.topBadgeText, { color: colors.mutedForeground }]}
          >
            Finding places…
          </Text>
        </View>
      )}

      {!isLoadingMore && pendingCenter && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.searchButtonWrapper}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={handleSearchThisArea}
            style={({ pressed }) => [
              styles.searchButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Search this area"
          >
            <Feather name="search" size={14} color={colors.primaryForeground} />
            <Text
              style={[
                styles.searchButtonText,
                { color: colors.primaryForeground },
              ]}
            >
              Search this area
            </Text>
          </Pressable>
        </Animated.View>
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
  pinWrapper: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pinHalo: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    opacity: 0.85,
  },
  pin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 3,
  },
  topBadge: {
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
  topBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  searchButtonWrapper: {
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  searchButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
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
