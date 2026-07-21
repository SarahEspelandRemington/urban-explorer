import { IS_EXPO_GO } from "@/lib/expoEnv";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
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
import { API_BASE } from "@/lib/apiBase";
import { authHeaders } from "@/lib/apiToken";
import { getLocaleMeta as getNotificationLocale } from "@/lib/i18n";
import { fetchNarrationPayload as fetchNarrationPayloadUtil } from "@/lib/fetchNarrationPayload";
import { buildTileKey, getPlaceCache, setPlaceCache } from "@/lib/placeCache";
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
import {
  evaluateEligibility,
  looksGenericCommercial,
  type EligibilityState,
} from "@/lib/walkEligibility";
import { filterFailureBackoff } from "@/lib/walkFailureBackoff";
import { isLiveFetchStale } from "@/lib/walkFetchSessionGuard";
import {
  recordBlock,
  recordDiscoverResult,
  recordNarrationFetch,
  recordRejection,
  recordSelectionSnapshot,
  resetWalkDiagnostics,
} from "@/lib/walkDiagnostics";
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

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  location: [number, number]; // [latitude, longitude] of the maneuver point
  maneuverType: string;
}

export interface RouteContext {
  steps: RouteStep[];
  geometry?: number[][];
  distanceMeters?: number;
  durationSeconds?: number;
}

// State exposed for the live "next turn" UI on the Walk Mode screen.
export interface NextTurn {
  step: RouteStep;
  index: number; // index into routeSteps
  distanceMeters: number; // straight-line distance from user to maneuver point
}

// Distance threshold (m) at which we speak the turn cue once. The user wanted
// audible cues "interleaved" with the historical narration; firing at ~30 m
// gives a natural lead time for a walking pace (~20 s warning at 1.5 m/s).
const TURN_CUE_DISTANCE_M = 30;
// Once a step has been announced we never re-announce it, even if the user
// briefly walks away and back. The next ahead-of-them step takes over.
//
// We also short-circuit "depart" steps because the planning view already
// shows the starting heading — we don't need to immediately speak it the
// moment the walk starts.

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
  /** Overpass element reference (e.g. 'node/12345678'). Present only on
   *  OSM-anchored Walk Mode discoveries. */
  osmId?: string;
  /** How this place's location was established: osm = Overpass coordinates
   *  (verified), llm = LLM-generated coordinates (legacy path). */
  candidateSource?: "osm" | "llm";
  /** OSM trust classification from discover. Passed through to the detail
   *  endpoint so the detail prompt can ground its response in tag data. */
  trustLevel?: string;
  /** Curated OSM hint tags from discover (e.g. wikidata, denomination,
   *  start_date). Stored in osmHintsCache keyed by osmId. */
  osmTags?: Record<string, string>;
  /** Server-side address↔coordinate coherence check has flagged this place
   *  as a strong-evidence mismatch (e.g. wrong-city hallucination). The
   *  place still appears on the map and in lists, but auto-narration must
   *  skip it. Single-signal "ambiguous" mismatches do NOT set this flag. */
  autoNarrationBlocked?: boolean;
  /** Server-side spatial trust classification for this place. */
  discoveryClass?:
    | "VERIFIED_PLACE"
    | "APPROXIMATE_SITE"
    | "INTERPRETIVE_OVERLAY";
  /** Debug payload from server-side address↔coordinate coherence check.
   *  Always populated when an address was geocoded (regardless of outcome)
   *  so field testers can inspect mismatches in the debug overlay. */
  addressCoherence?: {
    status: "ok" | "ambiguous" | "mismatch" | "geocode_failed";
    reason: string;
    storedLat?: number;
    storedLon?: number;
    geocodedLat?: number;
    geocodedLon?: number;
    mismatchMeters?: number;
    geocodedDistFromUserMeters?: number;
    address?: string;
  };
  /** Server-computed landmark-adjacency fallback, present only when this
   *  place has no real postal address and a qualifying nearby landmark was
   *  found within the adjacency radius. v1 is display-only (phrase); the
   *  target/bearing fields are for future debug-overlay use. */
  orientation?: {
    type: "landmark_adjacent";
    target: { name: string; lat: number; lng: number };
    distanceMeters: number;
    bearingDegrees: number;
    phrase: string;
  };
}

export type WalkDensity = "sparse" | "dense";

interface WalkStats {
  startTime: number;
  placesNarrated: number;
  distanceWalked: number;
}

interface WalkModeContextType {
  isWalking: boolean;
  startWalk: (
    initialPlaces?: WalkPlace[],
    routeContext?: RouteContext,
  ) => Promise<boolean>;
  /**
   * Turn-by-turn steps for the active walk, in order. Empty when the user
   * started a free-roam walk without planning a route.
   */
  routeSteps: RouteStep[];
  /**
   * The next un-passed maneuver, with the live distance from the user. Null
   * when there is no active route, when the user has passed the final step,
   * or before the first GPS fix arrives.
   */
  nextTurn: NextTurn | null;
  stopWalk: () => void;
  currentLocation: { latitude: number; longitude: number } | null;
  /**
   * Set when startWalk's location acquisition hits a failure that is
   * already detected in code but was previously never surfaced to the UI:
   * foreground permission denial, or the 8-second first-fix race timing
   * out/erroring with no GPS fix yet available. Cleared at the start of the
   * next startWalk() attempt and the moment any location update arrives.
   */
  locationError: "permission-denied" | "gps-timeout" | null;
  nearbyPlaces: WalkPlace[];
  narratedIds: Map<string, number>;
  stats: WalkStats;
  narration: ReturnType<typeof useNarration>;
  isLoading: boolean;
  density: WalkDensity;
  setDensity: (d: WalkDensity) => void;
  currentNarrationPlace: WalkPlace | null;
  /**
   * The place the audio engine is currently SPEAKING. Set at the moment
   * playback starts (inside processQueue), null between stories. This is
   * the single authoritative signal for "active story" — use it for the
   * orange dot and Now Playing tap target.
   */
  activeNarrationPlace: WalkPlace | null;
  /**
   * A place that has been enqueued but whose audio has not yet started.
   * Non-null only during the prefetch gap (fetch + queue wait). Null once
   * the audio engine picks it up, and null when nothing is queued.
   */
  queuedNarrationPlace: WalkPlace | null;
  // True for a few seconds when the current narration started from the
  // short-window cache (a place that was just re-picked within the prefetch
  // TTL). UI uses this to show a small "Replay" badge so users know the
  // instant playback is intentional, not a degraded fallback.
  isReplay: boolean;
  fetchPlacesAlongRoute: (
    geometry: number[][],
    maxPlaces?: number,
    corridorOverride?: number,
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
  /**
   * Persisted opt-in for the field-test diagnostic overlay. When on, the
   * Walk Mode screen renders a floating panel with the live selection
   * pipeline state — GPS, heading source, candidates, rejection reasons.
   * Off by default; surfaced under Settings → Developer.
   */
  walkDebugEnabled: boolean;
  setWalkDebugEnabled: (enabled: boolean) => void;
  /**
   * True when the user has physically moved past the place that's currently
   * narrating (>80 m from the location captured at narration start, AND the
   * narration has been running for at least 25 s). Used by the Now Playing
   * pill to surface a "(passed)" suffix without interrupting playback.
   */
  narrationIsPassed: boolean;
  /**
   * Immediately narrate a specific place, bypassing cooldown and scoring.
   * Used by manual pin-tap "Play / Replay" in the walk map.
   */
  playPlace: (place: WalkPlace) => void;
}

const WalkModeContext = createContext<WalkModeContextType | null>(null);

// API_BASE is imported from @/lib/apiBase — single source of truth shared
// with the rest of the mobile app. Always reads EXPO_PUBLIC_API_URL (the
// published autoscale deployment). No dev-domain fallback.

// IS_EXPO_GO is imported from @/lib/expoEnv — single definition for the whole app.

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
    refetchMeters: 50,
    cooldownMs: 75 * 1000,
    netScoreFloor: 0,
    // PIN VISIBILITY vs AUTO-NARRATION:
    //   • Map pins are displayed for all places within memoryRadius (800 m) —
    //     the user can see and manually tap anything in the neighbourhood.
    //   • Auto-narration (pickNext) is gated by maxQueueDistance ONLY.
    //     Nothing beyond this radius plays automatically, regardless of score.
    //
    // Tightened from 120 m to 90 m: one full Manhattan short block (~80 m).
    // Keeps automatic stories to the current block and the very start of the
    // next; adjacent-street pins remain visible but do not auto-play.
    maxQueueDistance: 90,
    // discoverRadius must be ≥ maxQueueDistance + LOOK_AHEAD_METERS (30 m)
    // so newly fetched places are immediately eligible for narration.
    // Expanded from 130 m to 300 m so that OSM-anchor Walk Mode fetches a
    // wide enough candidate pool to cover major landmarks (e.g. Eastern State
    // Penitentiary at ~270 m). maxQueueDistance is unchanged — places only
    // auto-narrate when within 90 m; the larger radius only widens the pool.
    discoverRadius: 300,
    memoryRadius: 800,
    // Reduced from 100 m: the cooldown (75 s) is the primary anti-spam gate;
    // movement should only prevent narrating the exact same spot twice.
    // 40 m ≈ half a Manhattan short block — enough spacing without making
    // the user feel like they have to jog before the next story plays.
    minMetersBetweenPicks: 40,
    corridorMeters: 120,
    // forwardBiasMeters: maximum score reduction (m) for a place straight
    // ahead (diff=0°). The dist/3 cap in pickNext was removed — see comment
    // there. With maxQueueDistance=90 m the "avenue jump" cannot happen
    // because no place beyond 90 m is even considered.
    forwardBiasMeters: 60,
    // Angular threshold beyond which a place is considered "off-axis" and
    // receives the flat offAxisPenaltyMeters penalty on top of the cosine
    // bias. A hard 90° exclusion gate (only when velocity heading is
    // available) sits above this in pickNext so places clearly behind the
    // user never auto-play even if they are within maxQueueDistance.
    offAxisPenaltyDeg: 45,
    // Flat penalty (m) for off-axis places. Raised from 300 m to 500 m so
    // a side-street or behind-the-user place is a decisive last resort and
    // can only win when the queue is completely empty.
    offAxisPenaltyMeters: 500,
  },
  dense: {
    refetchMeters: 50,
    cooldownMs: 25 * 1000,
    netScoreFloor: -2,
    // PIN VISIBILITY vs AUTO-NARRATION:
    //   • Map pins are displayed for all places within memoryRadius (800 m).
    //   • Auto-narration is gated by maxQueueDistance only.
    //
    // Tightened from 90 m to 60 m: well inside a single Manhattan short
    // block (~80 m). A place on the adjacent street is typically 70-85 m
    // away — above this threshold, so it stays visible but does not
    // auto-play. Only places that are clearly on the user's current block
    // or at the near edge of the next block can trigger automatically.
    maxQueueDistance: 60,
    // discoverRadius ≥ maxQueueDistance + LOOK_AHEAD_METERS.
    // Expanded from 120 m to 300 m so that OSM-anchor Walk Mode fetches a
    // wide enough candidate pool to cover major landmarks across a city block.
    // maxQueueDistance is unchanged — places only auto-narrate when within
    // 60 m; the larger radius only widens the pool of visible pins.
    discoverRadius: 300,
    memoryRadius: 800,
    // Reduced from 40 m: with cooldownMs=25 s already rate-limiting picks,
    // the movement gate just needs to prevent re-narrating the identical spot.
    // 15 m ≈ 10 walking steps — short enough that a user pausing to look at
    // a building and then stepping forward triggers the next story naturally.
    minMetersBetweenPicks: 15,
    corridorMeters: 60,
    forwardBiasMeters: 60,
    offAxisPenaltyDeg: 45,
    offAxisPenaltyMeters: 500,
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

// A live narration fetch that fails (bad status, empty payload, thrown error,
// timeout — see fetchNarrationPayload) un-marks the candidate as narrated so
// it isn't burned for the rest of the session, but immediately re-eligibility
// would let a 1.5 s maybeNarrate tick re-request the same failing endpoint in
// a tight loop, since a failed fetch never advances the cooldown/movement
// gates (those only update when narration actually finishes playing). This
// backoff is a separate operational concern from density-based narration
// pacing (cfg.cooldownMs), so it uses its own fixed constant rather than
// reusing that value.
const NARRATION_FAILURE_BACKOFF_MS = 60_000;

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

// Metres to project the discover-fetch centre ahead of the user's current
// position in their direction of travel. Tightened from 60 m to 30 m so the
// discover-circle stays centred on the user's actual block rather than the
// next one — important on Manhattan grids where 60 m is most of a short
// block. Compass errors in steel-frame canyons would otherwise shift the
// search centre an entire block in the wrong direction.
const LOOK_AHEAD_METERS = 30;

// How long (ms) a velocity heading computed from GPS movement is considered
// "fresh" enough to apply the hard 90° angular exclusion gate in pickNext.
// After this interval without a new movement sample (user standing still or
// very slow) the gate is relaxed to soft-penalty-only so nearby pins are
// never completely blocked by a stale heading.
const VELOCITY_HEADING_STALE_MS = 30_000;

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
  const [locationError, setLocationError] = useState<
    "permission-denied" | "gps-timeout" | null
  >(null);
  // Mirror of currentLocation in a ref so async paths (fetchNarration awaits a
  // 10–15s LLM call) can read the freshest GPS without re-rendering and
  // without stale closures. Updated in a useEffect below.
  const currentLocationRef = useRef<{
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
  // Turn-by-turn route state for the active walk. Held in a ref for the GPS
  // tick (which runs in the background and can't take a re-render dependency)
  // and mirrored to React state for the UI banner.
  const routeStepsRef = useRef<RouteStep[]>([]);
  const announcedStepsRef = useRef<Set<number>>(new Set());
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [nextTurn, setNextTurn] = useState<NextTurn | null>(null);

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
      // Reset fetch anchor and session tile cache so the next GPS tick
      // re-fetches with the updated building-type preferences.
      lastFetchRef.current = null;
      fetchedTilesRef.current.clear();
    },
    [],
  );

  const { localeRef } = useLocale();
  const narration = useNarration();
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const headingWatchRef = useRef<Location.LocationSubscription | null>(null);
  const lastFetchRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );
  // Tile keys already fetched in this walk session. Prevents redundant
  // /discover requests when the user stays within the same ~111 m grid cell.
  // Cleared on stopWalk() and whenever building-type preferences change.
  const fetchedTilesRef = useRef<Set<string>>(new Set());
  // Throttle timestamps — low cost; used in both DEV and production paths.
  const lastGpsLogTimestampRef = useRef<number>(0);
  const lastNarratedPruneRef = useRef<number>(0);
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
  // Tracks the wall-clock time of the most recent velocity heading update.
  // Used by pickNext to decide whether the heading is fresh enough to apply
  // the hard 90° exclusion gate vs. falling back to soft-penalty-only.
  const velocityHeadingTimestampRef = useRef<number | null>(null);
  // Rolling buffer of recent velocity-derived bearings for median smoothing.
  const velocityHeadingBufferRef = useRef<number[]>([]);
  const fetchingRef = useRef(false);
  const narratedIdsRef = useRef<Map<string, number>>(new Map());
  // placeId → timestamp of most recent live-fetch failure. Populated when a
  // live fetch fails (alongside un-marking narratedIdsRef); a candidate with
  // an unexpired entry here is treated as temporarily ineligible by pickNext
  // (see NARRATION_FAILURE_BACKOFF_MS). Cleared on any successful fetch
  // (live or cache) and reset wholesale in startWalk().
  const failedFetchRef = useRef<Map<string, number>>(new Map());
  // Incremented once per startWalk() call. fetchNarration captures this
  // value before its 10–15 s await; if a Walk-1 fetch resolves as a failure
  // after Walk 2 has already started (isWalkingRef.current is true again by
  // then, so that check alone can't detect this), the generation mismatch
  // stops it from writing Walk-1's failure state into Walk-2's fresh
  // narratedIdsRef/failedFetchRef maps.
  const walkGenerationRef = useRef(0);
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

  // Walk Mode diagnostic overlay opt-in. Same hydrate-from-AsyncStorage
  // pattern as showPrefetchStats so the user's last choice survives a
  // relaunch without flashing the panel for users who never enabled it.
  const [walkDebugEnabled, setWalkDebugEnabledState] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getStartupValue(STARTUP_KEYS.walkDebugOverlayEnabled).then((value) => {
      if (cancelled) return;
      if (value === "1") setWalkDebugEnabledState(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const setWalkDebugEnabled = useCallback((enabled: boolean) => {
    setWalkDebugEnabledState(enabled);
    void setStartupValue(
      STARTUP_KEYS.walkDebugOverlayEnabled,
      enabled ? "1" : "0",
    );
  }, []);

  // Tracking refs for the "(passed)" badge on Now Playing. Captured at the
  // moment a narration is enqueued; consulted on every render to decide
  // whether the user has moved well past the place. Cleared on stop / next
  // narration so a stale anchor never lingers.
  const narrationStartLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const narrationStartTimeRef = useRef<number>(0);
  const [narrationStartTick, setNarrationStartTick] = useState(0);
  // Recompute narrationIsPassed whenever currentLocation OR a new narration
  // starts. The badge is intentionally generous: needs both 80 m of movement
  // *away* from the place AND 25 s of audio elapsed, so a place that's a few
  // metres past the user at the moment audio begins doesn't immediately show
  // "(passed)".
  const narrationIsPassed = useMemo(() => {
    void narrationStartTick;
    const anchor = narrationStartLocationRef.current;
    if (!anchor || !currentLocation) return false;
    const elapsed = Date.now() - narrationStartTimeRef.current;
    if (elapsed < 25_000) return false;
    const dist = Math.hypot(
      (currentLocation.latitude - anchor.latitude) * 111_111,
      (currentLocation.longitude - anchor.longitude) *
        111_111 *
        Math.cos((anchor.latitude * Math.PI) / 180),
    );
    return dist > 80;
  }, [currentLocation, narrationStartTick]);

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

  // Stale narration guard (Problem B): when nearbyPlaces is updated by the
  // coordSource trust gate, check whether the currently-playing place is still
  // in the verified pool. If it has been removed (e.g. because its coordSource
  // was undefined and was filtered out), stop the active audio immediately and
  // clear all narration display state so the UI does not continue showing or
  // playing an unverified place.
  useEffect(() => {
    if (!isWalking) return;
    const current = currentNarrationPlaceRef.current;
    if (!current) return;
    const stillPresent = nearbyPlaces.some((p) => p.id === current.id);
    if (!stillPresent) {
      narration.stop();
      currentNarrationPlaceRef.current = null;
      setCurrentNarrationPlace(null);
    }
    // narration.stop is a stable useCallback — including narration here would
    // cause spurious re-runs; the ref gives us synchronous access to stop().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyPlaces, isWalking]);

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

  const cachedAddressHintRef = useRef<string>("");

  const fetchNearbyPlaces = useCallback(
    async (latitude: number, longitude: number) => {
      // -----------------------------------------------------------------------
      // Compute the fetch centre and tile key synchronously BEFORE acquiring
      // the fetchingRef lock so we can do a cheap in-memory check first.
      const cfg = DENSITY_CONFIG[densityRef.current];
      // Project the fetch centre ahead of the user in their direction of
      // travel so the Overpass/LLM result set is front-loaded with places
      // they're about to walk toward. Fall back to GPS position when no
      // heading is available (first fix, standing still, etc.).
      const fetchHeading =
        deviceHeadingRef.current ?? velocityHeadingRef.current;
      const fetchCenter =
        fetchHeading !== null
          ? projectAhead(latitude, longitude, fetchHeading, LOOK_AHEAD_METERS)
          : { latitude, longitude };

      const includedTypes = groupKeysToIncludedTypes(
        enabledBuildingGroupsRef.current,
      );
      const includesSuffix =
        includedTypes.length > 0
          ? `:inc=${[...includedTypes].sort().join(",")}`
          : "";
      const tile = buildTileKey(
        fetchCenter.latitude,
        fetchCenter.longitude,
        cfg.discoverRadius,
        includesSuffix,
        true, // osmAnchor — Walk Mode always uses the OSM-anchor path
      );

      // Layer 1 — Session cache (in-memory, instant, zero I/O).
      // If this tile was already fetched during this walk session the places
      // are already in placesRef. Skip without touching the network or disk.
      if (fetchedTilesRef.current.has(tile)) {
        if (__DEV__)
          console.log(`[discover] session hit tile=${tile} — skipping`);
        return;
      }

      if (fetchingRef.current) return;
      fetchingRef.current = true;
      setIsLoading(true);
      try {
        // Layer 2 — Cross-session AsyncStorage cache (24 h TTL).
        // Check before hitting the server so that revisiting a recently-walked
        // area (same day, same block) requires zero HTTP round-trips.
        const cachedPlaces = await getPlaceCache(tile);
        if (cachedPlaces !== null) {
          if (!isWalkingRef.current) {
            if (__DEV__)
              console.log(
                "[discover] response arrived but walk ended — discarding",
                { placesCount: cachedPlaces?.length ?? 0 },
              );
            return;
          }
          const allIncoming = cachedPlaces as WalkPlace[];
          const map = new Map<string, WalkPlace>();
          for (const p of placesRef.current) map.set(p.id, p);
          for (const p of allIncoming) map.set(p.id, p);
          const merged: WalkPlace[] = [];
          for (const p of map.values()) {
            // Skip places the server flagged as spatially untrustworthy —
            // their coordinates do not match their described location.
            if (p.autoNarrationBlocked) continue;
            // Belt-and-suspenders: drop interpretive overlays from the Walk
            // Mode pool regardless of how they arrived (cache hit, server
            // response, or stale v3 tile). walkEligibility already gates
            // these out of narration, but excluding them here prevents them
            // from showing in debug candidate counts as "blocked" entries.
            if (p.discoveryClass === "INTERPRETIVE_OVERLAY") continue;
            // Belt-and-suspenders: drop generic commercial/chain places from
            // the Walk Mode pool regardless of how they arrived. The server
            // now filters these unconditionally, but a tile cached before
            // that change (or written from an older client) could still hold
            // one — guard here so it doesn't linger as a pin.
            if (looksGenericCommercial(p as any)) continue;
            // Walk Mode spatial trust gate (mirrors Layer 3 and server path):
            // drop any place without a verified coordSource. coordSource is set
            // by verifyPlaceCoordinates: "nominatim-confirmed"/"nominatim-corrected"
            // mean Nominatim externally verified the coordinates. "llm" means
            // Nominatim was probed but returned zero results — coordinates are
            // LLM-only and must not enter Walk candidate scoring.
            // undefined = verification never ran (error/unprobed state).
            if (
              (p as any).coordSource === undefined ||
              (p as any).coordSource === "llm"
            )
              continue;
            // Accept Overpass-sourced places (candidateSource:"osm") OR
            // LLM-sourced places that Nominatim externally verified. When
            // Overpass is unavailable (IP-blocked) the server falls back to
            // the LLM path; those places carry coordSource:"nominatim-confirmed"
            // or "nominatim-corrected" and are as spatially trustworthy as
            // OSM-anchored candidates. The coordSource gate above already
            // ensures only Nominatim-verified places reach this point.
            if (
              (p as any).candidateSource !== "osm" &&
              (p as any).coordSource !== "nominatim-confirmed" &&
              (p as any).coordSource !== "nominatim-corrected"
            )
              continue;
            if (
              haversineMeters(latitude, longitude, p.latitude, p.longitude) <=
              cfg.memoryRadius
            )
              merged.push(p);
          }
          placesRef.current = merged;
          setNearbyPlaces(merged);
          lastFetchRef.current = { latitude, longitude };
          fetchedTilesRef.current.add(tile);
          // Same loop-walk recovery prune as the HTTP path — needed here too
          // since cached-tile hits skip the HTTP branch entirely.
          const oneHourAgoC = Date.now() - 60 * 60 * 1000;
          for (const [id, ts] of narratedIdsRef.current.entries()) {
            if (ts < oneHourAgoC) narratedIdsRef.current.delete(id);
          }
          recordDiscoverResult({
            osmCoverage: {
              osm: allIncoming.filter(
                (p) => (p as any).candidateSource === "osm",
              ).length,
              llm: allIncoming.filter(
                (p) => (p as any).candidateSource !== "osm",
              ).length,
            },
            poolCoverage: {
              osm: merged.filter((p) => (p as any).candidateSource === "osm")
                .length,
              llm: merged.filter((p) => (p as any).candidateSource !== "osm")
                .length,
            },
          });
          if (__DEV__)
            console.log(
              `[discover] storage hit tile=${tile} incoming=${allIncoming.length} merged=${merged.length}`,
            );
          return;
        }

        // Layer 3 — Server fetch.
        if (__DEV__)
          console.log(
            `[discover] server fetch tile=${tile} radius=${cfg.discoverRadius}m`,
          );
        // Build body now (includedTypes were computed above).
        // addressHint is intentionally NOT sent. The server derives the area
        // label from its own Nominatim reverse-geocode of the search-centre
        // coordinates, which is always more reliable than the device OS
        // geocoder (Expo Location.reverseGeocodeAsync). Sending a client-side
        // hint previously caused the device geocoder's stale / incorrect
        // neighbourhood label to override the server's correct Nominatim
        // result — the root cause of "West Philly content at Fairmount GPS"
        // field reports.
        const body: Record<string, unknown> = {
          latitude: fetchCenter.latitude,
          longitude: fetchCenter.longitude,
          radius: cfg.discoverRadius,
          // Signal to the server that this is a Walk Mode request. The server
          // runs Nominatim coordinate verification synchronously and drops any
          // place it cannot confirm, so only spatially trusted pins are returned.
          walkMode: true,
          // OSM-anchor mode: Overpass is the definitive candidate source.
          // The LLM writes copy only — it cannot invent names or coordinates.
          osmAnchor: true,
        };
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
        // Server-side worst case for the osmAnchor branch (confirmed by
        // direct code trace, not the old ~1 s estimate): nbhd-label lookup
        // (4 s hard ceiling) + Overpass fetch (12 s hard ceiling), run
        // sequentially not in parallel = 16 s, plus the server's own 45 s
        // copy-generation timeout (copyTimer in routes/explore/index.ts) =
        // ~61 s abort-path worst case, ~62-63 s on a successful response
        // (photo/rating lookups add a bit more, and the ratings DB lookup
        // has no explicit timeout of its own). 70 s leaves approximately
        // 7-9 s of expected margin for success-path work, network transit,
        // and response parsing on a phone in the field, substantially
        // reducing — not eliminating — the risk that the client aborts
        // before the server responds.
        const discoverTimeout = setTimeout(() => discoverAbort.abort(), 70_000);
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
        if (!res.ok && __DEV__)
          console.log(
            `[discover] server error tile=${tile} status=${res.status}`,
          );
        if (res.ok) {
          const data = await res.json();
          // Guard: if stopWalk was called while the fetch was in-flight, discard
          // results so we don't repopulate the places list or update state after
          // the walk has ended.
          if (!isWalkingRef.current) {
            if (__DEV__)
              console.log(
                "[discover] response arrived but walk ended — discarding",
                { placesCount: data?.places?.length ?? 0 },
              );
            return;
          }
          if (Array.isArray(data?.places)) {
            // When Overpass was unavailable the server fell back to the LLM
            // path and flags the response. The candidateSource gate is relaxed
            // in this case so coordSource:"llm" places (real but not in
            // Nominatim) can enter the Walk pool — the server already cleared
            // autoNarrationBlocked on them and kept the ordinal mismatch check.
            const isOverpassFallback = (data as any).overpassFallback === true;
            // Merge with existing — dedupe by id, then evict anything farther
            // than memoryRadius from the user's current location. Without the
            // eviction the queue grows unbounded over a long walk, slowing
            // pickNext and piling stale markers across the whole neighborhood.
            const allIncoming = data.places as WalkPlace[];
            // No pre-filter by heading here. In dense urban canyons (e.g.
            // Midtown Manhattan) steel-frame buildings heavily distort the
            // magnetometer, causing heading errors of 90–180°. A hard angular
            // filter would silently drop places the user is about to walk into
            // and leave the queue empty. pickNext() handles direction
            // preference through forwardBiasMeters / offAxisPenaltyMeters
            // scoring, so all discovered places can safely enter the pool and
            // the scoring determines which one to narrate.
            const incoming = allIncoming;
            const map = new Map<string, WalkPlace>();
            for (const p of placesRef.current) map.set(p.id, p);
            for (const p of incoming) map.set(p.id, p);
            const merged: WalkPlace[] = [];
            for (const p of map.values()) {
              // Skip places the server flagged as spatially untrustworthy.
              // incoming versions override placesRef versions (second loop
              // above), so a place that arrives with autoNarrationBlocked=true
              // on a subsequent discover call correctly evicts the old entry.
              if (p.autoNarrationBlocked) continue;
              // Belt-and-suspenders: server already excludes these for walkMode
              // requests, but guard here too so the pool stays clean if the
              // route is called without walkMode or if the filter changes.
              if (p.discoveryClass === "INTERPRETIVE_OVERLAY") continue;
              // Belt-and-suspenders: server already excludes generic
              // commercial/chain places unconditionally, but guard here too
              // so the pool stays clean against a stale merged-in entry or
              // a future filter regression.
              if (looksGenericCommercial(p as any)) continue;
              // Accept Overpass-sourced places (candidateSource:"osm") OR
              // LLM-sourced places that Nominatim externally verified. When
              // Overpass is unavailable (overpassFallback flag) also accept
              // coordSource:"llm" places — the server cleared autoNarrationBlocked
              // on them and the ordinal-mismatch check still applies.
              if (
                (p as any).candidateSource !== "osm" &&
                (p as any).coordSource !== "nominatim-confirmed" &&
                (p as any).coordSource !== "nominatim-corrected" &&
                !(isOverpassFallback && (p as any).coordSource === "llm")
              )
                continue;
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
            // Persist to tile cache so the next walk in the same area skips
            // the HTTP round-trip entirely. Use data.places (the raw server
            // response) rather than the evicted `merged` list so the cache
            // stores the full set of discovered places for this tile.
            //
            // Guard: only write if the server response contains at least one
            // OSM-stamped place. Caching a response where every place is
            // LLM-sourced (candidateSource !== "osm") would poison the tile
            // for 24 h — the Walk pool gate would block every candidate and
            // the user would see zero pins until the TTL expired. Skipping
            // the write lets the server be retried on the next walk session,
            // when Overpass may return results or the API server may be fresh.
            const hasOsmPlace = allIncoming.some(
              (p) =>
                (p as any).candidateSource === "osm" ||
                (p as any).coordSource === "nominatim-confirmed" ||
                (p as any).coordSource === "nominatim-corrected",
            );
            if (hasOsmPlace) {
              setPlaceCache(tile, data.places as unknown[]);
            }
            fetchedTilesRef.current.add(tile);
            if (__DEV__)
              console.log(
                `[discover] server OK tile=${tile} incoming=${allIncoming.length} merged=${merged.length}`,
              );
            // Loop-walk recovery: prune narratedIds entries older than 1 hour
            // so a place the user heard early in a long loop walk can re-narrate
            // when they circle back. Without this prune, narratedIdsRef grows
            // forever and the return leg of any loop walk is silent. We only
            // prune the ref (used by pickNext), not the React state used to
            // visually dim played pins on the map — the visual history of
            // played stories deliberately persists for the whole walk.
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            for (const [id, ts] of narratedIdsRef.current.entries()) {
              if (ts < oneHourAgo) narratedIdsRef.current.delete(id);
            }
            // Record discover diagnostics after merge so both raw (pre-gate)
            // and pool (post-gate) counts are available for the debug overlay.
            // osmCoverage = raw tile contents; poolCoverage = what entered placesRef.
            const osmCountForDiag = data?.osmCandidateCount as
              | { r150: number; r300: number; r500: number }
              | undefined;
            recordDiscoverResult({
              ...(osmCountForDiag !== undefined
                ? { osmCandidateCount: osmCountForDiag }
                : {}),
              noVerifiedPlacesNearby: data?.noVerifiedPlacesNearby as
                | boolean
                | undefined,
              osmCoverage: {
                osm: allIncoming.filter(
                  (p) => (p as any).candidateSource === "osm",
                ).length,
                llm: allIncoming.filter(
                  (p) => (p as any).candidateSource !== "osm",
                ).length,
              },
              poolCoverage: {
                osm: merged.filter((p) => (p as any).candidateSource === "osm")
                  .length,
                llm: merged.filter((p) => (p as any).candidateSource !== "osm")
                  .length,
              },
            });
          }
        }
      } catch (err) {
        if (__DEV__)
          console.log(
            "[discover] fetch failed/timed out:",
            err instanceof Error ? err.message : String(err),
          );
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
    async (
      geometry: number[][],
      maxPlaces?: number,
      corridorOverride?: number,
    ): Promise<WalkPlace[]> => {
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
            corridorMeters: corridorOverride ?? cfg.corridorMeters,
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
      // Anchor the "(passed)" badge state to this narration. Use the place's
      // own coordinates (not the user's) — that is what "passed" is measured
      // against. Bumping narrationStartTick triggers a re-render so the
      // badge can recompute against the latest currentLocation.
      narrationStartLocationRef.current = {
        latitude: place.latitude,
        longitude: place.longitude,
      };
      narrationStartTimeRef.current = Date.now();
      setNarrationStartTick((t) => t + 1);
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
        // Wrapped in try/catch: Haptics can throw on devices without a
        // haptic engine or when the audio session is temporarily locked by
        // an incoming call. An unhandled rejection here would crash Expo Go.
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
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
    (
      place: WalkPlace,
      timeoutInfo?: { timedOut: boolean },
    ): Promise<NarrationPayload | null> => {
      // Spatial-anchor policy — critical for trust.
      //
      // The narration prompt requires a location phrase on every narration
      // (server rule: MANDATORY FIRST CLAUSE). We resolve the anchor in
      // strict priority order:
      //
      //   1. place.address (specific street number): always the strongest
      //      signal. The LLM opens with "Right at three-twenty-eight Walnut
      //      Street —". Never overridden by user location.
      //
      //   2. crossStreets from the user's reverse-geocode: ONLY used when
      //      the place has no address AND the user is physically adjacent
      //      (≤ maxQueueDistance) to the place. In that case user and place
      //      occupy the same block, so the user's cross-street label is
      //      approximately correct for the place too.
      //
      //   3. Nothing: the server falls back to a generic opener ("Right at
      //      this corner —"). Always correct; never spatially misleading.
      //
      // NEVER pass the user's current reverse-geocode as crossStreets when
      // the place has its own address, or when the user is far from the
      // place. Doing so causes the LLM to anchor the narration to the
      // user's neighborhood ("Here in Fairmount —") rather than the
      // place's actual location ("Right at three-twenty-eight Walnut —"),
      // which is the hallucinated spatial coherence bug.
      const cfg = DENSITY_CONFIG[densityRef.current];
      const currentLoc = currentLocationRef.current;
      const placeHasAddress =
        typeof place.address === "string" && place.address.trim().length > 0;
      const distToPlace = currentLoc
        ? haversineMeters(
            currentLoc.latitude,
            currentLoc.longitude,
            place.latitude,
            place.longitude,
          )
        : null;
      const userIsAdjacent =
        distToPlace !== null && distToPlace <= cfg.maxQueueDistance;
      const enriched =
        !placeHasAddress && userIsAdjacent && cachedAddressHintRef.current
          ? { ...place, crossStreets: cachedAddressHintRef.current }
          : place;
      return fetchNarrationPayloadUtil(enriched, {
        apiBase: API_BASE,
        isExpoGo: IS_EXPO_GO,
        timeoutInfo,
      });
    },
    [],
  );

  // Re-validation guard reused at every `enqueueNarration` site. pickNext
  // ran at GPS-tick T0; fetchNarrationPayload can take 10–15 s. By T0+15 s
  // the user may have walked past the place we picked. Returns true when the
  // place is still close enough to play; false when the picked place is now
  // stale (in which case the slot is freed and a rejection is logged).
  // Reads currentLocationRef (NOT closure state) so the freshest GPS tick is
  // honored even when called after long awaits.
  const isStillCloseEnough = useCallback(
    (place: WalkPlace, contextLabel: string): boolean => {
      // Re-read the freshest version of this place from the in-memory pool.
      // pickNext captured this object up to 15 s ago; a concurrent discover
      // response may have updated discoveryClass or autoNarrationBlocked since.
      const freshPlace =
        placesRef.current.find((q) => q.id === place.id) ?? place;

      // A place downgraded to INTERPRETIVE_OVERLAY after pickNext selected it
      // must not narrate. This closes the stale-object window: if the server
      // returns an updated classification while the LLM/TTS fetch is in-flight,
      // the post-fetch re-check here catches it before enqueueNarration.
      if (freshPlace.discoveryClass === "INTERPRETIVE_OVERLAY") {
        if (__DEV__) {
          console.log(
            `[${contextLabel}] ABORT (interpretiveOverlay post-pick): "${place.name}"`,
          );
        }
        recordRejection({
          ts: Date.now(),
          placeId: place.id,
          placeName: place.name,
          reason: "interpretiveOverlay",
          distance: null,
          bearingDiff: null,
        });
        return false;
      }

      // Defense-in-depth: a server-side address↔coordinate coherence check
      // already blocks auto-narration via pickNext, but the manual playPlace
      // path bypasses pickNext. Re-check here so that even a tapped pin with
      // a strong-evidence spatial mismatch is silently skipped rather than
      // narrated with a fabricated location anchor. Use the fresh object so
      // late-arriving autoNarrationBlocked flags are honored.
      if (freshPlace.autoNarrationBlocked) {
        if (__DEV__) {
          console.log(
            `[${contextLabel}] ABORT (autoNarrationBlocked): "${place.name}" — ${freshPlace.addressCoherence?.reason ?? "address↔coord mismatch"}`,
          );
        }
        recordRejection({
          ts: Date.now(),
          placeId: place.id,
          placeName: place.name,
          reason: "addressMismatch",
          distance: null,
          bearingDiff: null,
        });
        return false;
      }
      const currentLoc = currentLocationRef.current;
      if (!currentLoc) return true; // no GPS — don't second-guess pickNext
      const cfg = DENSITY_CONFIG[densityRef.current];
      const dist = haversineMeters(
        currentLoc.latitude,
        currentLoc.longitude,
        place.latitude,
        place.longitude,
      );
      if (dist > cfg.maxQueueDistance * 2) {
        if (__DEV__) {
          console.log(
            `[${contextLabel}] ABORT (stale pick): "${place.name}" is now ${Math.round(dist)}m away, beyond 2×maxQueueDistance=${cfg.maxQueueDistance * 2}m`,
          );
        }
        narratedIdsRef.current.delete(place.id);
        setNarratedIds(new Map(narratedIdsRef.current));
        recordRejection({
          ts: Date.now(),
          placeId: place.id,
          placeName: place.name,
          reason: "stale",
          distance: dist,
          bearingDiff: null,
        });
        return false;
      }
      // Re-check the hard 90° heading gate using live heading refs.
      // pickNext ran up to 10–15 s ago; the user may have turned away from
      // this place while the fetch was in-flight. Only apply when the
      // velocity heading is still fresh so a stale vector doesn't wrongly
      // suppress narration for a user who has since stopped or turned back.
      const vHeading = velocityHeadingRef.current;
      const vAge =
        velocityHeadingTimestampRef.current !== null
          ? Date.now() - velocityHeadingTimestampRef.current
          : Infinity;
      if (vHeading !== null && vAge < VELOCITY_HEADING_STALE_MS) {
        const pb = bearingDeg(
          currentLoc.latitude,
          currentLoc.longitude,
          place.latitude,
          place.longitude,
        );
        const angDiff = angularDiff(vHeading, pb);
        if (angDiff > 90) {
          if (__DEV__) {
            console.log(
              `[${contextLabel}] ABORT (behind90 post-fetch): "${place.name}" diff=${Math.round(angDiff)}° heading=${Math.round(vHeading)}°`,
            );
          }
          narratedIdsRef.current.delete(place.id);
          setNarratedIds(new Map(narratedIdsRef.current));
          recordRejection({
            ts: Date.now(),
            placeId: place.id,
            placeName: place.name,
            reason: "behind90",
            distance: dist,
            bearingDiff: angDiff,
          });
          return false;
        }
      }
      return true;
    },
    [],
  );

  const fetchNarration = useCallback(
    async (place: WalkPlace) => {
      // Captured before the 10–15 s live-fetch await below so the failure
      // branch can detect a stopWalk()+startWalk() that happened while this
      // fetch was in flight (see walkGenerationRef).
      const myGeneration = walkGenerationRef.current;
      // Pre-fetch sanity check: even before kicking off a 10–15 s request,
      // bail if the place is already too far. The authoritative re-check
      // happens immediately before each enqueueNarration call below.
      if (!isStillCloseEnough(place, "fetchNarration:pre")) return;
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
        recordNarrationFetch({
          ts: Date.now(),
          placeId: place.id,
          placeName: place.name,
          source: "cache",
          outcome: "success",
          payloadKind: lookup.entry.payload.kind,
        });
        failedFetchRef.current.delete(place.id);
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
        // Authoritative re-check: even cache hits can be stale if the user
        // moved a long way between pickNext and this point.
        if (!isStillCloseEnough(place, "fetchNarration:cacheHit")) {
          if (lookup.entry.payload.kind === "audio") {
            try {
              lookup.entry.payload.cleanup?.();
            } catch {}
          }
          return;
        }
        enqueueNarration(place, lookup.entry.payload);
        // Keep the pipeline going: pre-fetch the next candidate.
        prefetchNextRef.current?.();
        return;
      }

      // --- Normal path (cache miss or stale) ---
      // Client-side latency boundary for this fetch attempt: starts right
      // before the network call is initiated, ends the moment its result
      // (success/failure) is known below. This measures what the user
      // actually waited on — it says nothing about server-side processing
      // time, which is logged independently by the server itself.
      const fetchStartedAt = Date.now();
      const timeoutInfo = { timedOut: false };
      const payload = await fetchNarrationPayload(place, timeoutInfo);
      if (!payload) {
        recordNarrationFetch({
          ts: Date.now(),
          placeId: place.id,
          placeName: place.name,
          source: "live",
          outcome: timeoutInfo.timedOut ? "timeout" : "failure",
          durationMs: Date.now() - fetchStartedAt,
        });
        // A failed fetch never played anything, so don't burn this candidate
        // for the rest of the session — un-mark it. Record a failure
        // timestamp so pickNext backs off from immediately re-selecting it
        // (see NARRATION_FAILURE_BACKOFF_MS): the cooldown/movement gates
        // only advance when narration actually finishes, so without this a
        // failing endpoint could be re-requested every ~1.5 s.
        //
        // Only mutate the current session's maps if this fetch belongs to
        // the walk that's still active. A stale fetch — from a stopped walk,
        // or from a walk since superseded by a new startWalk() — must not
        // add backoff state to a different session's maps.
        if (
          !isLiveFetchStale(
            isWalkingRef.current,
            walkGenerationRef.current,
            myGeneration,
          )
        ) {
          narratedIdsRef.current.delete(place.id);
          setNarratedIds(new Map(narratedIdsRef.current));
          failedFetchRef.current.set(place.id, Date.now());
        }
        return;
      }
      // Guard: discard the payload and run its cleanup — never play audio,
      // enqueue narration, or update stats/backoff state for a superseded
      // session — when either stopWalk ended this walk outright, or a new
      // startWalk() has superseded it while this fetch was in-flight (see
      // isLiveFetchStale). Both cases are recorded as "cancelled" — the
      // existing diagnostics vocabulary already covers "this fetch's result
      // was discarded".
      if (
        isLiveFetchStale(
          isWalkingRef.current,
          walkGenerationRef.current,
          myGeneration,
        )
      ) {
        recordNarrationFetch({
          ts: Date.now(),
          placeId: place.id,
          placeName: place.name,
          source: "live",
          outcome: "cancelled",
          payloadKind: payload.kind,
          durationMs: Date.now() - fetchStartedAt,
        });
        if (payload.kind === "audio") {
          try {
            payload.cleanup?.();
          } catch {}
        }
        return;
      }
      recordNarrationFetch({
        ts: Date.now(),
        placeId: place.id,
        placeName: place.name,
        source: "live",
        outcome: "success",
        payloadKind: payload.kind,
        durationMs: Date.now() - fetchStartedAt,
      });
      failedFetchRef.current.delete(place.id);
      // First-time narration: ensure any stale "Replay" badge from the previous
      // story is gone before we kick off the new one.
      if (replayBadgeTimerRef.current) {
        clearTimeout(replayBadgeTimerRef.current);
        replayBadgeTimerRef.current = null;
      }
      setIsReplay(false);
      // Authoritative re-check immediately before commit. The 10–15 s LLM/TTS
      // request just resolved; the user may now be a block past this place.
      if (!isStillCloseEnough(place, "fetchNarration:postFetch")) {
        if (payload.kind === "audio") {
          try {
            payload.cleanup?.();
          } catch {}
        }
        return;
      }
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
      isStillCloseEnough,
    ],
  );

  /**
   * Immediately narrate a specific place, bypassing all cooldown / scoring
   * gates. Used by the manual "Play / Replay" pin action in the walk map.
   *
   * Manual intent must override any in-progress automatic narration, not
   * queue behind it: without narration.stop() the user's tapped place would
   * only start playing after the current auto-picked story finished, making
   * the pin feel unresponsive. After stopping, we also anchor the
   * lastNarrationEnd* refs so the auto-picker's movement gate
   * (minMetersBetweenPicks) doesn't immediately fire a competing pick the
   * very next GPS tick — the user's manual choice should hold its slot for
   * at least one cooldown / movement window like an auto pick would.
   */
  const playPlace = useCallback(
    (place: WalkPlace) => {
      try {
        narration.stop();
      } catch {}
      if (currentLocation) {
        lastNarrationEndLocationRef.current = {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        };
      }
      lastNarrationEndRef.current = Date.now();
      fetchNarration(place);
    },
    [fetchNarration, narration, currentLocation],
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
      // the last narration ended before picking the next one. Prevents the same
      // spot from auto-narrating twice in quick succession. The primary rate
      // limiter is cooldownMs; this gate just anchors picks to movement.
      const anchor = lastNarrationEndLocationRef.current;
      const movedSinceLast = anchor
        ? haversineMeters(
            anchor.latitude,
            anchor.longitude,
            loc.latitude,
            loc.longitude,
          )
        : Infinity;
      if (anchor && movedSinceLast < cfg.minMetersBetweenPicks) {
        if (__DEV__)
          console.log(
            `[pickNext] GATE:movement moved=${Math.round(movedSinceLast)}m need=${cfg.minMetersBetweenPicks}m`,
          );
        recordBlock({
          ts: Date.now(),
          reason: "movementGate",
          detail: `moved=${Math.round(movedSinceLast)}m need=${cfg.minMetersBetweenPicks}m`,
        });
        return null;
      }

      // Heading priority: GPS velocity > device compass. Velocity is more
      // reliable in urban steel-frame canyons where magnetic deflection can
      // reach 90–180°. Compass is the fallback for standing-still scenarios.
      const heading = velocityHeadingRef.current ?? deviceHeadingRef.current;

      // Decide if the velocity heading is fresh enough to trust for the hard
      // 90° exclusion gate. After VELOCITY_HEADING_STALE_MS without a movement
      // update (user has been standing still), the heading vector may no longer
      // reflect actual travel direction — relax to soft-penalty-only so nearby
      // pins are never permanently blocked by a stale heading.
      const velocityHeadingAge =
        velocityHeadingTimestampRef.current !== null
          ? Date.now() - velocityHeadingTimestampRef.current
          : Infinity;
      const velocityHeadingIsRecent =
        velocityHeadingAge < VELOCITY_HEADING_STALE_MS;

      if (__DEV__) {
        const headingDesc =
          velocityHeadingRef.current !== null
            ? `${Math.round(velocityHeadingRef.current)}°(vel/${velocityHeadingIsRecent ? "fresh" : "STALE"})`
            : deviceHeadingRef.current !== null
              ? `${Math.round(deviceHeadingRef.current)}°(compass)`
              : "none";
        console.log(
          `[pickNext] density=${densityRef.current} maxDist=${cfg.maxQueueDistance}m ` +
            `heading=${headingDesc} ` +
            `anchor=${anchor ? `${Math.round(movedSinceLast)}m from last` : "firstPick"} ` +
            `pool=${placesRef.current.length} narrated=${narratedIdsRef.current.size}`,
        );
      }

      // --- Eligibility filter: pure evaluateEligibility replaces inline
      //     narrated/tooFar/lowScore/behind90 checks. Ranking stays here.
      const eligState: EligibilityState = {
        loc,
        heading,
        velocityHeadingFresh: velocityHeadingIsRecent,
        narratedIds: narratedIdsRef.current,
        cfg: {
          maxQueueDistance: cfg.maxQueueDistance,
          netScoreFloor: cfg.netScoreFloor,
        },
      };
      const { eligibleIds, evaluations } = evaluateEligibility(
        placesRef.current,
        eligState,
      );
      for (const ev of evaluations) {
        if (ev.reason === "ok") continue;
        // For narrated places, surface any concurrent spatial downgrade so the
        // debug overlay can show "narrated (interpretiveOverlay)" rather than
        // hiding the spatial problem behind the narrated flag.
        let spatialNote: string | undefined;
        if (ev.reason === "narrated") {
          const freshP = placesRef.current.find((q) => q.id === ev.id);
          if (freshP?.discoveryClass === "INTERPRETIVE_OVERLAY") {
            spatialNote = "interpretiveOverlay";
          } else if (freshP?.autoNarrationBlocked) {
            spatialNote = "addressMismatch";
          }
        }
        if (__DEV__) {
          if (ev.reason === "narrated")
            console.log(
              `  [skip:narrated] "${ev.name}"${spatialNote ? ` (${spatialNote})` : ""}`,
            );
          else if (ev.reason === "addressMismatch") {
            const p = placesRef.current.find((q) => q.id === ev.id);
            console.log(
              `  [skip:addressMismatch] "${ev.name}" ${p?.addressCoherence?.reason ?? ""}`,
            );
          } else if (ev.reason === "behind90")
            console.log(
              `  [skip:90°gate diff=${ev.bearingDiff !== null ? Math.round(ev.bearingDiff) : "?"}°] "${ev.name}" dist=${Math.round(ev.distance)}m`,
            );
          else if (ev.reason === "lowScore")
            console.log(`  [skip:netScore] "${ev.name}"`);
        }
        recordRejection({
          ts: Date.now(),
          placeId: ev.id,
          placeName: ev.name,
          reason: ev.reason,
          distance: ev.distance,
          bearingDiff: ev.bearingDiff,
          spatialNote,
          discoveryRejectionReason: ev.discoveryRejectionReason,
        });
      }
      const blockedBy90Deg =
        eligibleIds.length === 0 &&
        evaluations.some((e) => e.reason === "behind90");
      let finalEligibleIds = eligibleIds;
      if (blockedBy90Deg) {
        if (__DEV__)
          console.log(
            `[pickNext] 90°gate blocked all candidates — retrying without hard gate`,
          );
        const fb = evaluateEligibility(placesRef.current, {
          ...eligState,
          velocityHeadingFresh: false,
        });
        finalEligibleIds = fb.eligibleIds;
      }

      // A candidate whose most recent live fetch failed is temporarily
      // ineligible (see NARRATION_FAILURE_BACKOFF_MS) but NOT removed from
      // finalEligibleIds wholesale — filtering happens here, per-candidate,
      // so a second-choice candidate can still be selected below without
      // waiting out another candidate's backoff window.
      if (failedFetchRef.current.size > 0) {
        const backoffResult = filterFailureBackoff(
          finalEligibleIds,
          failedFetchRef.current,
          Date.now(),
          NARRATION_FAILURE_BACKOFF_MS,
        );
        finalEligibleIds = backoffResult.eligibleIds;
        for (const { id } of backoffResult.backedOff) {
          const p = placesRef.current.find((q) => q.id === id);
          if (p) {
            recordRejection({
              ts: Date.now(),
              placeId: id,
              placeName: p.name,
              reason: "recentFailure",
              distance: haversineMeters(
                loc.latitude,
                loc.longitude,
                p.latitude,
                p.longitude,
              ),
              bearingDiff: null,
            });
          }
        }
      }

      // --- Ranking: lower score = better pick. Eligibility is settled above;
      //     this loop only computes the selection metric. ---
      const eligibleSet = new Set(finalEligibleIds);
      let best: WalkPlace | null = null;
      let bestScore = Infinity;

      for (const p of placesRef.current) {
        if (!eligibleSet.has(p.id)) continue;
        const dist = haversineMeters(
          loc.latitude,
          loc.longitude,
          p.latitude,
          p.longitude,
        );
        let score = dist;
        let diffForLog: number | null = null;

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
          diffForLog = diff;

          // Cosine forward bias: full bonus at diff=0° (straight ahead),
          // zero at 90°, penalty at 180°. No dist/3 cap — maxQueueDistance
          // prevents far-avenue jumps structurally.
          score -= fwdBias * Math.cos((diff * Math.PI) / 180);

          // Flat penalty for places past the soft off-axis threshold.
          if (diff > penaltyDeg) {
            score += penaltyMeters;
          }
        }

        // Rating bonus: each net upvote shaves up to 10 m, capped at 30 m.
        score -= Math.min(30, Math.max(-30, (p.netScore ?? 0) * 10));

        if (__DEV__) {
          const diffStr =
            diffForLog !== null ? ` diff=${Math.round(diffForLog)}°` : "";
          console.log(
            `  [pass] "${p.name}" dist=${Math.round(dist)}m${diffStr} score=${Math.round(score)}`,
          );
        }

        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }

      if (__DEV__ && best && blockedBy90Deg) {
        const dist = haversineMeters(
          loc.latitude,
          loc.longitude,
          best.latitude,
          best.longitude,
        );
        const pb =
          heading !== null
            ? bearingDeg(
                loc.latitude,
                loc.longitude,
                best.latitude,
                best.longitude,
              )
            : null;
        const diff =
          heading !== null && pb !== null ? angularDiff(heading, pb) : null;
        console.log(
          `[pickNext] fallback → "${best.name}" dist=${Math.round(dist)}m` +
            (diff !== null ? ` diff=${Math.round(diff)}°` : "") +
            ` score=${Math.round(bestScore)}`,
        );
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

      // Diagnostics snapshot for the field-test overlay. Cheap (a few
      // copies + a notify); safe to compute every tick because the overlay
      // is rendered only when the Settings toggle is on, and getWalkDiagnostics
      // returns the same object so subscribers re-read the latest values.
      //
      // IMPORTANT: the `score` shown here MUST be the same score pickNext uses
      // for selection (distance + off-axis penalty − forward bias − rating
      // bonus), so the "Top candidates" list explains why a particular place
      // was picked. Earlier versions exposed the raw netScore (a rating
      // signal) which left the overlay disagreeing with the actual selection.
      try {
        const visible = placesRef.current;
        const headingIsReliableForDiag =
          velocityHeadingRef.current !== null && velocityHeadingIsRecent;
        const candidates: Array<{
          id: string;
          name: string;
          distance: number;
          bearingDiff: number | null;
          score: number;
          osmId?: string;
          candidateSource?: "osm" | "llm";
        }> = [];
        for (const p of visible) {
          if (narratedIdsRef.current.has(p.id)) continue;
          if (p.autoNarrationBlocked) continue;
          if (p.discoveryClass === "INTERPRETIVE_OVERLAY") continue;
          // OSM-anchor POC: belt-and-suspenders — never surface a non-OSM
          // candidate in the scoring pool even if it somehow reached placesRef.
          if (p.candidateSource !== "osm") continue;
          const d = haversineMeters(
            loc.latitude,
            loc.longitude,
            p.latitude,
            p.longitude,
          );
          if (d > cfg.maxQueueDistance) continue;
          const net = p.netScore ?? 0;
          if (net < cfg.netScoreFloor) continue;
          const pb =
            heading !== null
              ? bearingDeg(loc.latitude, loc.longitude, p.latitude, p.longitude)
              : null;
          const dd =
            heading !== null && pb !== null ? angularDiff(heading, pb) : null;
          // Mirror pickNext's fresh-velocity hard 90° gate — otherwise the
          // overlay can list a >90° candidate as #1 while pickNext silently
          // excludes it. The fallback retry-without-gate path in pickNext
          // only fires when EVERY first-pass candidate was 90°-gated, so it
          // is intentionally not modelled here; the overlay should reflect
          // the primary path.
          if (headingIsReliableForDiag && dd !== null && dd > 90) {
            continue;
          }
          // Re-compute the same selection score pickNext uses so the
          // overlay's ranking matches what actually got picked.
          let s = d;
          if (heading !== null && dd !== null) {
            const overrides = walkConfigOverridesRef.current;
            const fwdBias =
              overrides?.forwardBiasMeters ?? cfg.forwardBiasMeters;
            const penaltyDeg =
              overrides?.offAxisPenaltyDeg ?? cfg.offAxisPenaltyDeg;
            const penaltyMeters =
              overrides?.offAxisPenaltyMeters ?? cfg.offAxisPenaltyMeters;
            s -= fwdBias * Math.cos((dd * Math.PI) / 180);
            if (dd > penaltyDeg) s += penaltyMeters;
          }
          s -= Math.min(30, Math.max(-30, net * 10));
          candidates.push({
            id: p.id,
            name: p.name,
            distance: d,
            bearingDiff: dd,
            score: s,
            osmId: p.osmId,
            candidateSource: p.candidateSource,
          });
        }
        // Lower score = better pick, so sort ascending — matches pickNext.
        candidates.sort((a, b) => a.score - b.score);
        const headingSource: "velocity" | "compass" | "none" =
          velocityHeadingRef.current !== null
            ? "velocity"
            : deviceHeadingRef.current !== null
              ? "compass"
              : "none";
        const velocityFresh =
          velocityHeadingRef.current !== null &&
          velocityHeadingTimestampRef.current !== null &&
          Date.now() - velocityHeadingTimestampRef.current < 8000;
        recordSelectionSnapshot({
          ts: Date.now(),
          location: { latitude: loc.latitude, longitude: loc.longitude },
          heading,
          headingSource,
          velocityHeadingFresh: velocityFresh,
          velocityMps: null,
          visiblePinCount: visible.length,
          eligibleCount: candidates.length,
          topCandidates: candidates.slice(0, 5),
          selected: best
            ? {
                id: best.id,
                name: best.name,
                reason: `score=${Math.round(bestScore)}`,
              }
            : null,
        });
      } catch {}

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
      currentLocationRef.current = { latitude, longitude };
      setCurrentLocation({ latitude, longitude });
      setLocationError(null);

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
            velocityHeadingTimestampRef.current = now;
            if (__DEV__)
              console.log(
                `[heading:vel] raw=${Math.round(newBearing)}° median=${Math.round(velocityHeadingRef.current)}° moved=${Math.round(dist)}m buf=${buf.length}`,
              );
          } else if (__DEV__) {
            console.log(
              `[heading:vel] raw=${Math.round(newBearing)}° REJECTED (diff from last=${lastVelocityHeading !== null ? Math.round(angularDiff(newBearing, lastVelocityHeading)) + "°" : "n/a"} > ${VELOCITY_HEADING_CONSISTENCY_DEG}°)`,
            );
          }
        }
      }
      prevLocationRef.current = { latitude, longitude, ts: now };

      // Throttled GPS summary — at most once per 10 s so it stays readable.
      if (__DEV__ && now - lastGpsLogTimestampRef.current >= 10_000) {
        lastGpsLogTimestampRef.current = now;
        const velDesc =
          velocityHeadingRef.current !== null
            ? `${Math.round(velocityHeadingRef.current)}°(${
                velocityHeadingTimestampRef.current !== null &&
                now - velocityHeadingTimestampRef.current <
                  VELOCITY_HEADING_STALE_MS
                  ? "fresh"
                  : "stale"
              })`
            : "none";
        const cmpDesc =
          deviceHeadingRef.current !== null
            ? `${Math.round(deviceHeadingRef.current)}°`
            : "none";
        console.log(
          `[GPS] lat=${latitude.toFixed(5)} lng=${longitude.toFixed(5)} ` +
            `vel=${velDesc} cmp=${cmpDesc} ` +
            `pool=${placesRef.current.length} narrated=${narratedIdsRef.current.size} ` +
            `density=${densityRef.current}`,
        );
      }

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
        if (__DEV__) console.log(`[refetch] first fix — triggering discover`);
        fetchNearbyPlaces(latitude, longitude);
      } else {
        const distFromLastFetch = haversineMeters(
          lastFetchRef.current.latitude,
          lastFetchRef.current.longitude,
          latitude,
          longitude,
        );
        if (distFromLastFetch > cfg.refetchMeters) {
          if (__DEV__)
            console.log(
              `[refetch] moved=${Math.round(distFromLastFetch)}m > ${cfg.refetchMeters}m — triggering discover`,
            );
          fetchNearbyPlaces(latitude, longitude);
        }
      }

      // Throttled prune of narratedIdsRef: removes entries older than 1 h.
      // The HTTP path runs the same prune after each server fetch, but if the
      // user walks in fully-cached territory that branch never fires.  Running
      // it here (at most once every 5 min) keeps the Map bounded on very long
      // loop walks regardless of cache hit rate.
      if (now - lastNarratedPruneRef.current >= 5 * 60 * 1000) {
        lastNarratedPruneRef.current = now;
        const pruneBeforeTs = now - 60 * 60 * 1000;
        for (const [id, ts] of narratedIdsRef.current.entries()) {
          if (ts < pruneBeforeTs) narratedIdsRef.current.delete(id);
        }
      }

      // Drive narration scheduling directly from the GPS event. JS timers may
      // be throttled or suspended while the phone is locked, but background
      // location callbacks keep firing — so each fresh sample is our most
      // reliable "tick" in that state.
      maybeNarrateRef.current?.({ latitude, longitude });

      // --- Turn-by-turn cue scheduling -----------------------------------
      // Find the next un-announced step (skipping the "depart" pseudo-step).
      // Track its live distance for the UI banner, and speak the cue once when
      // the user gets within TURN_CUE_DISTANCE_M. This runs after the narration
      // tick so the historical narration still gets first crack at the queue.
      const steps = routeStepsRef.current;
      if (steps.length > 0) {
        // Progress-based step advancement: of all the un-announced steps,
        // find the one we're currently closest to. If an *earlier* un-announced
        // step is farther away, the user has likely already walked past it
        // (or skipped it on a re-route) — silently mark those passed-by steps
        // as announced so the cue logic doesn't get stuck cueing a turn the
        // user is actively walking away from. Without this, missing the very
        // first turn would freeze guidance for the rest of the walk.
        let nearestIdx = -1;
        let nearestDist = Infinity;
        for (let i = 0; i < steps.length; i++) {
          if (announcedStepsRef.current.has(i)) continue;
          const s = steps[i];
          // Skip the initial "depart" step — its job is just to set the
          // starting heading, not to announce a turn.
          if (s.maneuverType === "depart") {
            announcedStepsRef.current.add(i);
            continue;
          }
          const [stepLat, stepLng] = s.location;
          const d = haversineMeters(latitude, longitude, stepLat, stepLng);
          if (d < nearestDist) {
            nearestDist = d;
            nearestIdx = i;
          }
        }
        // Mark every still-un-announced step before the nearest one as passed.
        // Distance is straight-line haversine, not along-route; in dense grids
        // that's a known approximation but it's good enough to keep the
        // banner advancing in the right direction.
        if (nearestIdx >= 0) {
          for (let i = 0; i < nearestIdx; i++) {
            if (!announcedStepsRef.current.has(i)) {
              announcedStepsRef.current.add(i);
            }
          }
        }
        const candidate: NextTurn | null =
          nearestIdx >= 0
            ? {
                step: steps[nearestIdx],
                index: nearestIdx,
                distanceMeters: nearestDist,
              }
            : null;
        setNextTurn(candidate);
        if (candidate && candidate.distanceMeters <= TURN_CUE_DISTANCE_M) {
          announcedStepsRef.current.add(candidate.index);
          try {
            // Short utterance, fire-and-forget. On native this plays through
            // expo-speech (a separate audio channel from the narration MP3
            // player), so it overlays the current story by design — the user
            // explicitly asked for cues "interleaved" with the narration.
            Speech.speak(candidate.step.instruction, { rate: 1.0 });
          } catch {}
          if (Platform.OS !== "web") {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch {}
          }
          addWalkBreadcrumb("turn cue spoken", {
            stepIndex: candidate.index,
            maneuverType: candidate.step.maneuverType,
          });
        }
      }
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
        recordBlock({ ts: Date.now(), reason: "notWalking" });
        return;
      }
      if (isSpeakingRef.current) {
        if (__DEV__) console.log("[maybeNarrate] BLOCKED: already speaking");
        recordBlock({ ts: Date.now(), reason: "alreadySpeaking" });
        return;
      }
      const cfg = DENSITY_CONFIG[densityRef.current];
      const elapsed = Date.now() - lastNarrationEndRef.current;
      if (elapsed < cfg.cooldownMs) {
        if (__DEV__)
          console.log(
            `[maybeNarrate] BLOCKED: cooldown ${Math.round((cfg.cooldownMs - elapsed) / 1000)}s remaining (density=${densityRef.current})`,
          );
        recordBlock({
          ts: Date.now(),
          reason: "cooldown",
          detail: `${Math.round((cfg.cooldownMs - elapsed) / 1000)}s remaining`,
        });
        return;
      }
      const next = pickNext(loc);
      if (!next) {
        if (__DEV__)
          console.log(
            `[maybeNarrate] BLOCKED: pickNext=null (${placesRef.current.length} places, ${narratedIdsRef.current.size} narrated)`,
          );
        recordBlock({ ts: Date.now(), reason: "noEligibleCandidate" });
        return;
      }

      // Re-validate eligibility just before committing to narration. Between
      // pickNext's scoring pass and now the GPS tick may have fired again,
      // the heading may have rotated, or the user may have moved far enough
      // for a different place to be the right choice. A stale pick is
      // dropped silently — the next interval tick will try again.
      {
        const effLoc = loc ?? currentLocationRef.current;
        if (!effLoc) return;
        const heading = velocityHeadingRef.current ?? deviceHeadingRef.current;
        const velAge =
          velocityHeadingTimestampRef.current !== null
            ? Date.now() - velocityHeadingTimestampRef.current
            : Infinity;
        const recheck = evaluateEligibility([next], {
          loc: effLoc,
          heading,
          velocityHeadingFresh: velAge < VELOCITY_HEADING_STALE_MS,
          narratedIds: narratedIdsRef.current,
          cfg: {
            maxQueueDistance: cfg.maxQueueDistance,
            netScoreFloor: cfg.netScoreFloor,
          },
        });
        if (recheck.evaluations[0]?.reason !== "ok") {
          if (__DEV__)
            console.log(
              `[maybeNarrate] DROP re-validation: "${next.name}" → ${recheck.evaluations[0]?.reason}`,
            );
          recordBlock({
            ts: Date.now(),
            reason: "reValidationDrop",
            detail: `"${next.name}" → ${recheck.evaluations[0]?.reason}`,
          });
          return;
        }
      }

      if (__DEV__)
        console.log(
          `[maybeNarrate] PASSED — fetching narration for "${next.name}"`,
        );
      recordBlock(null);
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

  // Provider-level safety net: if the provider ever unmounts mid-walk
  // (e.g. Expo Go hot-reload), remove native location subscriptions and
  // dispose the stale-prefetch pool so temp files and timers don't leak.
  useEffect(() => {
    return () => {
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
      if (stalePrefetchPoolRef.current) {
        disposeStalePrefetchPool(stalePrefetchPoolRef.current);
        stalePrefetchPoolRef.current = null;
      }
    };
  }, []);

  const startWalk = useCallback(
    async (
      initialPlaces?: WalkPlace[],
      routeContext?: RouteContext,
    ): Promise<boolean> => {
      // Guard against double-tap or re-entry before the walk is fully set up.
      if (isWalkingRef.current || isStartingRef.current) return false;
      isStartingRef.current = true;
      setLocationError(null);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          isStartingRef.current = false;
          setLocationError("permission-denied");
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
        walkGenerationRef.current += 1;
        setIsWalking(true);
        addWalkBreadcrumb("walk started");

        // Clear stale diagnostics from any prior walk session so the debug
        // overlay shows only current-session data (coverage counts, rejections,
        // candidate snapshots). Must run after the walk is declared started so
        // the overlay doesn't briefly show leftover state from the previous walk.
        resetWalkDiagnostics();

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
        failedFetchRef.current = new Map();
        // Seed pre-fetched places so narration can fire as soon as GPS arrives,
        // without waiting for the first GPS-driven discover call to complete.
        // Walk Mode spatial trust gate: only seed places that have been
        // externally coordinate-verified (coordSource set by Nominatim).
        // places-along-route places have no coordSource because that endpoint
        // does not run Nominatim; seeding them directly would put LLM-hallucinated
        // coordinates into candidate scoring before the first discover response.
        // Those places are dropped here; verified places arrive via fetchNearbyPlaces.
        // INTERPRETIVE_OVERLAY places are also excluded — they may have
        // coordSource set (Nominatim matched a nearby token) but their name
        // asserts a different location and must not enter narration scoring.
        const verifiedInitial = initialPlaces?.length
          ? initialPlaces.filter(
              (p) =>
                (p as any).coordSource !== undefined &&
                (p as any).coordSource !== "llm" &&
                (p as any).discoveryClass !== "INTERPRETIVE_OVERLAY",
            )
          : [];
        placesRef.current = verifiedInitial;
        setNearbyPlaces(verifiedInitial);
        // Seed turn-by-turn route state. Cleared if no route was planned so a
        // free-roam walk after a planned one doesn't surface stale steps.
        const seededSteps = routeContext?.steps ?? [];
        routeStepsRef.current = seededSteps;
        announcedStepsRef.current = new Set();
        setRouteSteps(seededSteps);
        setNextTurn(null);
        lastFetchRef.current = null;
        // Clear the session-scoped tile cache so the next walk re-fetches
        // normally rather than silently reusing stale session coverage.
        fetchedTilesRef.current.clear();
        prevLocationRef.current = null;
        deviceHeadingRef.current = null;
        velocityHeadingRef.current = null;
        velocityHeadingTimestampRef.current = null;
        cachedAddressHintRef.current = "";
        // Critical: reset fetchingRef so the first discover call after a
        // walk-restart isn't silently dropped. If stopWalk was called while a
        // 15-second discover fetch was still in-flight, fetchingRef stays true
        // until that fetch's finally block runs — which could be up to 15 s
        // later. Any fetchNearbyPlaces call in the new walk would hit the
        // early-return guard and bail, leaving placesRef empty and pickNext
        // returning null for the entire first-fetch window.
        fetchingRef.current = false;
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

        const accuracy =
          Platform.OS === "web"
            ? Location.Accuracy.High
            : Location.Accuracy.BestForNavigation;

        try {
          // Race the first fix against an 8-second wall clock so a slow GPS
          // fix never blocks the watch subscription from starting. The watch
          // will deliver the first real location update whenever the hardware
          // gets a lock; this just keeps startWalk from hanging in the
          // meantime and is purely a best-effort warm start.
          const loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("GPS first-fix timeout")),
                8_000,
              ),
            ),
          ]);
          if (isWalkingRef.current) handleLocationUpdate(loc);
        } catch {
          // The watch subscription set up below may still deliver a fix
          // shortly after this race times out/errors — this only surfaces
          // that the warm-start fix has stalled so far, it does not stop
          // acquisition. Cleared by handleLocationUpdate the moment any fix
          // (from the watch subscription) arrives.
          if (isWalkingRef.current) setLocationError("gps-timeout");
        }

        // Guard: if a stale subscription exists from a previous walk session
        // (e.g. after a hot-reload or rapid stop/restart), remove it before
        // creating a new one. Without this guard, the old subscription leaks
        // and fires handleLocationUpdate for the previous walk's lifecycle,
        // causing duplicate location events and potential state corruption.
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
                  notificationColor: "#081827",
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
    // executeStopWalkSync sets isWalkingRef.current = false before calling
    // narration.stop() (which tears down the active player, including its
    // lock-screen registration — see teardownActive in useNarration.ts) so
    // no late-firing effect can observe isWalkingRef as still true.
    executeStopWalkSync({
      isWalkingRef,
      narrationStop: narration.stop,
    });
    setIsWalking(false);
    addWalkBreadcrumb("walk stopped");
    // Reset narration anchor + diagnostics so the next walk starts fresh.
    narrationStartLocationRef.current = null;
    narrationStartTimeRef.current = 0;
    resetWalkDiagnostics();
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
    // Clear turn-by-turn state so the planning view's banner / list don't
    // show stale steps the next time the screen mounts.
    routeStepsRef.current = [];
    announcedStepsRef.current = new Set();
    setRouteSteps([]);
    setNextTurn(null);
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

  // Single authoritative "active story" signal: the place the audio engine is
  // currently speaking, looked up by id from nearbyPlaces so it always carries
  // fresh coordinates and metadata. Null between stories.
  const activeNarrationPlace = useMemo(
    () =>
      narration.currentPlaceId != null
        ? (nearbyPlaces.find((p) => p.id === narration.currentPlaceId) ?? null)
        : null,
    [nearbyPlaces, narration.currentPlaceId],
  );

  // Non-null only during the prefetch window: a place that has been enqueued
  // (via enqueueNarration) but whose audio has not yet started playing. Becomes
  // null the moment the audio engine picks it up (narration.currentPlaceId
  // changes to match).
  const queuedNarrationPlace = useMemo(
    () =>
      currentNarrationPlace !== null &&
      currentNarrationPlace.id !== narration.currentPlaceId
        ? currentNarrationPlace
        : null,
    [currentNarrationPlace, narration.currentPlaceId],
  );

  const contextValue = useMemo(
    () => ({
      isWalking,
      startWalk,
      stopWalk,
      currentLocation,
      locationError,
      nearbyPlaces,
      narratedIds,
      stats,
      narration,
      isLoading,
      density,
      setDensity,
      currentNarrationPlace,
      activeNarrationPlace,
      queuedNarrationPlace,
      isReplay,
      fetchPlacesAlongRoute,
      enabledBuildingGroups,
      setEnabledBuildingGroups,
      prefetchStats,
      showPrefetchStats,
      setShowPrefetchStats,
      walkDebugEnabled,
      setWalkDebugEnabled,
      narrationIsPassed,
      routeSteps,
      nextTurn,
      playPlace,
    }),
    [
      isWalking,
      startWalk,
      stopWalk,
      currentLocation,
      locationError,
      nearbyPlaces,
      narratedIds,
      stats,
      narration,
      isLoading,
      density,
      setDensity,
      currentNarrationPlace,
      activeNarrationPlace,
      queuedNarrationPlace,
      isReplay,
      fetchPlacesAlongRoute,
      enabledBuildingGroups,
      setEnabledBuildingGroups,
      prefetchStats,
      showPrefetchStats,
      setShowPrefetchStats,
      walkDebugEnabled,
      setWalkDebugEnabled,
      narrationIsPassed,
      routeSteps,
      nextTurn,
      playPlace,
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
