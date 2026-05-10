import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { useLocale } from "@/contexts/LocaleContext";
import {
  enableBackgroundAudio,
  unlockWebSpeech,
  useNarration,
} from "@/hooks/useNarration";
import { authHeaders } from "@/lib/apiToken";
import { getLocaleMeta as getNotificationLocale } from "@/lib/i18n";
import { fetchNarrationPayload as fetchNarrationPayloadUtil } from "@/lib/fetchNarrationPayload";
import {
  getStartupValue,
  setStartupValue,
  STARTUP_KEYS,
} from "@/lib/startupStorage";
import {
  addWalkBreadcrumb,
  setWalkScope,
  trackPrefetchEvent,
} from "@/lib/sentryWalk";
import {
  installSessionCallback,
  dispatchLocation,
} from "@/lib/walkSessionManager";
import { executeStopWalkSync } from "@/lib/walkStopSession";
import {
  consumePrefetchedNarration,
  createStalePrefetchPool,
  disposeStalePrefetchPool,
  emptyPrefetchCounters,
  type PrefetchCounters,
  type PrefetchEntry,
  type PrefetchEvent,
  runPrefetchCycle,
  type StalePrefetchPool,
} from "@/lib/narrationPrefetchPipeline";
import { NowPlaying } from "@/modules/expo-now-playing/src";
import {
  type BuildingGroupKey,
  groupKeysToIncludedTypes,
} from "@/constants/buildingTypeGroups";

// Background location task name. Defining the task at module scope (outside any
// component) is required by expo-task-manager — the OS may invoke this task
// after a process restart, before any React tree has mounted.
const BACKGROUND_LOCATION_TASK = "urban-explorer-background-location";

// Register the background GPS task at module scope (required by expo-task-manager).
// Location events are forwarded to whichever session is active via
// walkSessionManager.dispatchLocation — the CAS logic in walkSessionManager
// ensures stale sessions cannot ghost-clear the current session's callback.
if (
  Platform.OS !== "web" &&
  !TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)
) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    if (!data) return;
    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;
    // Only forward the freshest sample; the tick loop doesn't need history.
    dispatchLocation(locations[locations.length - 1]);
  });
}

// Two ways a narration can be delivered to the playback engine:
//   - "audio": a pre-rendered MP3 file URI (natural-voice TTS, native only).
//     Carries a cleanup() that deletes the temp file once playback ends.
//   - "text":  raw text (web SpeechSynthesisUtterance, or a fallback on
//     native when the audio endpoint failed).
type NarrationPayload =
  | { kind: "audio"; audioUri: string; cleanup?: () => void }
  | { kind: "text"; text: string };

export interface WalkPlace {
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
  photoUrl?: string;
}

export type WalkDensity = "sparse" | "dense";

interface WalkStats {
  startTime: number;
  placesNarrated: number;
  distanceWalked: number;
}

interface WalkModeContextType {
  isWalking: boolean;
  startWalk: (initialPlaces?: WalkPlace[]) => Promise<boolean>;
  stopWalk: () => void;
  currentLocation: { latitude: number; longitude: number } | null;
  nearbyPlaces: WalkPlace[];
  narratedIds: Map<string, number>;
  stats: WalkStats;
  narration: ReturnType<typeof useNarration>;
  isLoading: boolean;
  density: WalkDensity;
  setDensity: (d: WalkDensity) => void;
  currentNarrationPlace: WalkPlace | null;
  // True for a few seconds when the current narration started from the
  // short-window cache (a place that was just re-picked within the prefetch
  // TTL). UI uses this to show a small "Replay" badge so users know the
  // instant playback is intentional, not a degraded fallback.
  isReplay: boolean;
  fetchPlacesAlongRoute: (
    geometry: number[][],
    maxPlaces?: number,
  ) => Promise<WalkPlace[]>;
  enabledBuildingGroups: Set<BuildingGroupKey>;
  setEnabledBuildingGroups: (groups: Set<BuildingGroupKey>) => void;
  /**
   * Per-walk running totals for the narration prefetch pipeline. Reset to
   * zero on every startWalk. Surfaced in the dev debug overlay so we can
   * eyeball cache hit rate during real walks and catch regressions where
   * the pipeline silently degrades to "fetch on demand for every place".
   */
  prefetchStats: PrefetchCounters;
  /**
   * Persisted opt-in for the prefetch stats counter line in the Walk Mode
   * footer. Off by default. When on, the same counter that appears in dev
   * builds is shown in production so power users / TestFlight testers can
   * report hit-rate numbers without us shipping a debug build.
   */
  showPrefetchStats: boolean;
  setShowPrefetchStats: (enabled: boolean) => void;
}

const WalkModeContext = createContext<WalkModeContextType | null>(null);

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

// In Expo Go the native modules are the SDK-bundled versions and may not match
// the JS package versions installed in this project. Skip the native audio path
// (expo-file-system write + expo-audio player) to avoid native bridge crashes;
// the text / expo-speech fallback works fine in Expo Go.
const IS_EXPO_GO = Constants.appOwnership === "expo";

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
    // Width of the search corridor used when pre-fetching places along a
    // planned route (passed to POST /api/explore/places-along-route as
    // `corridorMeters`). Sparse uses a wider corridor to surface quality
    // hidden-gem places set back from the path; dense uses a narrower
    // corridor to pack in many closely-spaced discoveries right along the
    // route centre-line.
    corridorMeters: number;
    // --- Heading-aware scoring constants (used in pickNext) ---
    // Maximum score reduction (metres) awarded to a place that is directly
    // ahead (bearing == heading). At 90° off-axis the bonus reaches 0; at
    // 180° it flips to a +forwardBiasMeters penalty.
    // Raising this from the old 60 m to 200 m ensures an avenue place
    // 200 m ahead (score = 200−200 = 0) always beats a side-street place
    // 80 m away (score = 80).
    forwardBiasMeters: number;
    // Angular threshold (degrees) beyond which a place is considered
    // "off-axis". Places past this threshold get an additional flat penalty
    // so they become a genuine last resort rather than just slightly worse.
    offAxisPenaltyDeg: number;
    // Flat score penalty (metres) added to any place that is more than
    // offAxisPenaltyDeg off the current heading.
    offAxisPenaltyMeters: number;
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
    corridorMeters: 150,
    forwardBiasMeters: 200,
    offAxisPenaltyDeg: 45,
    offAxisPenaltyMeters: 180,
  },
  dense: {
    refetchMeters: 60,
    cooldownMs: 25 * 1000,
    netScoreFloor: -2,
    // Reduced from 220 m: in dense urban grids a 180 m cap keeps narration
    // focused on the current block and the next, preventing the app from
    // jumping to places several blocks away when closer ones exist.
    maxQueueDistance: 180,
    discoverRadius: 250,
    memoryRadius: 1000,
    minMetersBetweenPicks: 40,
    corridorMeters: 70,
    forwardBiasMeters: 200,
    offAxisPenaltyDeg: 45,
    offAxisPenaltyMeters: 180,
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
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Compute the median of a set of compass bearings (0–360°), handling the
 * 0°/360° wrap correctly by translating all values relative to the first
 * sample before sorting. Returns 0 for an empty array.
 */
function circularMedian(angles: number[]): number {
  if (angles.length === 0) return 0;
  if (angles.length === 1) return angles[0];
  const ref = angles[0];
  const relative = angles
    .map((a) => ((a - ref + 540) % 360) - 180)
    .sort((a, b) => a - b);
  const mid = Math.floor(relative.length / 2);
  const median =
    relative.length % 2 === 0
      ? (relative[mid - 1] + relative[mid]) / 2
      : relative[mid];
  return (ref + median + 360) % 360;
}

// Rolling-buffer size for compass and velocity heading smoothing.
const HEADING_BUFFER_SIZE = 5;
// Maximum angular change between consecutive velocity-derived bearings that is
// accepted into the buffer. Larger jumps are treated as GPS noise and ignored.
const VELOCITY_HEADING_CONSISTENCY_DEG = 60;
// Places arriving from the discover API that are more than this many degrees
// off the user's current heading are deferred — they won't enter the queue
// until a later fetch when the user has turned toward them.
const DISCOVERY_HEADING_FILTER_DEG = 100;

// Metres to project the discover-fetch centre ahead of the user's current
// position in their direction of travel. This front-loads the Overpass result
// set with places the user is approaching, so candidates are in the queue
// well before the user reaches them.
const LOOK_AHEAD_METERS = 150;

// Compute a lat/lng that is `meters` ahead of (lat, lon) along `headingDeg`.
function projectAhead(
  lat: number,
  lon: number,
  headingDeg: number,
  meters: number,
): { latitude: number; longitude: number } {
  const R = 6371000;
  const radLat = (lat * Math.PI) / 180;
  const dLat = (meters * Math.cos((headingDeg * Math.PI) / 180)) / R;
  const dLon =
    (meters * Math.sin((headingDeg * Math.PI) / 180)) / (R * Math.cos(radLat));
  return {
    latitude: lat + (dLat * 180) / Math.PI,
    longitude: lon + (dLon * 180) / Math.PI,
  };
}

export function WalkModeProvider({ children }: { children: React.ReactNode }) {
  const [isWalking, setIsWalking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<WalkPlace[]>([]);
  const [narratedIds, setNarratedIds] = useState<Map<string, number>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<WalkStats>({
    startTime: 0,
    placesNarrated: 0,
    distanceWalked: 0,
  });
  const [density, setDensityState] = useState<WalkDensity>("dense");
  const [currentNarrationPlace, setCurrentNarrationPlace] =
    useState<WalkPlace | null>(null);
  const [isReplay, setIsReplay] = useState(false);
  // Auto-clear timer for the "Replay" badge so it disappears after a few
  // seconds and doesn't clutter the Now Playing card.
  const replayBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [enabledBuildingGroups, setEnabledBuildingGroupsState] = useState<
    Set<BuildingGroupKey>
  >(new Set());
  const enabledBuildingGroupsRef = useRef<Set<BuildingGroupKey>>(new Set());
  // Server-fetched heading-bias overrides. Null until the walk-config
  // endpoint responds; the DENSITY_CONFIG defaults are used as fallback.
  const walkConfigOverridesRef = useRef<{
    forwardBiasMeters: number;
    offAxisPenaltyDeg: number;
    offAxisPenaltyMeters: number;
  } | null>(null);

  const setEnabledBuildingGroups = useCallback(
    (groups: Set<BuildingGroupKey>) => {
      enabledBuildingGroupsRef.current = groups;
      setEnabledBuildingGroupsState(groups);
      // Reset the fetch anchor so the next GPS tick re-fetches with the new prefs.
      lastFetchRef.current = null;
    },
    [],
  );

  const { localeRef } = useLocale();
  const narration = useNarration();
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const headingWatchRef = useRef<Location.LocationSubscription | null>(null);
  const nowPlayingUnsubRef = useRef<(() => void) | null>(null);
  // narration is recreated on each render; stash the latest in a ref so the
  // remote command listener (registered once at startWalk) drives the live one.
  const narrationRef = useRef(narration);
  useEffect(() => {
    narrationRef.current = narration;
  }, [narration]);
  const lastFetchRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );
  const prevLocationRef = useRef<{
    latitude: number;
    longitude: number;
    ts: number;
  } | null>(null);
  // Device compass heading from the magnetometer, when available.
  const deviceHeadingRef = useRef<number | null>(null);
  // Rolling buffer of recent compass readings for median smoothing.
  const compassHeadingBufferRef = useRef<number[]>([]);
  // Velocity-derived heading, as a fallback when the compass isn't available.
  const velocityHeadingRef = useRef<number | null>(null);
  // Rolling buffer of recent velocity-derived bearings for median smoothing.
  const velocityHeadingBufferRef = useRef<number[]>([]);
  const fetchingRef = useRef(false);
  const narratedIdsRef = useRef<Map<string, number>>(new Map());
  const placesRef = useRef<WalkPlace[]>([]);
  const lastNarrationEndRef = useRef<number>(0);
  // Where the user was when the last narration ended, so we can require them
  // to physically walk a minimum distance before picking the next story.
  const lastNarrationEndLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const isSpeakingRef = useRef(false);
  // The place whose narration is currently queued or playing. Used to thread
  // the place's photo into the iOS Now Playing widget so the lock-screen pill
  // shows artwork that matches the spoken story.
  const currentNarrationPlaceRef = useRef<WalkPlace | null>(null);
  const densityRef = useRef<WalkDensity>("sparse");
  const isWalkingRef = useRef(false);
  // Prevents double-tapping "Start Walking" from launching two concurrent
  // setup flows. Set to true the moment startWalk begins and cleared when
  // the walk is fully running or if it fails.
  const isStartingRef = useRef(false);
  // Rolling pace samples: each entry is (timestamp, meters travelled since
  // the previous sample). Pruned to the last PACE_WINDOW_MS on every update.
  const paceSamplesRef = useRef<{ ts: number; meters: number }[]>([]);
  // When the user's pace first dropped below SLOW_PACE_MPS. Reset whenever
  // they speed back up. Used to require sustained slowness before promoting.
  const slowSinceRef = useRef<number | null>(null);
  // Until this timestamp, auto-density is suspended because the user just
  // made an explicit choice from the UI.
  const manualOverrideUntilRef = useRef<number>(0);
  // Narration pipeline: after enqueuing place N, the app immediately fetches
  // the AI narration for the best next candidate (N+1) in the background.
  // When place N finishes and the movement gate clears, the pre-fetched text
  // is used instantly instead of waiting for another round-trip.
  // A pending narration payload for the next place. On native this normally
  // holds a pre-rendered MP3 file URI (so playback starts the instant the
  // current narration finishes). On web — and as a graceful fallback when the
  // audio endpoint failed — it can also hold raw narration text.
  const prefetchedNarrationRef = useRef<PrefetchEntry<WalkPlace> | null>(null);
  // Ref to the latest prefetchNext callback — same ref-wrapping pattern as
  // maybeNarrateRef, so fetchNarration can call it without being listed as a
  // dependency (avoiding stale-closure re-creation on every location change).
  const prefetchNextRef = useRef<(() => void) | null>(null);
  // Tracks which place ID is currently being pre-fetched, so repeated calls
  // to prefetchNext before the first resolves don't issue parallel duplicates.
  const prefetchInFlightRef = useRef<string | null>(null);
  // Short-window holding pen for prefetched payloads that would otherwise be
  // discarded (because pickNext now favours a different candidate).  If the
  // queue re-picks the same place within the TTL — common when a brief skip
  // is followed by the cooldown re-promoting the original candidate — we
  // replay the cached audio instantly instead of re-fetching from scratch.
  // Entries that age out are cleaned up by the pool's TTL timer so we never
  // leak temp files.
  // Telemetry on the stale pool: each replay means the 30s TTL saved a
  // round-trip; each eviction means an entry aged out unused. The
  // replay/eviction ratio over time tells us whether the TTL is too short
  // (lots of evictions, few replays — re-picks happen later than 30s) or
  // too long (lots of replays clustered near the TTL ceiling).
  // Lazy-initialised: createStalePrefetchPool() spins up timers and an LRU
  // map that are only useful once a walk is actually running. Doing it inline
  // at provider mount adds work to every cold start, including launches where
  // the user never goes near Walk Mode. Initialise on first read instead.
  const stalePrefetchPoolRef = useRef<StalePrefetchPool<WalkPlace> | null>(
    null,
  );
  const getStalePrefetchPool = useCallback((): StalePrefetchPool<WalkPlace> => {
    if (!stalePrefetchPoolRef.current) {
      stalePrefetchPoolRef.current = createStalePrefetchPool<WalkPlace>({
        onReplay: ({ placeId, ageMs }) => {
          addWalkBreadcrumb("narration_cache_replay", { placeId, ageMs });
        },
        onEvict: ({ placeId, ageMs }) => {
          addWalkBreadcrumb("narration_cache_evict", { placeId, ageMs });
        },
      });
    }
    return stalePrefetchPoolRef.current;
  }, []);
  // Holds the stop() function returned by installSessionCallback for the current
  // walk session. Calling stop() removes the callback via CAS inside
  // walkSessionManager, so a delayed stopWalk from an old session never
  // ghost-clears a new session's GPS handler.
  const walkSessionCallbackRef = useRef<{ stop: () => void } | null>(null);

  // Per-walk prefetch pipeline counters. The ref carries the live mutable
  // counts so repeated emits don't trigger React re-renders; the state
  // mirror is what the dev overlay subscribes to (updated via a microtask
  // batch on every emit so we don't render-storm during a burst).
  const prefetchCountersRef = useRef<PrefetchCounters>(emptyPrefetchCounters());
  const [prefetchStats, setPrefetchStats] = useState<PrefetchCounters>(
    emptyPrefetchCounters(),
  );
  const prefetchStatsFlushQueuedRef = useRef(false);

  // Persisted opt-in toggle for the prefetch stats footer counter. Hydrated
  // from AsyncStorage on mount so the user's last choice survives a relaunch.
  // We start off so the UI never flashes the counter for users who never
  // enabled it; the hydrate effect flips it on if the stored value is "1".
  const [showPrefetchStats, setShowPrefetchStatsState] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getStartupValue(STARTUP_KEYS.showPrefetchStats).then((value) => {
      if (cancelled) return;
      if (value === "1") setShowPrefetchStatsState(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const setShowPrefetchStats = useCallback((enabled: boolean) => {
    setShowPrefetchStatsState(enabled);
    void setStartupValue(STARTUP_KEYS.showPrefetchStats, enabled ? "1" : "0");
  }, []);

  const handlePrefetchEvent = useCallback((event: PrefetchEvent) => {
    prefetchCountersRef.current[event] += 1;
    trackPrefetchEvent(event);
    if (!prefetchStatsFlushQueuedRef.current) {
      prefetchStatsFlushQueuedRef.current = true;
      // Coalesce bursts (e.g. rapid GPS ticks firing DEDUPE) into one render.
      Promise.resolve().then(() => {
        prefetchStatsFlushQueuedRef.current = false;
        setPrefetchStats({ ...prefetchCountersRef.current });
      });
    }
  }, []);

  const applyDensity = useCallback((d: WalkDensity) => {
    if (densityRef.current === d) return;
    densityRef.current = d;
    setDensityState(d);
  }, []);

  const setDensity = useCallback(
    (d: WalkDensity) => {
      // A manual pick wins for a few minutes so auto-switching doesn't undo it.
      manualOverrideUntilRef.current = Date.now() + MANUAL_OVERRIDE_MS;
      slowSinceRef.current = null;
      applyDensity(d);
    },
    [applyDensity],
  );

  // Track narration speaking state in a ref so the loop can react synchronously.
  useEffect(() => {
    const wasSpeaking = isSpeakingRef.current;
    isSpeakingRef.current = narration.isSpeaking;
    if (wasSpeaking && !narration.isSpeaking) {
      lastNarrationEndRef.current = Date.now();
      // Snapshot location at narration end so the next pick must be earned
      // by walking minMetersBetweenPicks from this spot.
      lastNarrationEndLocationRef.current = currentLocation
        ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }
        : null;
      // Drop the artwork association so the next idle widget update doesn't
      // keep showing a photo from a place we've already moved past.
      currentNarrationPlaceRef.current = null;
      setCurrentNarrationPlace(null);
      // Clear the "Replay" badge as soon as the cached narration ends so it
      // doesn't carry over to the next story.
      if (replayBadgeTimerRef.current) {
        clearTimeout(replayBadgeTimerRef.current);
        replayBadgeTimerRef.current = null;
      }
      setIsReplay(false);
    }
  }, [narration.isSpeaking, currentLocation]);

  // Keep Sentry scope up-to-date with walk state so every crash report carries
  // a snapshot of what was happening: whether the user was walking, which place
  // was being narrated, and how many places are in the queue.
  // PII-safe: only opaque IDs and counts, no coordinates or place names.
  useEffect(() => {
    setWalkScope({
      isWalking,
      currentPlaceId: currentNarrationPlace?.id ?? null,
      placeCount: nearbyPlaces.length,
      narrationCount: narratedIds.size,
    });
  }, [isWalking, currentNarrationPlace, nearbyPlaces.length, narratedIds.size]);

  // Mirror narration state into the iOS Now Playing widget so the lock screen
  // shows "Urban Explorer — <place>" with working pause/play/skip controls.
  // No-op on web/Android (the native module is iOS-only).
  useEffect(() => {
    if (!isWalking) return;
    // Guard: stopWalk sets isWalkingRef.current = false synchronously before
    // any async work and before NowPlaying.clear(). If this effect fires late
    // (React batched the narration state change with the stop), we must not
    // re-set the widget after the walk has been torn down.
    if (!isWalkingRef.current) return;
    if (narration.isSpeaking && narration.currentPlace) {
      NowPlaying.setNowPlaying(
        narration.currentPlace,
        "Urban Explorer",
        narration.isPaused,
        currentNarrationPlaceRef.current?.photoUrl ?? null,
      );
    } else {
      // Between stories the audio session is idle but the walk continues —
      // keep the widget visible with a generic "listening" label so the user
      // still sees Urban Explorer is the active audio app. No artwork URL
      // here means the native side falls back to the app icon.
      NowPlaying.setNowPlaying(
        "Listening for nearby places",
        "Urban Explorer",
        true,
        null,
      );
    }
  }, [
    isWalking,
    narration.isSpeaking,
    narration.isPaused,
    narration.currentPlace,
  ]);

  const cachedAddressHintRef = useRef<string>("");

  const fetchNearbyPlaces = useCallback(
    async (latitude: number, longitude: number) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      setIsLoading(true);
      try {
        const cfg = DENSITY_CONFIG[densityRef.current];
        // Critical path: hit /discover IMMEDIATELY with lat/lng — never block on
        // reverse-geocode. Use any cached addressHint from a previous tick if we
        // happen to have one, but never wait.
        // Project the discover fetch centre ahead of the user in their direction
        // of travel. This front-loads the Overpass result set with places the
        // user is about to walk toward, so candidates are ready in the queue
        // well before the user reaches them. Fall back to GPS position when no
        // heading is available (first fix, standing still, etc.).
        const fetchHeading =
          deviceHeadingRef.current ?? velocityHeadingRef.current;
        const fetchCenter =
          fetchHeading !== null
            ? projectAhead(latitude, longitude, fetchHeading, LOOK_AHEAD_METERS)
            : { latitude, longitude };

        const body: Record<string, unknown> = {
          latitude: fetchCenter.latitude,
          longitude: fetchCenter.longitude,
          radius: cfg.discoverRadius,
        };
        if (cachedAddressHintRef.current)
          body.addressHint = cachedAddressHintRef.current;
        const includedTypes = groupKeysToIncludedTypes(
          enabledBuildingGroupsRef.current,
        );
        if (includedTypes.length > 0) body.includeBuildingTypes = includedTypes;

        // Kick off a non-blocking reverse-geocode for the NEXT fetch to use.
        Location.reverseGeocodeAsync({ latitude, longitude })
          .then((geocoded) => {
            if (geocoded.length > 0) {
              const g = geocoded[0];
              const parts = [
                g.streetNumber,
                g.street,
                g.district,
                g.subregion,
                g.city,
              ].filter(Boolean);
              cachedAddressHintRef.current = parts.join(", ");
            }
          })
          .catch(() => {});

        const discoverAbort = new AbortController();
        const discoverTimeout = setTimeout(() => discoverAbort.abort(), 15_000);
        const res = await fetch(`${API_BASE}/api/explore/discover`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeaders()),
          },
          body: JSON.stringify(body),
          signal: discoverAbort.signal,
        });
        clearTimeout(discoverTimeout);
        if (res.ok) {
          const data = await res.json();
          // Guard: if stopWalk was called while the fetch was in-flight, discard
          // results so we don't repopulate the places list or update state after
          // the walk has ended.
          if (!isWalkingRef.current) return;
          if (Array.isArray(data?.places)) {
            // Merge with existing — dedupe by id, then evict anything farther
            // than memoryRadius from the user's current location. Without the
            // eviction the queue grows unbounded over a long walk, slowing
            // pickNext and piling stale markers across the whole neighborhood.
            const allIncoming = data.places as WalkPlace[];
            // Forward filter: only accept newly discovered places that are
            // within DISCOVERY_HEADING_FILTER_DEG (±100°) of the user's
            // current heading. Places behind or far to the side are skipped on
            // this fetch — they'll be picked up naturally once the user turns
            // toward them. Existing queue entries are not retroactively evicted.
            // When heading is unknown the filter is skipped entirely.
            const currentHeading =
              deviceHeadingRef.current ?? velocityHeadingRef.current;
            const incoming =
              currentHeading !== null
                ? allIncoming.filter((p) => {
                    const bearing = bearingDeg(
                      latitude,
                      longitude,
                      p.latitude,
                      p.longitude,
                    );
                    return (
                      angularDiff(currentHeading, bearing) <=
                      DISCOVERY_HEADING_FILTER_DEG
                    );
                  })
                : allIncoming;
            if (__DEV__ && currentHeading !== null) {
              const filtered = allIncoming.length - incoming.length;
              if (filtered > 0) {
                addWalkBreadcrumb("discovery_heading_filter", {
                  accepted: incoming.length,
                  filtered,
                  heading: Math.round(currentHeading),
                });
              }
            }
            const map = new Map<string, WalkPlace>();
            for (const p of placesRef.current) map.set(p.id, p);
            for (const p of incoming) map.set(p.id, p);
            const merged: WalkPlace[] = [];
            for (const p of map.values()) {
              const d = haversineMeters(
                latitude,
                longitude,
                p.latitude,
                p.longitude,
              );
              if (d <= cfg.memoryRadius) merged.push(p);
            }
            placesRef.current = merged;
            setNearbyPlaces(merged);
            lastFetchRef.current = { latitude, longitude };
          }
        }
      } catch (err) {
        addWalkBreadcrumb(
          "fetchNearbyPlaces error",
          {
            errorType: err instanceof Error ? err.constructor.name : typeof err,
          },
          "error",
        );
      } finally {
        fetchingRef.current = false;
        setIsLoading(false);
      }
    },
    [],
  );

  const fetchPlacesAlongRoute = useCallback(
    async (geometry: number[][], maxPlaces?: number): Promise<WalkPlace[]> => {
      const cfg = DENSITY_CONFIG[densityRef.current];
      try {
        const res = await fetch(`${API_BASE}/api/explore/places-along-route`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeaders()),
          },
          body: JSON.stringify({
            geometry,
            ...(maxPlaces !== undefined ? { maxPlaces } : {}),
            corridorMeters: cfg.corridorMeters,
          }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.places) ? (data.places as WalkPlace[]) : [];
      } catch {
        return [];
      }
    },
    [],
  );

  // Enqueue a narration and update all associated state. Accepts a payload
  // produced by fetchNarrationPayload — either a pre-rendered MP3 file (the
  // natural-voice path on native) or plain text (web, or native fallback when
  // the audio endpoint failed).
  const enqueueNarration = useCallback(
    (place: WalkPlace, payload: NarrationPayload) => {
      currentNarrationPlaceRef.current = place;
      setCurrentNarrationPlace(place);
      if (payload.kind === "audio") {
        narration.enqueueAudio(
          place.id,
          payload.audioUri,
          place.name,
          payload.cleanup,
        );
      } else {
        narration.enqueue(place.id, payload.text, place.name);
      }
      addWalkBreadcrumb("narration fetched", {
        placeId: place.id,
        kind: payload.kind,
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setStats((prev) => ({
        ...prev,
        placesNarrated: prev.placesNarrated + 1,
      }));
    },
    [narration],
  );

  // Single source of truth for "go fetch a narration for this place". On web
  // (and as a fallback when the audio endpoint errors) returns text. On native
  // returns a path to a freshly-written MP3 file plus a cleanup that deletes
  // the file once playback is done.  The actual fetch/write logic lives in
  // lib/fetchNarrationPayload.ts so it can be tested without React.
  const fetchNarrationPayload = useCallback(
    (place: WalkPlace): Promise<NarrationPayload | null> => {
      return fetchNarrationPayloadUtil(place, {
        apiBase: API_BASE,
        isExpoGo: IS_EXPO_GO,
      });
    },
    [],
  );

  const fetchNarration = useCallback(
    async (place: WalkPlace) => {
      // --- Narration pipeline: fast path ---
      // Check if we already pre-fetched the narration for this place while the
      // previous story was playing. If so, enqueue it immediately (no round-trip)
      // and then start pre-fetching the one after that. consumePrefetchedNarration
      // also runs the stale-cleanup when the cached entry is for a different place.
      const prefetched = prefetchedNarrationRef.current;
      prefetchedNarrationRef.current = null; // always consume / clear the cache
      const lookup = consumePrefetchedNarration(
        prefetched,
        place.id,
        getStalePrefetchPool(),
        handlePrefetchEvent,
      );
      if (lookup.kind === "hit") {
        if (__DEV__) {
          console.log(
            `[fetchNarration] cache HIT (${lookup.source}) for "${place.name}" — zero-latency enqueue (${lookup.entry.payload.kind})`,
          );
        }
        // Only the "staleReplay" path is a genuine replay (a place that was
        // displaced from the live slot and revived from the stale pool because
        // the user re-picked it within the TTL). A "live" hit is the normal
        // first-time narration fast path — the prefetch landed before the user
        // finished the previous story — and must NOT show the Replay badge.
        if (lookup.source === "staleReplay") {
          // Auto-clear after a few seconds so the badge doesn't linger.
          if (replayBadgeTimerRef.current) {
            clearTimeout(replayBadgeTimerRef.current);
          }
          setIsReplay(true);
          replayBadgeTimerRef.current = setTimeout(() => {
            setIsReplay(false);
            replayBadgeTimerRef.current = null;
          }, 4000);
        } else if (replayBadgeTimerRef.current) {
          // Live first-time narration: drop any stale badge that was still up.
          clearTimeout(replayBadgeTimerRef.current);
          replayBadgeTimerRef.current = null;
          setIsReplay(false);
        }
        enqueueNarration(place, lookup.entry.payload);
        // Keep the pipeline going: pre-fetch the next candidate.
        prefetchNextRef.current?.();
        return;
      }

      // --- Normal path (cache miss or stale) ---
      const payload = await fetchNarrationPayload(place);
      if (!payload) return;
      // Guard: if stopWalk was called while the fetch was in-flight (up to 15 s),
      // discard the payload and run its cleanup so we never play audio or update
      // stats after the walk has ended.
      if (!isWalkingRef.current) {
        if (payload.kind === "audio") {
          try {
            payload.cleanup?.();
          } catch {}
        }
        return;
      }
      // First-time narration: ensure any stale "Replay" badge from the previous
      // story is gone before we kick off the new one.
      if (replayBadgeTimerRef.current) {
        clearTimeout(replayBadgeTimerRef.current);
        replayBadgeTimerRef.current = null;
      }
      setIsReplay(false);
      // Remember which place is now driving the lock-screen widget so the
      // artwork we send matches the story being spoken.
      enqueueNarration(place, payload);
      // Start pre-fetching the next candidate so it's ready when this
      // narration finishes and the movement gate clears.
      prefetchNextRef.current?.();
    },
    [
      enqueueNarration,
      fetchNarrationPayload,
      getStalePrefetchPool,
      handlePrefetchEvent,
    ],
  );

  /**
   * Pick the best place to narrate next, given current location, heading, density.
   * Returns null if nothing qualifies right now.
   */
  const pickNext = useCallback(
    (overrideLoc?: {
      latitude: number;
      longitude: number;
    }): WalkPlace | null => {
      const loc = overrideLoc ?? currentLocation;
      if (!loc) return null;
      const cfg = DENSITY_CONFIG[densityRef.current];

      // Movement gating: require the user to walk a minimum distance from where
      // the last narration ended before queueing the next one. If we have no
      // anchor yet (first pick of the walk), this gate is a no-op.
      const anchor = lastNarrationEndLocationRef.current;
      if (anchor) {
        const movedSinceLast = haversineMeters(
          anchor.latitude,
          anchor.longitude,
          loc.latitude,
          loc.longitude,
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
        const dist = haversineMeters(
          loc.latitude,
          loc.longitude,
          p.latitude,
          p.longitude,
        );
        if (dist > cfg.maxQueueDistance) continue;
        const net = p.netScore ?? 0;
        if (net < cfg.netScoreFloor) continue;

        // Scoring: lower is better. Distance is the base.
        let score = dist;
        // Heading-aware bias: strongly favour places in the direction of travel.
        //   forwardBiasMeters (200 m default) — cosine term gives the full bonus
        //   when the place is straight ahead (diff=0) and 0 bonus at 90°. At 180°
        //   it becomes a penalty. This overwhelms the Manhattan side-street effect:
        //   a place 200 m ahead scores 200−200=0 vs 80 m perpendicular scoring 80.
        //
        //   offAxisPenaltyDeg / offAxisPenaltyMeters — additional flat penalty for
        //   places more than ~45° off-heading, making them a genuine last resort
        //   without hard-excluding them (queue never goes empty in bad GPS).
        if (heading !== null) {
          const overrides = walkConfigOverridesRef.current;
          const fwdBias = overrides?.forwardBiasMeters ?? cfg.forwardBiasMeters;
          const penaltyDeg =
            overrides?.offAxisPenaltyDeg ?? cfg.offAxisPenaltyDeg;
          const penaltyMeters =
            overrides?.offAxisPenaltyMeters ?? cfg.offAxisPenaltyMeters;
          const placeBearing = bearingDeg(
            loc.latitude,
            loc.longitude,
            p.latitude,
            p.longitude,
          );
          const diff = angularDiff(heading, placeBearing);
          score -= fwdBias * Math.cos((diff * Math.PI) / 180);
          if (diff > penaltyDeg) {
            score += penaltyMeters;
          }
        }
        // Rating bonus: each net upvote shaves up to 20m, capped at 80m.
        score -= Math.min(80, Math.max(-40, net * 20));

        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }

      if (__DEV__ && best) {
        const placeBearing =
          heading !== null
            ? bearingDeg(
                loc.latitude,
                loc.longitude,
                best.latitude,
                best.longitude,
              )
            : null;
        const diff =
          heading !== null && placeBearing !== null
            ? angularDiff(heading, placeBearing)
            : null;
        console.log(
          `[pickNext] selected="${best.name}" dist=${Math.round(haversineMeters(loc.latitude, loc.longitude, best.latitude, best.longitude))}m` +
            (diff !== null
              ? ` headingDiff=${Math.round(diff)}°`
              : " (no heading)") +
            ` finalScore=${Math.round(bestScore)}`,
        );
      }

      return best;
    },
    [currentLocation],
  );

  // Pre-fetch the narration for the next best candidate while the current
  // story is playing. Runs fire-and-forget in the background; failures are
  // silently ignored so the normal fetchNarration path always acts as a safe
  // fallback. By the time the user's movement gate clears for the next story,
  // the text is already waiting in prefetchedNarrationRef.
  //
  // Design notes:
  //   • place N is already in narratedIdsRef when this runs (marked by
  //     maybeNarrate before fetchNarration was called), so pickNext() will
  //     naturally skip N and return N+1.
  //   • No movement-gate problem: the gate checks distance since the PREVIOUS
  //     narration end, which was already cleared for the current pick.
  //   • We skip the pre-fetch if the cache already holds the right candidate
  //     to avoid redundant API calls on every location tick.
  const prefetchNext = useCallback(() => {
    runPrefetchCycle({
      isWalkingRef,
      narratedIdsRef,
      prefetchedNarrationRef,
      prefetchInFlightRef,
      placesRef,
      pickNext,
      fetchPayload: fetchNarrationPayload,
      stalePool: getStalePrefetchPool(),
      onEvent: handlePrefetchEvent,
    });
  }, [
    pickNext,
    fetchNarrationPayload,
    getStalePrefetchPool,
    handlePrefetchEvent,
  ]);
  useEffect(() => {
    prefetchNextRef.current = prefetchNext;
  }, [prefetchNext]);

  const handleLocationUpdate = useCallback(
    (location: Location.LocationObject) => {
      const { latitude, longitude } = location.coords;
      const now = Date.now();
      setCurrentLocation({ latitude, longitude });

      if (prevLocationRef.current) {
        const prev = prevLocationRef.current;
        const dist = haversineMeters(
          prev.latitude,
          prev.longitude,
          latitude,
          longitude,
        );
        if (dist < 200) {
          setStats((s) => ({ ...s, distanceWalked: s.distanceWalked + dist }));
          // Feed the rolling pace buffer with this segment. Skip giant jumps
          // (>200m between fixes likely means a teleport / GPS glitch).
          paceSamplesRef.current.push({ ts: now, meters: dist });
        }
        // Compute heading from velocity: only trust if moved enough recently.
        // Threshold raised to 12 m (from 8 m) to reduce heading flips from
        // brief GPS drift. A consistency gate rejects new bearings that differ
        // from the last accepted velocity heading by more than
        // VELOCITY_HEADING_CONSISTENCY_DEG (60°), filtering out single-fix
        // noise without discarding genuine sharp turns (which accumulate
        // across multiple fixes and pass the gate on the next consistent tick).
        if (dist >= 12 && now - prev.ts < 30_000) {
          const newBearing = bearingDeg(
            prev.latitude,
            prev.longitude,
            latitude,
            longitude,
          );
          const lastVelocityHeading = velocityHeadingRef.current;
          const isConsistent =
            lastVelocityHeading === null ||
            angularDiff(newBearing, lastVelocityHeading) <=
              VELOCITY_HEADING_CONSISTENCY_DEG;
          if (isConsistent) {
            const buf = velocityHeadingBufferRef.current;
            buf.push(newBearing);
            if (buf.length > HEADING_BUFFER_SIZE) buf.shift();
            velocityHeadingRef.current = circularMedian(buf);
          }
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
      if (
        now >= manualOverrideUntilRef.current &&
        paceSamplesRef.current.length > 0
      ) {
        const oldest = paceSamplesRef.current[0].ts;
        const spanMs = now - oldest;
        if (spanMs >= PACE_MIN_WINDOW_MS) {
          const totalMeters = paceSamplesRef.current.reduce(
            (a, s) => a + s.meters,
            0,
          );
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
    [applyDensity, fetchNearbyPlaces],
  );

  // Encapsulates the cooldown / speaking / pick / enqueue gating so it can run
  // from both the setInterval tick (foreground) and the GPS callback
  // (background). Stored in a ref so handleLocationUpdate doesn't depend on
  // pickNext/fetchNarration in its useCallback deps.
  const maybeNarrateRef = useRef<
    ((loc?: { latitude: number; longitude: number }) => void) | null
  >(null);
  const maybeNarrate = useCallback(
    (loc?: { latitude: number; longitude: number }) => {
      if (!isWalkingRef.current) {
        if (__DEV__) console.log("[maybeNarrate] BLOCKED: not walking");
        return;
      }
      if (isSpeakingRef.current) {
        if (__DEV__) console.log("[maybeNarrate] BLOCKED: already speaking");
        return;
      }
      const cfg = DENSITY_CONFIG[densityRef.current];
      const elapsed = Date.now() - lastNarrationEndRef.current;
      if (elapsed < cfg.cooldownMs) {
        if (__DEV__)
          console.log(
            `[maybeNarrate] BLOCKED: cooldown ${Math.round((cfg.cooldownMs - elapsed) / 1000)}s remaining (density=${densityRef.current})`,
          );
        return;
      }
      const next = pickNext(loc);
      if (!next) {
        if (__DEV__)
          console.log(
            `[maybeNarrate] BLOCKED: pickNext=null (${placesRef.current.length} places, ${narratedIdsRef.current.size} narrated)`,
          );
        return;
      }
      if (__DEV__)
        console.log(
          `[maybeNarrate] PASSED — fetching narration for "${next.name}"`,
        );
      narratedIdsRef.current.set(next.id, Date.now());
      setNarratedIds(new Map(narratedIdsRef.current));
      addWalkBreadcrumb("place visited", { placeId: next.id });
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

  const startWalk = useCallback(
    async (initialPlaces?: WalkPlace[]): Promise<boolean> => {
      // Guard against double-tap or re-entry before the walk is fully set up.
      if (isWalkingRef.current || isStartingRef.current) return false;
      isStartingRef.current = true;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          isStartingRef.current = false;
          return false;
        }

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
        addWalkBreadcrumb("walk started");

        // Fetch server-side heading-bias config in the background. Reset first so
        // any stale values from a previous walk are cleared. The fetch races
        // against a 5 s wall-clock so it never blocks walk startup; if it wins
        // before pickNext runs the server values override the hard-coded defaults.
        walkConfigOverridesRef.current = null;
        (async () => {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            let res: Response;
            try {
              res = await fetch(`${API_BASE}/api/explore/walk-config`, {
                signal: controller.signal,
                headers: {
                  "Content-Type": "application/json",
                  ...(await authHeaders()),
                },
              });
            } finally {
              clearTimeout(timer);
            }
            if (res.ok) {
              const data = (await res.json()) as {
                forwardBiasMeters?: unknown;
                offAxisPenaltyDeg?: unknown;
                offAxisPenaltyMeters?: unknown;
              };
              const fwd =
                typeof data.forwardBiasMeters === "number"
                  ? data.forwardBiasMeters
                  : null;
              const deg =
                typeof data.offAxisPenaltyDeg === "number"
                  ? data.offAxisPenaltyDeg
                  : null;
              const m =
                typeof data.offAxisPenaltyMeters === "number"
                  ? data.offAxisPenaltyMeters
                  : null;
              if (fwd !== null && deg !== null && m !== null) {
                walkConfigOverridesRef.current = {
                  forwardBiasMeters: fwd,
                  offAxisPenaltyDeg: deg,
                  offAxisPenaltyMeters: m,
                };
              }
            }
          } catch {
            // Best-effort — DENSITY_CONFIG defaults are used when fetch fails.
          }
        })();

        // Density is per-walk: every new walk starts at Dense (more results) as the
        // default, so the user gets immediate story density without needing to configure
        // anything. Auto-switching will move it to Sparse if they walk fast.
        densityRef.current = "dense";
        setDensityState("dense");
        setStats({
          startTime: Date.now(),
          placesNarrated: 0,
          distanceWalked: 0,
        });
        setNarratedIds(new Map());
        narratedIdsRef.current = new Map();
        // Seed pre-fetched places so narration can fire as soon as GPS arrives,
        // without waiting for the first GPS-driven discover call to complete.
        placesRef.current = initialPlaces?.length ? [...initialPlaces] : [];
        setNearbyPlaces(initialPlaces?.length ? [...initialPlaces] : []);
        lastFetchRef.current = null;
        prevLocationRef.current = null;
        deviceHeadingRef.current = null;
        velocityHeadingRef.current = null;
        cachedAddressHintRef.current = "";
        lastNarrationEndLocationRef.current = null;
        paceSamplesRef.current = [];
        slowSinceRef.current = null;
        manualOverrideUntilRef.current = 0;
        // Drop any pending prefetch and delete its temp file if we own one.
        const stalePrefetch = prefetchedNarrationRef.current;
        if (stalePrefetch && stalePrefetch.payload.kind === "audio") {
          try {
            stalePrefetch.payload.cleanup?.();
          } catch {}
        }
        prefetchedNarrationRef.current = null;
        prefetchInFlightRef.current = null;
        // Drain the stale-replay pool too so a previous walk's parked entries
        // don't leak temp files or accidentally replay across walks. The pool
        // is lazy-allocated, so on the very first walk this is a no-op.
        if (stalePrefetchPoolRef.current) {
          disposeStalePrefetchPool(stalePrefetchPoolRef.current);
        }
        // Reset prefetch telemetry so each walk's counters start at zero.
        prefetchCountersRef.current = emptyPrefetchCounters();
        setPrefetchStats(emptyPrefetchCounters());
        // Start cooldown so we don't fire instantly before the user has even moved.
        // Use the largest cooldown across all densities so the 5-second initial
        // wait is preserved even if auto-density switches to a stricter tier right
        // after walk start (e.g. dense → sparse when walking at normal pace).
        const maxCooldownMs = Math.max(
          ...Object.values(DENSITY_CONFIG).map((c) => c.cooldownMs),
        );
        lastNarrationEndRef.current = Date.now() - maxCooldownMs + 5000;

        if (Platform.OS === "web") {
          try {
            unlockWebSpeech();
          } catch {}
        }

        // Bind lock-screen / Control Center commands to the narration queue.
        if (nowPlayingUnsubRef.current) {
          nowPlayingUnsubRef.current();
          nowPlayingUnsubRef.current = null;
        }
        nowPlayingUnsubRef.current = NowPlaying.addRemoteCommandListener(
          (cmd) => {
            const n = narrationRef.current;
            if (cmd === "play") n.resume();
            else if (cmd === "pause") {
              if (n.isPaused) n.resume();
              else n.pause();
            } else if (cmd === "next") n.skip();
          },
        );
        // Seed the widget right away so the user sees Urban Explorer claim the
        // Now Playing slot the moment Walk Mode starts, even before the first
        // narration begins.
        NowPlaying.setNowPlaying(
          "Listening for nearby places",
          "Urban Explorer",
          true,
          null,
        );

        const accuracy =
          Platform.OS === "web"
            ? Location.Accuracy.High
            : Location.Accuracy.BestForNavigation;

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
          // Install this session's GPS callback via walkSessionManager.
          // installSessionCallback returns a stop() that removes the pointer via
          // CAS — a late-arriving stopWalk from a previous session will not clear
          // a callback that already belongs to the new walk.
          const session = installSessionCallback(handleLocationUpdate);
          walkSessionCallbackRef.current = session;
          try {
            const alreadyRunning =
              await Location.hasStartedLocationUpdatesAsync(
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
              foregroundService: (() => {
                const strings = getNotificationLocale(localeRef.current);
                return {
                  notificationTitle: strings.notificationTitle,
                  notificationBody: strings.notificationBody,
                  notificationColor: "#1f2937",
                };
              })(),
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
            if (candidate !== null) {
              // Smooth compass readings through a rolling median buffer to
              // reduce noise from metal buildings and electrical interference.
              const buf = compassHeadingBufferRef.current;
              buf.push(candidate);
              if (buf.length > HEADING_BUFFER_SIZE) buf.shift();
              deviceHeadingRef.current = circularMedian(buf);
            }
          });
          headingWatchRef.current = headingSub;
        } catch {}
        return true;
      } finally {
        // Allow startWalk to be called again (e.g. after stopping and
        // restarting, or after an error during setup).
        isStartingRef.current = false;
      }
    },
    [handleLocationUpdate, localeRef],
  );

  const stopWalk = useCallback(() => {
    // executeStopWalkSync enforces the exact stop-ordering that prevents
    // NowPlaying lock-screen widget races (verified by walkModeStress tests):
    //   isWalkingRef=false → nowPlayingUnsub → NowPlaying.clear → narration.stop
    executeStopWalkSync({
      isWalkingRef,
      nowPlayingUnsub: nowPlayingUnsubRef.current,
      nowPlayingClear: NowPlaying.clear,
      narrationStop: narration.stop,
    });
    nowPlayingUnsubRef.current = null;
    setIsWalking(false);
    addWalkBreadcrumb("walk stopped");
    // Tear down the "Replay" badge timer so it can't fire after the walk ends
    // (which would leave the badge briefly visible on the next walk).
    if (replayBadgeTimerRef.current) {
      clearTimeout(replayBadgeTimerRef.current);
      replayBadgeTimerRef.current = null;
    }
    setIsReplay(false);
    // Discard any prefetch that was in-flight or cached when the walk ended.
    // The in-flight guard (isWalkingRef.current check in the async closure) will
    // handle the async case, but also clean up whatever already landed so we
    // don't leave a stale MP3 sitting in the device cache.
    const stalePrefetch = prefetchedNarrationRef.current;
    if (stalePrefetch && stalePrefetch.payload.kind === "audio") {
      try {
        stalePrefetch.payload.cleanup?.();
      } catch {}
    }
    prefetchedNarrationRef.current = null;
    prefetchInFlightRef.current = null;
    // Drain the short-window stale-replay pool too: cancel pending TTL timers
    // and delete every temp file we were holding for possible re-pick replay.
    if (stalePrefetchPoolRef.current) {
      disposeStalePrefetchPool(stalePrefetchPoolRef.current);
    }
    if (watchRef.current) {
      try {
        watchRef.current.remove();
      } catch {}
      watchRef.current = null;
    }
    if (headingWatchRef.current) {
      try {
        headingWatchRef.current.remove();
      } catch {}
      headingWatchRef.current = null;
    }
    if (Platform.OS !== "web") {
      // Tear down the background task so the foreground-service notification
      // disappears and we stop draining battery the moment the walk ends.
      // stop() uses CAS: it only nulls the module-level pointer when it still
      // equals the callback THIS session installed.  A rapid stop-then-start
      // that already installed a new callback is therefore left untouched.
      walkSessionCallbackRef.current?.stop();
      walkSessionCallbackRef.current = null;
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .then((running) => {
          if (running) {
            return Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          }
        })
        .catch(() => {});
    }
  }, [narration]);

  const contextValue = useMemo(
    () => ({
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
      currentNarrationPlace,
      isReplay,
      fetchPlacesAlongRoute,
      enabledBuildingGroups,
      setEnabledBuildingGroups,
      prefetchStats,
      showPrefetchStats,
      setShowPrefetchStats,
    }),
    [
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
      currentNarrationPlace,
      isReplay,
      fetchPlacesAlongRoute,
      enabledBuildingGroups,
      setEnabledBuildingGroups,
      prefetchStats,
      showPrefetchStats,
      setShowPrefetchStats,
    ],
  );

  return (
    <WalkModeContext.Provider value={contextValue}>
      {children}
    </WalkModeContext.Provider>
  );
}

export function useWalkMode() {
  const ctx = useContext(WalkModeContext);
  if (!ctx) throw new Error("useWalkMode must be used within WalkModeProvider");
  return ctx;
}
