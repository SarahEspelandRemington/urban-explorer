import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { enableBackgroundAudio, unlockWebSpeech, useNarration } from "@/hooks/useNarration";
import { authHeaders } from "@/lib/apiToken";

// Background location task name. Defining the task at module scope (outside any
// component) is required by expo-task-manager — the OS may invoke this task
// after a process restart, before any React tree has mounted.
const BACKGROUND_LOCATION_TASK = "urban-explorer-background-location";

// Bridge between the OS task callback and the active WalkModeProvider instance.
// We never want stale callbacks holding refs to torn-down providers, so the
// provider sets this on startWalk and clears it on stopWalk.
let activeLocationCallback:
  | ((location: Location.LocationObject) => void)
  | null = null;

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    if (!data) return;
    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;
    const cb = activeLocationCallback;
    if (!cb) return;
    // Only forward the freshest sample; the tick loop doesn't need history.
    cb(locations[locations.length - 1]);
  });
}

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
    // Hard cap on how far a place can be from the user's current location
    // before it gets evicted from the in-memory queue. Without this the
    // queue grows unbounded over a long walk, slowing pickNext and piling
    // up stale map markers across the whole neighborhood.
    memoryRadius: number;
    // Minimum distance the user must walk after a story finishes before the
    // next story is allowed. This is what makes "Sparse" actually feel sparse
    // even when the user is walking fast — it gates on movement, not just time.
    minMetersBetweenPicks: number;
  }
> = {
  sparse: {
    refetchMeters: 120,
    cooldownMs: 75 * 1000,
    netScoreFloor: 1,
    maxQueueDistance: 300,
    discoverRadius: 300,
    memoryRadius: 1000,
    minMetersBetweenPicks: 120,
  },
  dense: {
    refetchMeters: 60,
    cooldownMs: 25 * 1000,
    netScoreFloor: -2,
    maxQueueDistance: 220,
    discoverRadius: 250,
    memoryRadius: 1000,
    minMetersBetweenPicks: 40,
  },
};

// Auto-density tuning. We watch the user's rolling pace over a short window
// and flip density when their behaviour clearly shifts between "browsing" and
// "commuting". A manual pick from the user temporarily suspends auto-switching
// so we don't immediately undo what they chose.
const PACE_WINDOW_MS = 60_000;
const PACE_MIN_WINDOW_MS = 15_000;
const SLOW_PACE_MPS = 0.6;
const FAST_PACE_MPS = 1.4;
const SLOW_DWELL_MS = 30_000;
const MANUAL_OVERRIDE_MS = 5 * 60_000;

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
  const headingWatchRef = useRef<Location.LocationSubscription | null>(null);
  const lastFetchRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const prevLocationRef = useRef<{ latitude: number; longitude: number; ts: number } | null>(null);
  // Device compass heading from the magnetometer, when available.
  const deviceHeadingRef = useRef<number | null>(null);
  // Velocity-derived heading, as a fallback when the compass isn't available.
  const velocityHeadingRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);
  const narratedIdsRef = useRef<Set<string>>(new Set());
  const placesRef = useRef<WalkPlace[]>([]);
  const lastNarrationEndRef = useRef<number>(0);
  // Where the user was when the last narration ended, so we can require them
  // to physically walk a minimum distance before picking the next story.
  const lastNarrationEndLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const isSpeakingRef = useRef(false);
  const densityRef = useRef<WalkDensity>("sparse");
  const isWalkingRef = useRef(false);
  // Rolling pace samples: each entry is (timestamp, meters travelled since
  // the previous sample). Pruned to the last PACE_WINDOW_MS on every update.
  const paceSamplesRef = useRef<{ ts: number; meters: number }[]>([]);
  // When the user's pace first dropped below SLOW_PACE_MPS. Reset whenever
  // they speed back up. Used to require sustained slowness before promoting.
  const slowSinceRef = useRef<number | null>(null);
  // Until this timestamp, auto-density is suspended because the user just
  // made an explicit choice from the UI.
  const manualOverrideUntilRef = useRef<number>(0);

  const applyDensity = useCallback((d: WalkDensity) => {
    if (densityRef.current === d) return;
    densityRef.current = d;
    setDensityState(d);
  }, []);

  const setDensity = useCallback((d: WalkDensity) => {
    // A manual pick wins for a few minutes so auto-switching doesn't undo it.
    manualOverrideUntilRef.current = Date.now() + MANUAL_OVERRIDE_MS;
    slowSinceRef.current = null;
    applyDensity(d);
  }, [applyDensity]);

  // Track narration speaking state in a ref so the loop can react synchronously.
  useEffect(() => {
    const wasSpeaking = isSpeakingRef.current;
    isSpeakingRef.current = narration.isSpeaking;
    if (wasSpeaking && !narration.isSpeaking) {
      lastNarrationEndRef.current = Date.now();
      // Snapshot location at narration end so the next pick must be earned
      // by walking minMetersBetweenPicks from this spot.
      lastNarrationEndLocationRef.current = currentLocation
        ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude }
        : null;
    }
  }, [narration.isSpeaking, currentLocation]);

  const cachedAddressHintRef = useRef<string>("");

  const fetchNearbyPlaces = useCallback(async (latitude: number, longitude: number) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoading(true);
    try {
      const cfg = DENSITY_CONFIG[densityRef.current];
      // Critical path: hit /discover IMMEDIATELY with lat/lng — never block on
      // reverse-geocode. Use any cached addressHint from a previous tick if we
      // happen to have one, but never wait.
      const body: Record<string, unknown> = { latitude, longitude, radius: cfg.discoverRadius };
      if (cachedAddressHintRef.current) body.addressHint = cachedAddressHintRef.current;

      // Kick off a non-blocking reverse-geocode for the NEXT fetch to use.
      Location.reverseGeocodeAsync({ latitude, longitude })
        .then((geocoded) => {
          if (geocoded.length > 0) {
            const g = geocoded[0];
            const parts = [g.streetNumber, g.street, g.district, g.subregion, g.city].filter(Boolean);
            cachedAddressHintRef.current = parts.join(", ");
          }
        })
        .catch(() => {});

      const res = await fetch(`${API_BASE}/api/explore/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...await authHeaders() },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.places)) {
          // Merge with existing — dedupe by id, then evict anything farther
          // than memoryRadius from the user's current location. Without the
          // eviction the queue grows unbounded over a long walk, slowing
          // pickNext and piling stale markers across the whole neighborhood.
          const incoming = data.places as WalkPlace[];
          const map = new Map<string, WalkPlace>();
          for (const p of placesRef.current) map.set(p.id, p);
          for (const p of incoming) map.set(p.id, p);
          const merged: WalkPlace[] = [];
          for (const p of map.values()) {
            const d = haversineMeters(latitude, longitude, p.latitude, p.longitude);
            if (d <= cfg.memoryRadius) merged.push(p);
          }
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
  const pickNext = useCallback((overrideLoc?: { latitude: number; longitude: number }): WalkPlace | null => {
    const loc = overrideLoc ?? currentLocation;
    if (!loc) return null;
    const cfg = DENSITY_CONFIG[densityRef.current];

    // Movement gating: require the user to walk a minimum distance from where
    // the last narration ended before queueing the next one. If we have no
    // anchor yet (first pick of the walk), this gate is a no-op.
    const anchor = lastNarrationEndLocationRef.current;
    if (anchor) {
      const movedSinceLast = haversineMeters(
        anchor.latitude, anchor.longitude, loc.latitude, loc.longitude,
      );
      if (movedSinceLast < cfg.minMetersBetweenPicks) return null;
    }
    // Prefer the live device compass heading; fall back to the heading we
    // derive from GPS velocity when the magnetometer is unavailable.
    const heading = deviceHeadingRef.current ?? velocityHeadingRef.current;

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
          // Feed the rolling pace buffer with this segment. Skip giant jumps
          // (>200m between fixes likely means a teleport / GPS glitch).
          paceSamplesRef.current.push({ ts: now, meters: dist });
        }
        // Compute heading from velocity: only trust if moved enough recently.
        if (dist >= 8 && now - prev.ts < 30_000) {
          velocityHeadingRef.current = bearingDeg(
            prev.latitude, prev.longitude, latitude, longitude,
          );
        }
      }
      prevLocationRef.current = { latitude, longitude, ts: now };

      // --- Auto-density switching ---------------------------------------
      // Drop samples older than the rolling window.
      const cutoff = now - PACE_WINDOW_MS;
      while (
        paceSamplesRef.current.length > 0 &&
        paceSamplesRef.current[0].ts < cutoff
      ) {
        paceSamplesRef.current.shift();
      }
      if (now >= manualOverrideUntilRef.current && paceSamplesRef.current.length > 0) {
        const oldest = paceSamplesRef.current[0].ts;
        const spanMs = now - oldest;
        if (spanMs >= PACE_MIN_WINDOW_MS) {
          const totalMeters = paceSamplesRef.current.reduce((a, s) => a + s.meters, 0);
          const pace = totalMeters / (spanMs / 1000); // m/s
          if (pace > FAST_PACE_MPS) {
            // Commuting — make sure we're in Sparse and reset slow timer.
            slowSinceRef.current = null;
            if (densityRef.current === "dense") applyDensity("sparse");
          } else if (pace < SLOW_PACE_MPS) {
            // Browsing — require sustained slowness before flipping to Dense.
            if (slowSinceRef.current === null) {
              slowSinceRef.current = now;
            } else if (
              densityRef.current === "sparse" &&
              now - slowSinceRef.current >= SLOW_DWELL_MS
            ) {
              applyDensity("dense");
            }
          } else {
            // In-between pace: reset the slow dwell timer but don't flip back.
            slowSinceRef.current = null;
          }
        }
      }

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

      // Drive narration scheduling directly from the GPS event. JS timers may
      // be throttled or suspended while the phone is locked, but background
      // location callbacks keep firing — so each fresh sample is our most
      // reliable "tick" in that state.
      maybeNarrateRef.current?.({ latitude, longitude });
    },
    [fetchNearbyPlaces],
  );

  // Encapsulates the cooldown / speaking / pick / enqueue gating so it can run
  // from both the setInterval tick (foreground) and the GPS callback
  // (background). Stored in a ref so handleLocationUpdate doesn't depend on
  // pickNext/fetchNarration in its useCallback deps.
  const maybeNarrateRef = useRef<((loc?: { latitude: number; longitude: number }) => void) | null>(null);
  const maybeNarrate = useCallback(
    (loc?: { latitude: number; longitude: number }) => {
      if (!isWalkingRef.current) return;
      if (isSpeakingRef.current) return;
      const cfg = DENSITY_CONFIG[densityRef.current];
      if (Date.now() - lastNarrationEndRef.current < cfg.cooldownMs) return;
      const next = pickNext(loc);
      if (!next) return;
      narratedIdsRef.current.add(next.id);
      setNarratedIds(new Set(narratedIdsRef.current));
      fetchNarration(next);
    },
    [pickNext, fetchNarration],
  );
  useEffect(() => {
    maybeNarrateRef.current = maybeNarrate;
  }, [maybeNarrate]);

  // System audio interruptions (incoming phone calls, Siri, turn-by-turn
  // navigation prompts). On iOS these all transition the app from 'active'
  // to 'inactive' without going to 'background' (background = screen lock,
  // which we explicitly want to keep narrating through). When the
  // interruption ends iOS bounces us back to 'active' and we resume.
  //
  // Android doesn't expose 'inactive' so this listener is a no-op there;
  // the OS handles call-time ducking via the audio focus we already request
  // through `interruptionMode: 'duckOthers'` in enableBackgroundAudio.
  const { beginInterruption, endInterruption } = narration;
  useEffect(() => {
    if (!isWalking || Platform.OS !== "ios") return;
    const appStateRef = { current: AppState.currentState as AppStateStatus };
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev === "active" && next === "inactive") {
        beginInterruption();
      } else if (prev === "inactive" && next === "active") {
        endInterruption();
      }
    });
    return () => sub.remove();
  }, [isWalking, beginInterruption, endInterruption]);

  // Free-roam narration loop: belt-and-suspenders foreground tick. Background
  // narration is driven by the GPS callback above; this interval covers the
  // foreground case where the user is standing still (no GPS deltas) but
  // cooldown has elapsed and a new place is in range.
  useEffect(() => {
    if (!isWalking) return;
    const interval = setInterval(() => maybeNarrateRef.current?.(), 1500);
    return () => clearInterval(interval);
  }, [isWalking]);

  const startWalk = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;

    // Background permission is best-effort: if the user declines, Walk Mode
    // still works while the app is in the foreground. We never block the
    // walk on the background grant.
    if (Platform.OS !== "web") {
      try {
        await Location.requestBackgroundPermissionsAsync();
      } catch {}
    }

    // Configure the audio session so expo-speech keeps playing when the
    // screen locks. Best-effort; on failure we fall back to foreground-only
    // narration rather than refusing to start the walk.
    try {
      await enableBackgroundAudio();
    } catch {}

    isWalkingRef.current = true;
    setIsWalking(true);
    // Density is per-walk: every new walk starts back at Sparse so the user
    // makes a fresh choice rather than inheriting last walk's setting.
    densityRef.current = "sparse";
    setDensityState("sparse");
    setStats({ startTime: Date.now(), placesNarrated: 0, distanceWalked: 0 });
    setNarratedIds(new Set());
    narratedIdsRef.current = new Set();
    placesRef.current = [];
    setNearbyPlaces([]);
    lastFetchRef.current = null;
    prevLocationRef.current = null;
    deviceHeadingRef.current = null;
    velocityHeadingRef.current = null;
    cachedAddressHintRef.current = "";
    lastNarrationEndLocationRef.current = null;
    paceSamplesRef.current = [];
    slowSinceRef.current = null;
    manualOverrideUntilRef.current = 0;
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

    if (Platform.OS === "web") {
      try {
        const sub = await Location.watchPositionAsync(
          { accuracy, distanceInterval: 5, timeInterval: 2000 },
          handleLocationUpdate,
        );
        watchRef.current = sub;
      } catch {}
    } else {
      // On native, route GPS through the background task. This keeps the
      // location stream alive when the screen locks (iOS uses the "location"
      // background mode; Android keeps the process alive via the foreground
      // service notification we configure here).
      activeLocationCallback = handleLocationUpdate;
      try {
        const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK,
        );
        if (alreadyRunning) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy,
          distanceInterval: 5,
          timeInterval: 2000,
          activityType: Location.ActivityType.Fitness,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "Urban Explorer is exploring with you",
            notificationBody:
              "Listening for nearby places to narrate as you walk.",
            notificationColor: "#1f2937",
          },
        });
      } catch {
        // If background updates fail to start (e.g. permission denied),
        // fall back to a foreground-only watcher so the walk still works
        // while the app is in front.
        try {
          const sub = await Location.watchPositionAsync(
            { accuracy, distanceInterval: 5, timeInterval: 2000 },
            handleLocationUpdate,
          );
          watchRef.current = sub;
        } catch {}
      }
    }

    // Also subscribe to the device compass; it gives a true heading even when
    // the user is standing still. We fall back to GPS-velocity heading when
    // the platform doesn't support it (notably on web).
    try {
      const headingSub = await Location.watchHeadingAsync((h) => {
        // trueHeading is preferred; -1 means unavailable. magHeading is the fallback.
        const candidate =
          typeof h.trueHeading === "number" && h.trueHeading >= 0
            ? h.trueHeading
            : typeof h.magHeading === "number" && h.magHeading >= 0
              ? h.magHeading
              : null;
        if (candidate !== null) deviceHeadingRef.current = candidate;
      });
      headingWatchRef.current = headingSub;
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
    if (headingWatchRef.current) {
      try { headingWatchRef.current.remove(); } catch {}
      headingWatchRef.current = null;
    }
    if (Platform.OS !== "web") {
      // Tear down the background task so the foreground-service notification
      // disappears and we stop draining battery the moment the walk ends.
      activeLocationCallback = null;
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .then((running) => {
          if (running) {
            return Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          }
        })
        .catch(() => {});
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
