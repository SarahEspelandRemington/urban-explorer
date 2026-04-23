import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
  netScore?: number;
}

export type WalkDensity = "sparse" | "dense";

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
  density: WalkDensity;
  setDensity: (d: WalkDensity) => void;
}

const WalkModeContext = createContext<WalkModeContextType | null>(null);

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

// Density tuning
const DENSITY_CONFIG: Record<
  WalkDensity,
  {
    refetchMeters: number;
    cooldownMs: number;
    netScoreFloor: number;
    maxQueueDistance: number;
    discoverRadius: number;
  }
> = {
  sparse: {
    refetchMeters: 120,
    cooldownMs: 75 * 1000,
    netScoreFloor: 1,
    maxQueueDistance: 300,
    discoverRadius: 300,
  },
  dense: {
    refetchMeters: 60,
    cooldownMs: 25 * 1000,
    netScoreFloor: -2,
    maxQueueDistance: 220,
    discoverRadius: 250,
  },
};

function haversineMeters(
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

function bearingDeg(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function WalkModeProvider({ children }: { children: React.ReactNode }) {
  const [isWalking, setIsWalking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<WalkPlace[]>([]);
  const [narratedIds, setNarratedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<WalkStats>({ startTime: 0, placesNarrated: 0, distanceWalked: 0 });
  const [density, setDensityState] = useState<WalkDensity>("sparse");

  const narration = useNarration();
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastFetchRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const prevLocationRef = useRef<{ latitude: number; longitude: number; ts: number } | null>(null);
  const headingRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);
  const narratedIdsRef = useRef<Set<string>>(new Set());
  const placesRef = useRef<WalkPlace[]>([]);
  const lastNarrationEndRef = useRef<number>(0);
  const isSpeakingRef = useRef(false);
  const densityRef = useRef<WalkDensity>("sparse");
  const isWalkingRef = useRef(false);

  const setDensity = useCallback((d: WalkDensity) => {
    densityRef.current = d;
    setDensityState(d);
  }, []);

  // Track narration speaking state in a ref so the loop can react synchronously.
  useEffect(() => {
    const wasSpeaking = isSpeakingRef.current;
    isSpeakingRef.current = narration.isSpeaking;
    if (wasSpeaking && !narration.isSpeaking) {
      lastNarrationEndRef.current = Date.now();
    }
  }, [narration.isSpeaking]);

  const fetchNearbyPlaces = useCallback(async (latitude: number, longitude: number) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoading(true);
    try {
      const cfg = DENSITY_CONFIG[densityRef.current];
      let addressHint = "";
      try {
        const geocoded = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocoded.length > 0) {
          const g = geocoded[0];
          const parts = [g.streetNumber, g.street, g.district, g.subregion, g.city].filter(Boolean);
          addressHint = parts.join(", ");
        }
      } catch {}

      const body: Record<string, unknown> = { latitude, longitude, radius: cfg.discoverRadius };
      if (addressHint) body.addressHint = addressHint;

      const res = await fetch(`${API_BASE}/api/explore/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...await authHeaders() },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.places)) {
          // Merge with existing — keep narrated entries so chips persist, dedupe by id.
          const incoming = data.places as WalkPlace[];
          const map = new Map<string, WalkPlace>();
          for (const p of placesRef.current) map.set(p.id, p);
          for (const p of incoming) map.set(p.id, p);
          const merged = Array.from(map.values());
          placesRef.current = merged;
          setNearbyPlaces(merged);
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
    } catch {}
  }, [narration]);

  /**
   * Pick the best place to narrate next, given current location, heading, density.
   * Returns null if nothing qualifies right now.
   */
  const pickNext = useCallback((): WalkPlace | null => {
    const loc = currentLocation;
    if (!loc) return null;
    const cfg = DENSITY_CONFIG[densityRef.current];
    const heading = headingRef.current;

    let best: WalkPlace | null = null;
    let bestScore = Infinity;

    for (const p of placesRef.current) {
      if (narratedIdsRef.current.has(p.id)) continue;
      const dist = haversineMeters(loc.latitude, loc.longitude, p.latitude, p.longitude);
      if (dist > cfg.maxQueueDistance) continue;
      const net = p.netScore ?? 0;
      if (net < cfg.netScoreFloor) continue;

      // Scoring: lower is better. Distance is the base.
      let score = dist;
      // Forward bias: subtract up to 60m bonus when place is in our direction of travel.
      if (heading !== null) {
        const placeBearing = bearingDeg(loc.latitude, loc.longitude, p.latitude, p.longitude);
        const diff = angularDiff(heading, placeBearing);
        // diff=0 → cos=1 → -60m bonus; diff=90 → 0; diff=180 → +60m penalty.
        score -= 60 * Math.cos((diff * Math.PI) / 180);
      }
      // Rating bonus: each net upvote shaves up to 20m, capped at 80m.
      score -= Math.min(80, Math.max(-40, net * 20));

      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }, [currentLocation]);

  const handleLocationUpdate = useCallback(
    (location: Location.LocationObject) => {
      const { latitude, longitude } = location.coords;
      const now = Date.now();
      setCurrentLocation({ latitude, longitude });

      if (prevLocationRef.current) {
        const prev = prevLocationRef.current;
        const dist = haversineMeters(prev.latitude, prev.longitude, latitude, longitude);
        if (dist < 200) {
          setStats((s) => ({ ...s, distanceWalked: s.distanceWalked + dist }));
        }
        // Compute heading from velocity: only trust if moved enough recently.
        if (dist >= 8 && now - prev.ts < 30_000) {
          headingRef.current = bearingDeg(prev.latitude, prev.longitude, latitude, longitude);
        }
      }
      prevLocationRef.current = { latitude, longitude, ts: now };

      // Refetch on movement.
      const cfg = DENSITY_CONFIG[densityRef.current];
      if (!lastFetchRef.current) {
        fetchNearbyPlaces(latitude, longitude);
      } else {
        const distFromLastFetch = haversineMeters(
          lastFetchRef.current.latitude,
          lastFetchRef.current.longitude,
          latitude,
          longitude,
        );
        if (distFromLastFetch > cfg.refetchMeters) {
          fetchNearbyPlaces(latitude, longitude);
        }
      }
    },
    [fetchNearbyPlaces],
  );

  // Free-roam narration loop: every second, see if we should start the next story.
  useEffect(() => {
    if (!isWalking) return;
    const tick = () => {
      if (!isWalkingRef.current) return;
      if (isSpeakingRef.current) return;
      const cfg = DENSITY_CONFIG[densityRef.current];
      if (Date.now() - lastNarrationEndRef.current < cfg.cooldownMs) return;
      const next = pickNext();
      if (!next) return;
      narratedIdsRef.current.add(next.id);
      setNarratedIds(new Set(narratedIdsRef.current));
      fetchNarration(next);
    };
    const interval = setInterval(tick, 1500);
    return () => clearInterval(interval);
  }, [isWalking, pickNext, fetchNarration]);

  const startWalk = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;

    isWalkingRef.current = true;
    setIsWalking(true);
    setStats({ startTime: Date.now(), placesNarrated: 0, distanceWalked: 0 });
    setNarratedIds(new Set());
    narratedIdsRef.current = new Set();
    placesRef.current = [];
    setNearbyPlaces([]);
    lastFetchRef.current = null;
    prevLocationRef.current = null;
    headingRef.current = null;
    // Start cooldown so we don't fire instantly before the user has even moved.
    lastNarrationEndRef.current = Date.now() - DENSITY_CONFIG[densityRef.current].cooldownMs + 5000;

    if (Platform.OS === "web") {
      try { unlockWebSpeech(); } catch {}
    }

    const accuracy =
      Platform.OS === "web" ? Location.Accuracy.High : Location.Accuracy.BestForNavigation;

    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy });
      handleLocationUpdate(loc);
    } catch {}

    try {
      const sub = await Location.watchPositionAsync(
        { accuracy, distanceInterval: 5, timeInterval: 2000 },
        handleLocationUpdate,
      );
      watchRef.current = sub;
    } catch {}
  }, [handleLocationUpdate]);

  const stopWalk = useCallback(() => {
    isWalkingRef.current = false;
    setIsWalking(false);
    narration.stop();
    if (watchRef.current) {
      try { watchRef.current.remove(); } catch {}
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
        density,
        setDensity,
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
