import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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

import { getCategoryIcon } from "@/constants/categories";
import { useDiscovery, type SavedPlace } from "@/contexts/DiscoveryContext";
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
  onMapRegionDiscover?: (lat: number, lng: number) => void;
  isLoadingMore?: boolean;
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
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
  const { savePlace, removePlace, isPlaceSaved } = useDiscovery();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const lastFetchCenter = useRef({ lat: userLatitude, lng: userLongitude });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMapRegionDiscoverRef = useRef(onMapRegionDiscover);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    onMapRegionDiscoverRef.current = onMapRegionDiscover;
  }, [onMapRegionDiscover]);

  useEffect(() => {
    if ((window as any).L) {
      setLeafletReady(true);
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    }).setView([userLatitude, userLongitude], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    L.circleMarker([userLatitude, userLongitude], {
      radius: 8,
      fillColor: "#4285F4",
      color: "#fff",
      weight: 2,
      fillOpacity: 1,
    }).addTo(map);

    map.on("moveend", () => {
      const center = map.getCenter();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const dist = haversineDistance(
          lastFetchCenter.current.lat,
          lastFetchCenter.current.lng,
          center.lat,
          center.lng,
        );
        if (dist > PAN_DISTANCE_THRESHOLD && onMapRegionDiscoverRef.current) {
          lastFetchCenter.current = { lat: center.lat, lng: center.lng };
          onMapRegionDiscoverRef.current(center.lat, center.lng);
        }
      }, 800);
    });

    mapInstanceRef.current = map;

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [leafletReady]);

  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady) return;
    const L = (window as any).L;
    if (!L) return;

    const map = mapInstanceRef.current;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    places.forEach((place) => {
      const icon = L.divIcon({
        className: "custom-marker",
        html: `<div style="
          width: 28px; height: 28px; border-radius: 50%;
          background: ${colors.primary}; border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([place.latitude, place.longitude], { icon }).addTo(map);
      marker.on("click", () => setSelectedPlace(place));
      markersRef.current.push(marker);
    });
  }, [places, leafletReady, colors.primary]);

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
    const saved = isPlaceSaved(selectedPlace.id);
    if (saved) {
      removePlace(selectedPlace.id);
    } else {
      savePlace(selectedPlace as Omit<SavedPlace, "savedAt">);
    }
  };

  return (
    <View style={styles.container}>
      <div
        ref={mapContainerRef as any}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      />

      {isLoadingMore && (
        <View style={[styles.loadingBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingBadgeText, { color: colors.mutedForeground }]}>
            Finding places...
          </Text>
        </View>
      )}

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
                  name={getCategoryIcon(selectedPlace.category) as any}
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
    position: "relative" as any,
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
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  loadingBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 1000,
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
