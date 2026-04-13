import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { useNarration } from "@/hooks/useNarration";

interface WalkPlace {
  id: string;
  name: string;
  category: string;
  yearBuilt?: string;
  tags?: string[];
  summary: string;
  facts: string[];
  latitude: number;
  longitude: number;
  address?: string;
  distanceMeters?: number;
}

interface WalkStats {
  startTime: number;
  placesNarrated: number;
  distanceWalked: number;
}

interface WalkModeContextType {
  isWalking: boolean;
  startWalk: () => Promise<void>;
  stopWalk: () => void;
  currentLocation: { latitude: number; longitude: number } | null;
  nearbyPlaces: WalkPlace[];
  narratedIds: Set<string>;
  stats: WalkStats;
  narration: ReturnType<typeof useNarration>;
  isLoading: boolean;
}

const WalkModeContext = createContext<WalkModeContextType | null>(null);

const PROXIMITY_RADIUS = 50;
const REFETCH_DISTANCE = 200;
const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
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

export function WalkModeProvider({ children }: { children: React.ReactNode }) {
  const [isWalking, setIsWalking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<WalkPlace[]>([]);
  const [narratedIds, setNarratedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<WalkStats>({ startTime: 0, placesNarrated: 0, distanceWalked: 0 });

  const narration = useNarration();
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastFetchRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const prevLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const fetchingRef = useRef(false);
  const narratedIdsRef = useRef<Set<string>>(new Set());

  const fetchNearbyPlaces = useCallback(async (latitude: number, longitude: number) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/explore/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude, radius: 300 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.places) {
          setNearbyPlaces(data.places);
          lastFetchRef.current = { latitude, longitude };
        }
      }
    } catch {
    } finally {
      fetchingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const fetchNarration = useCallback(async (place: WalkPlace) => {
    try {
      const res = await fetch(`${API_BASE}/api/explore/walk-narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeName: place.name,
          category: place.category,
          summary: place.summary,
          fact: place.facts[0],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.narration) {
          narration.enqueue(place.id, data.narration, place.name);
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          setStats((prev) => ({ ...prev, placesNarrated: prev.placesNarrated + 1 }));
        }
      }
    } catch {
    }
  }, [narration]);

  const handleLocationUpdate = useCallback(
    (location: Location.LocationObject) => {
      const { latitude, longitude } = location.coords;
      setCurrentLocation({ latitude, longitude });

      if (prevLocationRef.current) {
        const dist = haversineDistance(
          prevLocationRef.current.latitude,
          prevLocationRef.current.longitude,
          latitude,
          longitude,
        );
        setStats((prev) => ({ ...prev, distanceWalked: prev.distanceWalked + dist }));
      }
      prevLocationRef.current = { latitude, longitude };

      if (!lastFetchRef.current) {
        fetchNearbyPlaces(latitude, longitude);
        return;
      }

      const distFromLastFetch = haversineDistance(
        lastFetchRef.current.latitude,
        lastFetchRef.current.longitude,
        latitude,
        longitude,
      );
      if (distFromLastFetch > REFETCH_DISTANCE) {
        fetchNearbyPlaces(latitude, longitude);
      }
    },
    [fetchNearbyPlaces],
  );

  useEffect(() => {
    if (!isWalking || !currentLocation || nearbyPlaces.length === 0) return;

    for (const place of nearbyPlaces) {
      if (narratedIdsRef.current.has(place.id)) continue;
      const dist = haversineDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        place.latitude,
        place.longitude,
      );
      if (dist <= PROXIMITY_RADIUS) {
        narratedIdsRef.current.add(place.id);
        setNarratedIds(new Set(narratedIdsRef.current));
        fetchNarration(place);
      }
    }
  }, [isWalking, currentLocation, nearbyPlaces, fetchNarration]);

  const startWalk = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;

    setIsWalking(true);
    setStats({ startTime: Date.now(), placesNarrated: 0, distanceWalked: 0 });
    setNarratedIds(new Set());
    narratedIdsRef.current = new Set();
    setNearbyPlaces([]);
    lastFetchRef.current = null;
    prevLocationRef.current = null;

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    handleLocationUpdate(loc);

    try {
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 3000,
        },
        handleLocationUpdate,
      );
      watchRef.current = sub;
    } catch {
    }
  }, [handleLocationUpdate]);

  const stopWalk = useCallback(() => {
    setIsWalking(false);
    narration.stop();
    if (watchRef.current) {
      try {
        watchRef.current.remove();
      } catch {}
      watchRef.current = null;
    }
  }, [narration]);

  return (
    <WalkModeContext.Provider
      value={{
        isWalking,
        startWalk,
        stopWalk,
        currentLocation,
        nearbyPlaces,
        narratedIds,
        stats,
        narration,
        isLoading,
      }}
    >
      {children}
    </WalkModeContext.Provider>
  );
}

export function useWalkMode() {
  const ctx = useContext(WalkModeContext);
  if (!ctx) throw new Error("useWalkMode must be used within WalkModeProvider");
  return ctx;
}
