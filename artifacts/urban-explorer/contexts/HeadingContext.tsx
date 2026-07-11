import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { usePathname } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

import { unlockWebSpeech, useNarration } from "@/hooks/useNarration";
import { API_BASE } from "@/lib/apiBase";
import { authHeaders } from "@/lib/apiToken";

export interface HeadingTarget {
  id: string;
  name: string;
  category?: string;
  yearBuilt?: string;
  summary: string;
  facts?: string[];
  latitude: number;
  longitude: number;
}

interface HeadingContextType {
  target: HeadingTarget | null;
  audioPlace: HeadingTarget | null;
  currentLocation: { latitude: number; longitude: number } | null;
  distanceMeters: number | null;
  bearingDegrees: number | null;
  cardinal: string | null;
  isAudioLoading: boolean;
  audioError: string | null;
  narration: ReturnType<typeof useNarration>;
  headTo: (
    place: HeadingTarget,
    opts?: { autoListen?: boolean },
  ) => Promise<void>;
  listen: (place: HeadingTarget) => Promise<void>;
  cancel: () => void;
}

const HeadingContext = createContext<HeadingContextType | null>(null);

function haversineMeters(
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

function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

function bearingToCardinal(bearing: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(bearing / 45) % 8;
  return dirs[idx];
}

export function HeadingProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HeadingTarget | null>(null);
  const [audioPlace, setAudioPlace] = useState<HeadingTarget | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const narration = useNarration();
  const fetchTokenRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const pathname = usePathname();

  // Start/stop GPS watch based on whether we have a target.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const accuracy =
          Platform.OS === "web"
            ? Location.Accuracy.High
            : Location.Accuracy.BestForNavigation;
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy });
          if (!cancelled) {
            setCurrentLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          }
        } catch {}
        const sub = await Location.watchPositionAsync(
          { accuracy, distanceInterval: 5, timeInterval: 2000 },
          (loc) => {
            setCurrentLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          },
        );
        if (cancelled) {
          try {
            sub.remove();
          } catch {}
        } else {
          watchRef.current = sub;
        }
      } catch {}
    }
    if (target) start();
    return () => {
      cancelled = true;
      if (watchRef.current) {
        try {
          watchRef.current.remove();
        } catch {}
        watchRef.current = null;
      }
    };
  }, [target]);

  const fetchAndSpeak = useCallback(
    async (place: HeadingTarget) => {
      const myToken = ++fetchTokenRef.current;
      // Abort any prior in-flight request before starting a new one.
      fetchAbortRef.current?.abort();
      const abortCtrl = new AbortController();
      fetchAbortRef.current = abortCtrl;
      const timeoutId = setTimeout(() => abortCtrl.abort(), 20_000);

      setAudioPlace(place);
      setIsAudioLoading(true);
      setAudioError(null);
      narration.stop();
      try {
        const res = await fetch(`${API_BASE}/api/explore/deep-narration`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeaders()),
          },
          body: JSON.stringify({
            placeName: place.name,
            category: place.category,
            yearBuilt: place.yearBuilt,
            summary: place.summary,
            // Bounded to 3 facts (matches WalkNarrationRequest.facts maxItems); see
            // the same pattern in fetchNarrationPayload.ts's walk-narration request body.
            facts: Array.isArray(place.facts) ? place.facts.slice(0, 3) : [],
          }),
          signal: abortCtrl.signal,
        });
        clearTimeout(timeoutId);
        if (myToken !== fetchTokenRef.current) return;
        if (!res.ok) {
          setAudioError("Couldn't load the deep dive. Try again.");
          return;
        }
        const data = await res.json();
        if (myToken !== fetchTokenRef.current) return;
        if (typeof data?.narration === "string" && data.narration.trim()) {
          if (Platform.OS === "web") unlockWebSpeech();
          narration.enqueue(place.id, data.narration, place.name);
        } else {
          setAudioError("Couldn't generate the deep dive. Try again.");
        }
      } catch {
        clearTimeout(timeoutId);
        if (myToken === fetchTokenRef.current) {
          setAudioError("Network problem fetching audio. Try again.");
        }
      } finally {
        clearTimeout(timeoutId);
        if (myToken === fetchTokenRef.current) setIsAudioLoading(false);
      }
    },
    [narration],
  );

  const headTo = useCallback(
    async (place: HeadingTarget, opts?: { autoListen?: boolean }) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setTarget(place);
      if (opts?.autoListen !== false) {
        await fetchAndSpeak(place);
      }
    },
    [fetchAndSpeak],
  );

  const listen = useCallback(
    async (place: HeadingTarget) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      await fetchAndSpeak(place);
    },
    [fetchAndSpeak],
  );

  const cancel = useCallback(() => {
    fetchTokenRef.current++;
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = null;
    narration.stop();
    setTarget(null);
    setAudioPlace(null);
    setIsAudioLoading(false);
    setAudioError(null);
  }, [narration]);

  // When the user enters Walk Mode (which has its own narration),
  // tear down any active heading so the two narration channels don't fight.
  useEffect(() => {
    if (pathname?.startsWith("/walk-mode") && (target || audioPlace)) {
      cancel();
    }
  }, [pathname, target, audioPlace, cancel]);

  const { distanceMeters, bearingDegrees, cardinal } = useMemo(() => {
    if (!target || !currentLocation) {
      return {
        distanceMeters: null as number | null,
        bearingDegrees: null as number | null,
        cardinal: null as string | null,
      };
    }
    const d = haversineMeters(
      currentLocation.latitude,
      currentLocation.longitude,
      target.latitude,
      target.longitude,
    );
    const b = bearingDeg(
      currentLocation.latitude,
      currentLocation.longitude,
      target.latitude,
      target.longitude,
    );
    return {
      distanceMeters: Math.round(d),
      bearingDegrees: b,
      cardinal: bearingToCardinal(b),
    };
  }, [target, currentLocation]);

  const contextValue = useMemo(
    () => ({
      target,
      audioPlace,
      currentLocation,
      distanceMeters,
      bearingDegrees,
      cardinal,
      isAudioLoading,
      audioError,
      narration,
      headTo,
      listen,
      cancel,
    }),
    [
      target,
      audioPlace,
      currentLocation,
      distanceMeters,
      bearingDegrees,
      cardinal,
      isAudioLoading,
      audioError,
      narration,
      headTo,
      listen,
      cancel,
    ],
  );

  return (
    <HeadingContext.Provider value={contextValue}>
      {children}
    </HeadingContext.Provider>
  );
}

export function useHeading() {
  const ctx = useContext(HeadingContext);
  if (!ctx) throw new Error("useHeading must be used within HeadingProvider");
  return ctx;
}
