import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { unlockWebSpeech, useNarration } from "@/hooks/useNarration";
import { authHeaders } from "@/lib/apiToken";

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
  progressMeters?: number;
  offsetMeters?: number;
}

export interface PlannedRoute {
  start: { latitude: number; longitude: number; label?: string };
  end: { latitude: number; longitude: number; label?: string };
  geometry: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  places: WalkPlace[];
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
  plannedRoute: PlannedRoute | null;
  setPlannedRoute: (route: PlannedRoute | null) => void;
  routeProgressMeters: number;
  nextPlace: WalkPlace | null;
  nextPlaceDistanceMeters: number | null;
}

const WalkModeContext = createContext<WalkModeContextType | null>(null);

const PROXIMITY_RADIUS = 80;
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

function projectToMeters(
  lat: number, lng: number,
  originLat: number, originLng: number,
): { x: number; y: number } {
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  return {
    x: (lng - originLng) * 111320 * cosLat,
    y: (lat - originLat) * 111320,
  };
}

function progressAlongRoute(
  geometry: [number, number][],
  lat: number, lng: number,
): number {
  if (!geometry || geometry.length < 2) return 0;
  const [originLat, originLng] = geometry[0];
  const projected = geometry.map(([la, ln]) => projectToMeters(la, ln, originLat, originLng));
  const target = projectToMeters(lat, lng, originLat, originLng);

  let bestDist = Infinity;
  let bestProgress = 0;
  let cumulative = 0;

  for (let i = 0; i < projected.length - 1; i++) {
    const a = projected[i];
    const b = projected[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen2 = dx * dx + dy * dy;
    let t = 0;
    if (segLen2 > 0) {
      t = ((target.x - a.x) * dx + (target.y - a.y) * dy) / segLen2;
      t = Math.max(0, Math.min(1, t));
    }
    const closestX = a.x + t * dx;
    const closestY = a.y + t * dy;
    const dist = Math.sqrt((target.x - closestX) ** 2 + (target.y - closestY) ** 2);
    const segLen = Math.sqrt(segLen2);
    if (dist < bestDist) {
      bestDist = dist;
      bestProgress = cumulative + t * segLen;
    }
    cumulative += segLen;
  }
  return bestProgress;
}

export function WalkModeProvider({ children }: { children: React.ReactNode }) {
  const [isWalking, setIsWalking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<WalkPlace[]>([]);
  const [narratedIds, setNarratedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<WalkStats>({ startTime: 0, placesNarrated: 0, distanceWalked: 0 });
  const [plannedRoute, setPlannedRouteState] = useState<PlannedRoute | null>(null);
  const [routeProgressMeters, setRouteProgressMeters] = useState(0);

  const narration = useNarration();
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastFetchRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const prevLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const fetchingRef = useRef(false);
  const narratedIdsRef = useRef<Set<string>>(new Set());
  const plannedRouteRef = useRef<PlannedRoute | null>(null);

  const setPlannedRoute = useCallback((route: PlannedRoute | null) => {
    plannedRouteRef.current = route;
    setPlannedRouteState(route);
    if (route) {
      setNearbyPlaces(route.places);
    }
  }, []);

  const fetchNearbyPlaces = useCallback(async (latitude: number, longitude: number) => {
    if (fetchingRef.current) return;
    if (plannedRouteRef.current) return; // planned routes use their own pre-fetched places
    fetchingRef.current = true;
    setIsLoading(true);
    try {
      let addressHint = "";
      try {
        const geocoded = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocoded.length > 0) {
          const g = geocoded[0];
          const parts = [g.streetNumber, g.street, g.district, g.subregion, g.city].filter(Boolean);
          addressHint = parts.join(", ");
        }
      } catch {}

      const body: Record<string, unknown> = { latitude, longitude, radius: 250 };
      if (addressHint) body.addressHint = addressHint;

      const res = await fetch(`${API_BASE}/api/explore/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...await authHeaders() },
        body: JSON.stringify(body),
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
        headers: { "Content-Type": "application/json", ...await authHeaders() },
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
        if (dist < 200) {
          // ignore GPS jumps that suggest teleport
          setStats((prev) => ({ ...prev, distanceWalked: prev.distanceWalked + dist }));
        }
      }
      prevLocationRef.current = { latitude, longitude };

      if (plannedRouteRef.current) {
        const progress = progressAlongRoute(
          plannedRouteRef.current.geometry, latitude, longitude,
        );
        setRouteProgressMeters(progress);
        return;
      }

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

  const hasAutoNarratedRef = useRef(false);

  useEffect(() => {
    if (!isWalking || !currentLocation || nearbyPlaces.length === 0) return;

    const isPlanned = !!plannedRouteRef.current;

    // For ad-hoc (non-planned) walks: kick off narration with the closest unnarrated
    // place on the very first location update so the user hears something immediately.
    // Planned walks rely on real proximity + route-progress ordering only.
    if (!isPlanned && !hasAutoNarratedRef.current) {
      hasAutoNarratedRef.current = true;
      let closest: WalkPlace | null = null;
      let closestDist = Infinity;
      for (const place of nearbyPlaces) {
        if (narratedIdsRef.current.has(place.id)) continue;
        const dist = haversineDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          place.latitude,
          place.longitude,
        );
        if (dist < closestDist) {
          closestDist = dist;
          closest = place;
        }
      }
      if (closest) {
        narratedIdsRef.current.add(closest.id);
        setNarratedIds(new Set(narratedIdsRef.current));
        fetchNarration(closest);
      }
    }

    for (const place of nearbyPlaces) {
      if (narratedIdsRef.current.has(place.id)) continue;
      const dist = haversineDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        place.latitude,
        place.longitude,
      );
      if (dist > PROXIMITY_RADIUS) continue;

      // For planned walks, also enforce route-progress ordering so loopbacks /
      // crossings don't trigger out-of-sequence narration.
      if (isPlanned) {
        const placeProgress = place.progressMeters ?? 0;
        // Allow places within a window of where the user currently is along the route.
        if (placeProgress < routeProgressMeters - 60) continue; // already passed
        if (placeProgress > routeProgressMeters + 200) continue; // way ahead
      }

      narratedIdsRef.current.add(place.id);
      setNarratedIds(new Set(narratedIdsRef.current));
      fetchNarration(place);
    }
  }, [isWalking, currentLocation, nearbyPlaces, fetchNarration, routeProgressMeters]);

  const startWalk = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;

    setIsWalking(true);
    setStats({ startTime: Date.now(), placesNarrated: 0, distanceWalked: 0 });
    setNarratedIds(new Set());
    narratedIdsRef.current = new Set();
    if (!plannedRouteRef.current) {
      setNearbyPlaces([]);
    }
    lastFetchRef.current = null;
    prevLocationRef.current = null;
    hasAutoNarratedRef.current = false;
    setRouteProgressMeters(0);

    if (Platform.OS === "web") {
      try {
        unlockWebSpeech();
      } catch {}
    }

    const accuracy =
      Platform.OS === "web" ? Location.Accuracy.High : Location.Accuracy.BestForNavigation;

    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy });
      handleLocationUpdate(loc);
    } catch {}

    try {
      const sub = await Location.watchPositionAsync(
        {
          accuracy,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        handleLocationUpdate,
      );
      watchRef.current = sub;
    } catch {
    }
  }, [handleLocationUpdate, narration]);

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

  const { nextPlace, nextPlaceDistanceMeters } = useMemo(() => {
    if (!plannedRoute || !currentLocation) {
      return { nextPlace: null as WalkPlace | null, nextPlaceDistanceMeters: null as number | null };
    }
    const upcoming = plannedRoute.places
      .filter((p) => !narratedIds.has(p.id))
      .filter((p) => (p.progressMeters ?? 0) >= routeProgressMeters - 30)
      .sort((a, b) => (a.progressMeters ?? 0) - (b.progressMeters ?? 0));
    const next = upcoming[0] ?? null;
    if (!next) return { nextPlace: null, nextPlaceDistanceMeters: null };
    const dist = haversineDistance(
      currentLocation.latitude, currentLocation.longitude,
      next.latitude, next.longitude,
    );
    return { nextPlace: next, nextPlaceDistanceMeters: Math.round(dist) };
  }, [plannedRoute, currentLocation, narratedIds, routeProgressMeters]);

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
        plannedRoute,
        setPlannedRoute,
        routeProgressMeters,
        nextPlace,
        nextPlaceDistanceMeters,
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
