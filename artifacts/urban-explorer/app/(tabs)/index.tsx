import {
  STARTUP_KEYS,
  getStartupValue,
  setStartupValue,
} from "@/lib/startupStorage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  FadeOutUp,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRouter } from "expo-router";

import { ExploreDebugOverlay } from "@/components/ExploreDebugOverlay";
import { LanguagePickerModal } from "@/components/LanguagePickerModal";
import { LoadingMessages } from "@/components/LoadingMessages";
import { StillLoadingHint } from "@/components/StillLoadingHint";
import { LocationPermission } from "@/components/LocationPermission";
import {
  computeSpatialWarnings,
  toExploreDebugPlace,
  type ExploreSnapshot,
  type ExploreSourceMode,
} from "@/lib/exploreDiagnostics";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceCardSkeleton } from "@/components/PlaceCardSkeleton";
import { PlaceMapView } from "@/components/PlaceMapView";
import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";
import { useRatingPaceWarning } from "@/hooks/useRatingPaceWarning";
import { markStartupPhase } from "@/lib/coldStart";
import {
  useDiscoverPlaces,
  useGeocodeLocation,
} from "@workspace/api-client-react";

interface DiscoveredPlace {
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

const DRIFT_THRESHOLD_METERS = 150;

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type ViewMode = "list" | "map";

export default function ExploreScreen() {
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationCalibrating, setLocationCalibrating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [searchRadius, setSearchRadius] = useState<150 | 300 | 500>(300);

  const [manualCoords, setManualCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 60 s client-side cap. Server worst-case: brainstorm (≤8 s) + main LLM
  // (≤35 s) = 43 s; 60 s gives 17 s of network + OpenAI variance headroom and
  // lets the server-side 503 path fire before the client times out, so the
  // retry button gets shown instead of a generic network error.
  const discoverMutation = useDiscoverPlaces({ request: { timeout: 60_000 } });
  const isBusy =
    discoverMutation.isError &&
    ((discoverMutation.error as any)?.status === 429 ||
      (discoverMutation.error as any)?.status === 503);
  const mapDiscoverMutation = useDiscoverPlaces();
  const geocodeMutation = useGeocodeLocation();

  const [mapPlaces, setMapPlaces] = useState<DiscoveredPlace[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const mapPlacesRef = useRef<DiscoveredPlace[]>([]);
  const mapPendingCenterRef = useRef<{ lat: number; lng: number } | null>(null);

  const [places, setPlaces] = useState<DiscoveredPlace[]>([]);
  const [areaName, setAreaName] = useState<string>("");
  const [areaNameSrc, setAreaNameSrc] = useState<string>("unknown");

  const allMapPlaces = useMemo(() => {
    const combined = [...places, ...mapPlaces];
    const seenIds = new Set<string>();
    const seenCoords = new Set<string>();
    return combined.filter((p) => {
      // Dedup by id first — PlaceMapView uses id as the React key, so any
      // duplicate id produces a "two children with the same key" error even
      // when coordinates differ slightly (e.g. after Nominatim correction).
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      // Also dedup by name+coords to catch places the AI returned with
      // different ids but pointing to the same physical location.
      const coordKey = `${p.name}-${p.latitude.toFixed(4)}-${p.longitude.toFixed(4)}`;
      if (seenCoords.has(coordKey)) return false;
      seenCoords.add(coordKey);
      return true;
    });
  }, [places, mapPlaces]);

  const sortedPlaces = useMemo(
    () => [...places].sort((a, b) => (b.netScore ?? 0) - (a.netScore ?? 0)),
    [places],
  );

  const closestPrefill = useMemo(() => {
    if (places.length === 0) return undefined;
    const withDist = places.filter((p) => typeof p.distanceMeters === "number");
    const closest =
      withDist.length > 0
        ? withDist.reduce((a, b) =>
            (a.distanceMeters ?? Infinity) <= (b.distanceMeters ?? Infinity)
              ? a
              : b,
          )
        : places[0];
    return closest.address || closest.name || undefined;
  }, [places]);

  const [exploreDebugEnabled, setExploreDebugEnabled] = useState(false);
  const [searchCenterCoords, setSearchCenterCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const selectedPlace = useMemo(() => {
    if (expandedId === null) return sortedPlaces[0] ?? null;
    return (
      allMapPlaces.find((p) => p.id === expandedId) ?? sortedPlaces[0] ?? null
    );
  }, [expandedId, sortedPlaces, allMapPlaces]);

  const exploreSnapshot = useMemo((): ExploreSnapshot | null => {
    if (!exploreDebugEnabled || !searchCenterCoords) return null;
    const mode: ExploreSourceMode = manualCoords ? "manual" : "gps";
    const userGps = location
      ? {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? null,
        }
      : null;
    const topPlaces = [...sortedPlaces, ...mapPlaces]
      .slice(0, 5)
      .map((p) => toExploreDebugPlace(p, searchCenterCoords, userGps));
    const sel = selectedPlace
      ? toExploreDebugPlace(selectedPlace, searchCenterCoords, userGps)
      : null;
    return {
      ts: Date.now(),
      mode,
      userGps,
      searchCenter: searchCenterCoords,
      mapCenter: mapPendingCenterRef.current
        ? {
            latitude: mapPendingCenterRef.current.lat,
            longitude: mapPendingCenterRef.current.lng,
          }
        : null,
      searchRadius,
      areaName,
      areaNameSrc,
      totalPlaces: allMapPlaces.length,
      topPlaces,
      selectedPlace: sel,
      spatialWarnings: sel ? computeSpatialWarnings(sel, searchRadius) : [],
    };
  }, [
    exploreDebugEnabled,
    searchCenterCoords,
    manualCoords,
    location,
    sortedPlaces,
    mapPlaces,
    selectedPlace,
    searchRadius,
    areaName,
    areaNameSrc,
    allMapPlaces.length,
  ]);

  const [showStillLoading, setShowStillLoading] = useState(false);

  useEffect(() => {
    if (discoverMutation.isPending) {
      const timer = setTimeout(() => setShowStillLoading(true), 3_000);
      return () => clearTimeout(timer);
    } else {
      setShowStillLoading(false);
    }
  }, [discoverMutation.isPending]);

  const {
    showWarning: showRatingPaceWarning,
    recordRating,
    dismissWarning,
  } = useRatingPaceWarning();

  const WALK_BANNER_KEY = STARTUP_KEYS.walkBannerDismissed;
  const [showWalkBanner, setShowWalkBanner] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Reads via the batched startup multiGet — see lib/startupStorage.ts.
    getStartupValue(WALK_BANNER_KEY).then((val) => {
      if (cancelled) return;
      if (val !== null) setShowWalkBanner(false);
    });
    return () => {
      cancelled = true;
    };
  }, [WALK_BANNER_KEY]);

  useEffect(() => {
    let cancelled = false;
    getStartupValue(STARTUP_KEYS.exploreDebugOverlayEnabled).then((val) => {
      if (!cancelled && val === "1") setExploreDebugEnabled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissWalkBanner = useCallback(() => {
    setShowWalkBanner(false);
    // Use the write-through helper so a later getStartupValue() — e.g. on
    // re-mount — sees the dismissal instead of the boot snapshot.
    setStartupValue(WALK_BANNER_KEY, "1").catch(() => {});
  }, [WALK_BANNER_KEY]);

  const handleWalkBannerTap = useCallback(() => {
    dismissWalkBanner();
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/walk");
  }, [dismissWalkBanner, router]);

  const handlePlaceRated = useCallback(
    (
      placeId: string,
      newRating: "up" | "down" | null,
      prevRating: "up" | "down" | null,
    ) => {
      const delta =
        (newRating === "up" ? 1 : newRating === "down" ? -1 : 0) -
        (prevRating === "up" ? 1 : prevRating === "down" ? -1 : 0);
      if (delta === 0) return;
      if (newRating !== null) {
        recordRating();
      }
      setPlaces((prev) =>
        prev.map((p) => {
          const id = `${p.name}-${p.latitude}-${p.longitude}`;
          if (id !== placeId) return p;
          return { ...p, netScore: (p.netScore ?? 0) + delta };
        }),
      );
    },
    [recordRating],
  );

  const handleToggleExpand = useCallback(
    (itemId: string, isExpanded: boolean) => {
      setExpandedId(isExpanded ? null : itemId);
    },
    [],
  );

  const renderPlaceItem = useCallback(
    ({ item, index }: { item: DiscoveredPlace; index: number }) => {
      const isExpanded =
        expandedId === item.id || (expandedId === null && index === 0);
      const card = (
        <PlaceCard
          place={item}
          index={index}
          expanded={isExpanded}
          onToggleExpand={handleToggleExpand}
          onRate={handlePlaceRated}
        />
      );
      if (index !== 0) return card;
      return (
        <View
          style={{
            borderRadius: 16,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 14,
            elevation: 3,
            marginBottom: 2,
          }}
        >
          {card}
        </View>
      );
    },
    [expandedId, handleToggleExpand, handlePlaceRated, colors.primary],
  );

  const effectiveLatitude =
    manualCoords?.latitude ?? location?.coords.latitude ?? 0;
  const effectiveLongitude =
    manualCoords?.longitude ?? location?.coords.longitude ?? 0;
  const hasCoords = !!(manualCoords || location);

  const getLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationCalibrating(false);
    const accuracyPref =
      Platform.OS === "web"
        ? Location.Accuracy.High
        : Location.Accuracy.BestForNavigation;
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => {
      let timerId: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([
        p.then((v) => {
          clearTimeout(timerId);
          return v;
        }),
        new Promise<T>((_, reject) => {
          timerId = setTimeout(() => reject(new Error("location-timeout")), ms);
        }),
      ]);
    };

    // Fast-path: if the OS has a recent cached fix (< 2 min old, < 200 m
    // accuracy), seed the UI with it immediately so the map and discovery
    // pipeline can start working while we still try for a fresher fix.
    // This eliminates the up-to-10 s blocking GPS wait that new users
    // would otherwise sit through on every cold launch.
    let seeded: Location.LocationObject | null = null;
    try {
      const last = await Location.getLastKnownPositionAsync({
        maxAge: 2 * 60 * 1000,
        requiredAccuracy: 200,
      });
      if (last) {
        seeded = last;
        setLocation(last);
      }
    } catch {
      /* ignore */
    }

    try {
      let first: Location.LocationObject;
      try {
        first = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: accuracyPref }),
          6000,
        );
      } catch {
        if (seeded) return seeded;
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last) {
            setLocation(last);
            return last;
          }
        } catch {
          /* ignore */
        }
        return null;
      }
      const firstAcc = first.coords.accuracy ?? 9999;
      if (firstAcc <= 100) {
        setLocation(first);
        return first;
      }
      setLocationCalibrating(true);
      try {
        const second = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: accuracyPref }),
          3000,
        );
        const secondAcc = second.coords.accuracy ?? 9999;
        const best = secondAcc < firstAcc ? second : first;
        setLocation(best);
        return best;
      } catch {
        setLocation(first);
        return first;
      }
    } finally {
      setLocationCalibrating(false);
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permission?.granted && !location && !manualCoords) {
      getLocation();
    }
  }, [permission?.granted, location, manualCoords, getLocation]);

  const lastDiscoverCoordsRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  // Tracks the GPS accuracy (meters) that was in effect when the last
  // discovery fired. Used to decide whether an incoming higher-accuracy fix
  // warrants a re-discovery at the corrected position.
  const lastDiscoverAccuracyRef = useRef<number | null>(null);
  const [driftMeters, setDriftMeters] = useState(0);

  // Continuously watch GPS so the location stays fresh as the user walks.
  // Only active when using real GPS (not a manually typed address).
  const lastSetDriftRef = useRef(0);

  useEffect(() => {
    if (!permission?.granted || manualCoords) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 20,
            timeInterval: 15000,
          },
          (loc) => {
            if (cancelled) return;
            setLocation(loc);
            if (lastDiscoverCoordsRef.current) {
              const d = haversineMeters(
                loc.coords.latitude,
                loc.coords.longitude,
                lastDiscoverCoordsRef.current.latitude,
                lastDiscoverCoordsRef.current.longitude,
              );
              if (Math.abs(d - lastSetDriftRef.current) >= 10) {
                lastSetDriftRef.current = d;
                setDriftMeters(d);
              }
            }
          },
        );
        if (cancelled) {
          resolved.remove();
          return;
        }
        sub = resolved;
      } catch {
        // Silently ignore errors starting the watcher (e.g. permissions revoked mid-session).
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
    // Re-run only when permission changes or the user toggles manual coords.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted, !!manualCoords]);

  const discoverRequestRef = useRef(0);
  const discoverAt = useCallback(
    (
      lat: number,
      lng: number,
      accuracy?: number | null,
      radiusOverride?: 150 | 300 | 500,
    ) => {
      const requestId = ++discoverRequestRef.current;
      const r = radiusOverride ?? searchRadius;
      lastDiscoverCoordsRef.current = { latitude: lat, longitude: lng };
      setSearchCenterCoords({ latitude: lat, longitude: lng });
      lastDiscoverAccuracyRef.current =
        typeof accuracy === "number" && Number.isFinite(accuracy)
          ? accuracy
          : null;
      lastSetDriftRef.current = 0;
      setDriftMeters(0);
      setExpandedId(null);
      setMapPlaces([]);
      mapPlacesRef.current = [];
      discoverMutation.mutate(
        {
          data: {
            latitude: lat,
            longitude: lng,
            radius: r,
            ...(typeof accuracy === "number" && Number.isFinite(accuracy)
              ? { accuracy }
              : {}),
          },
        },
        {
          onSuccess: (data: any) => {
            // Race guard: only commit if this is still the latest request.
            if (requestId !== discoverRequestRef.current) return;
            setPlaces((data?.places as DiscoveredPlace[] | undefined) ?? []);
            setAreaName((data?.location as string | undefined) ?? "");
            setAreaNameSrc((data?.locationSrc as string | undefined) ?? "unknown");
            // Cold-start phase marker — only the first call lands; subsequent
            // discovers are no-ops on the recorder.
            markStartupPhase("exploreFirstResponse");
          },
          onError: (_err: any) => {
            markStartupPhase("exploreFirstResponse");
          },
        },
      );
    },
    [discoverMutation, searchRadius],
  );

  const mapRegionRequestRef = useRef(0);

  const handleMapRegionDiscover = useCallback(
    (lat: number, lng: number) => {
      const requestId = ++mapRegionRequestRef.current;
      setMapLoading(true);
      mapDiscoverMutation.mutate(
        {
          data: {
            latitude: lat,
            longitude: lng,
            radius: 500,
            mode: "quick" as const,
          },
        },
        {
          onSuccess: (data: any) => {
            // Drop result if a newer pan fired while this one was in-flight.
            if (requestId !== mapRegionRequestRef.current) return;
            const newPlaces =
              (data?.places as DiscoveredPlace[] | undefined) ?? [];
            if (newPlaces.length > 0) {
              const existing = new Set(
                mapPlacesRef.current.map(
                  (p) =>
                    `${p.name}-${p.latitude.toFixed(4)}-${p.longitude.toFixed(4)}`,
                ),
              );
              const fresh = newPlaces.filter((p) => {
                const key = `${p.name}-${p.latitude.toFixed(4)}-${p.longitude.toFixed(4)}`;
                return !existing.has(key);
              });
              const updated = [...mapPlacesRef.current, ...fresh];
              mapPlacesRef.current = updated;
              setMapPlaces(updated);
            }
            setMapLoading(false);
          },
          onError: () => {
            if (requestId !== mapRegionRequestRef.current) return;
            setMapLoading(false);
          },
        },
      );
    },
    [mapDiscoverMutation],
  );

  const handlePendingCenterChange = useCallback(
    (c: { lat: number; lng: number } | null) => {
      mapPendingCenterRef.current = c;
    },
    [],
  );

  const handleDiscover = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (manualCoords) {
      discoverAt(manualCoords.latitude, manualCoords.longitude);
      return;
    }
    let loc = location;
    if (!loc) {
      loc = await getLocation();
    }
    if (loc) {
      discoverAt(
        loc.coords.latitude,
        loc.coords.longitude,
        loc.coords.accuracy,
      );
    }
  }, [location, manualCoords, discoverAt, getLocation]);

  const handleManualLocation = useCallback(
    (query: string) => {
      setGeocodeError(null);
      geocodeMutation.mutate(
        { data: { query } },
        {
          onSuccess: (data: any) => {
            if (
              typeof data?.latitude === "number" &&
              typeof data?.longitude === "number"
            ) {
              const coords = {
                latitude: data.latitude,
                longitude: data.longitude,
              };
              setManualCoords(coords);
              setShowLocationSearch(false);
              discoverAt(coords.latitude, coords.longitude);
            } else {
              setGeocodeError(t.explore.locationNotFound);
            }
          },
          onError: (err: any) => {
            setGeocodeError(
              err?.status === 429 || err?.status === 503
                ? t.explore.locationServiceBusy
                : t.common.somethingWrong,
            );
          },
        },
      );
    },
    [geocodeMutation, discoverAt, t],
  );

  useEffect(() => {
    if (!location || manualCoords || discoverMutation.isPending) return;

    const { latitude, longitude, accuracy } = location.coords;

    if (!discoverMutation.data) {
      // First discovery — no prior results yet.
      discoverAt(latitude, longitude, accuracy);
      return;
    }

    // Accuracy-upgrade re-discovery: if the initial discovery was triggered
    // from a stale cached GPS fix (accuracy > 100 m) and we now have a fresh
    // high-accuracy lock (≤ 50 m) that places the user more than 80 m away
    // from where we discovered, silently re-run discovery at the correct spot.
    // This fires at most once per session: after re-discovery, lastDiscoverAccuracy
    // will be ≤ 50, so the condition can't trigger again.
    const lastCoords = lastDiscoverCoordsRef.current;
    const lastAcc = lastDiscoverAccuracyRef.current;
    if (
      lastCoords !== null &&
      typeof lastAcc === "number" &&
      lastAcc > 100 &&
      typeof accuracy === "number" &&
      accuracy <= 50 &&
      haversineMeters(
        latitude,
        longitude,
        lastCoords.latitude,
        lastCoords.longitude,
      ) > 80
    ) {
      discoverAt(latitude, longitude, accuracy);
    }

    // Only re-run when `location` changes. Adding discoverMutation state would
    // cause an infinite loop since discoverAt() mutates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const showLocationPermission =
    (!permission?.granted && !manualCoords) || showLocationSearch;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const showContent = places.length > 0 && !discoverMutation.isPending;

  const showDriftBanner =
    driftMeters >= DRIFT_THRESHOLD_METERS &&
    !discoverMutation.isPending &&
    places.length > 0 &&
    !manualCoords;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {showLocationPermission ? (
        <Animated.View
          style={styles.locationPermissionWrapper}
          exiting={Platform.OS !== "web" ? FadeOutUp.duration(300) : undefined}
        >
          <LocationPermission
            permission={permission}
            requestPermission={async () => {
              const result = await requestPermission();
              if (result.granted) {
                setShowLocationSearch(false);
              }
              return result;
            }}
            onManualLocation={handleManualLocation}
            isGeocoding={geocodeMutation.isPending}
            geocodeError={geocodeError}
            showBackButton={
              showLocationSearch && (permission?.granted || !!manualCoords)
            }
            onBack={() => setShowLocationSearch(false)}
            onWalkMode={() => {
              if (Platform.OS !== "web")
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/walk-mode");
            }}
            onWalkPlan={() => {
              if (Platform.OS !== "web")
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/walk-plan");
            }}
          />
        </Animated.View>
      ) : (
        <>
          <Animated.View
            entering={
              Platform.OS !== "web" ? FadeInDown.duration(300) : undefined
            }
            exiting={
              Platform.OS !== "web" ? FadeOutUp.duration(300) : undefined
            }
            style={[
              styles.header,
              {
                paddingTop: insets.top + webTopInset + 12,
                backgroundColor: colors.background,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.headerTopRow}>
              <Text
                style={[styles.greeting, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {locationCalibrating
                  ? t.explore.improvingGps
                  : locationLoading
                    ? t.explore.locating
                    : areaName || t.explore.readyToExplore}
                {!locationLoading && !manualCoords && location?.coords.accuracy
                  ? `  ·  ±${Math.round(location.coords.accuracy)}m`
                  : ""}
              </Text>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web")
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowLanguagePicker(true);
                }}
                style={({ pressed }) => [
                  styles.languageChip,
                  { backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t.languageModal.title}
              >
                <Feather
                  name="globe"
                  size={13}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
            <View style={styles.headerBottomRow}>
              <Text
                style={[styles.title, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {t.explore.discover}
              </Text>

              <View style={styles.headerActions}>
                {__DEV__ ? (
                  <Pressable
                    onPress={() => {
                      const next = !exploreDebugEnabled;
                      setExploreDebugEnabled(next);
                      setStartupValue(
                        STARTUP_KEYS.exploreDebugOverlayEnabled,
                        next ? "1" : "0",
                      ).catch(() => {});
                    }}
                    hitSlop={8}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: exploreDebugEnabled }}
                    accessibilityLabel="Explore debug overlay"
                    style={({ pressed }) => ({
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: exploreDebugEnabled
                        ? colors.primary
                        : colors.border,
                      backgroundColor: exploreDebugEnabled
                        ? colors.primary + "22"
                        : colors.muted,
                      opacity: pressed ? 0.75 : 1,
                      marginRight: 4,
                    })}
                  >
                    <Text
                      style={{
                        color: exploreDebugEnabled
                          ? colors.primary
                          : colors.mutedForeground,
                        fontSize: 11,
                        fontFamily: "Inter_600SemiBold",
                      }}
                    >
                      Dbg
                    </Text>
                  </Pressable>
                ) : null}
                {places.length > 0 && (
                  <View
                    style={[
                      styles.toggleContainer,
                      { backgroundColor: colors.muted },
                    ]}
                  >
                    <Pressable
                      onPress={() => {
                        setViewMode("list");
                        if (Platform.OS !== "web")
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                      }}
                      style={[
                        styles.toggleButton,
                        viewMode === "list" && { backgroundColor: colors.card },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="List view"
                      accessibilityState={{ selected: viewMode === "list" }}
                    >
                      <Feather
                        name="list"
                        size={16}
                        color={
                          viewMode === "list"
                            ? colors.foreground
                            : colors.mutedForeground
                        }
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setViewMode("map");
                        if (Platform.OS !== "web")
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                      }}
                      style={[
                        styles.toggleButton,
                        viewMode === "map" && { backgroundColor: colors.card },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Map view"
                      accessibilityState={{ selected: viewMode === "map" }}
                    >
                      <Feather
                        name="map"
                        size={16}
                        color={
                          viewMode === "map"
                            ? colors.foreground
                            : colors.mutedForeground
                        }
                      />
                    </Pressable>
                  </View>
                )}
                <Pressable
                  onPress={handleDiscover}
                  disabled={discoverMutation.isPending || locationLoading}
                  style={({ pressed }) => [
                    styles.iconHeaderBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed ? 0.85 : 1,
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Explore nearby places"
                >
                  {discoverMutation.isPending ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.primaryForeground}
                    />
                  ) : (
                    <Feather
                      name="compass"
                      size={20}
                      color={colors.primaryForeground}
                    />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== "web")
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: "/investigate",
                      params: {
                        ...(areaName ? { nearLocation: areaName } : {}),
                        ...(closestPrefill
                          ? { prefillAddress: closestPrefill }
                          : {}),
                      },
                    });
                  }}
                  style={({ pressed }) => [
                    styles.iconHeaderBtn,
                    {
                      backgroundColor: colors.muted,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Investigate a building by address"
                >
                  <Feather name="map-pin" size={17} color={colors.foreground} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setGeocodeError(null);
                    setShowLocationSearch(true);
                  }}
                  style={({ pressed }) => [
                    styles.iconHeaderBtn,
                    {
                      backgroundColor: colors.muted,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Search by location"
                >
                  <Feather name="search" size={18} color={colors.foreground} />
                </Pressable>
              </View>
            </View>
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
              Small stories hidden in ordinary places.
            </Text>
          </Animated.View>

          {(hasCoords || locationLoading) && (
            <Animated.View
              key={manualCoords ? "radius-manual" : "radius-gps"}
              entering={
                Platform.OS !== "web" ? FadeInDown.duration(300) : undefined
              }
              exiting={
                Platform.OS !== "web" ? FadeOutDown.duration(250) : undefined
              }
              style={[
                styles.radiusRow,
                {
                  borderBottomColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <Text
                style={[styles.radiusLabel, { color: colors.mutedForeground }]}
              >
                {t.explore.range}
              </Text>
              {([150, 300, 500] as const).map((r) => {
                const isActive = searchRadius === r;
                return (
                  <Pressable
                    key={`r-${r}`}
                    onPress={() => {
                      if (r === searchRadius) return;
                      setSearchRadius(r);
                      if (Platform.OS !== "web")
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const pendingCenter = mapPendingCenterRef.current;
                      if (pendingCenter) {
                        discoverAt(
                          pendingCenter.lat,
                          pendingCenter.lng,
                          null,
                          r,
                        );
                      } else if (manualCoords) {
                        discoverAt(
                          manualCoords.latitude,
                          manualCoords.longitude,
                          null,
                          r,
                        );
                      } else if (location) {
                        discoverAt(
                          location.coords.latitude,
                          location.coords.longitude,
                          location.coords.accuracy,
                          r,
                        );
                      }
                    }}
                    style={[
                      styles.radiusChip,
                      {
                        backgroundColor: isActive
                          ? colors.foreground
                          : colors.muted,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Set discovery range to ${r} meters`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      style={[
                        styles.radiusChipText,
                        {
                          color: isActive
                            ? colors.background
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      {r === 150
                        ? t.explore.rangeClose
                        : r === 300
                          ? t.explore.rangeMedium
                          : t.explore.rangeWide}{" "}
                      · {r}m
                    </Text>
                  </Pressable>
                );
              })}
            </Animated.View>
          )}

          {showDriftBanner && (
            <Animated.View
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(200)}
            >
              <Pressable
                onPress={handleDiscover}
                style={[
                  styles.driftBanner,
                  { backgroundColor: colors.primary },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`You've moved ${Math.round(driftMeters)}m — tap to refresh results for this area`}
              >
                <Feather
                  name="navigation"
                  size={14}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.driftBannerText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  {t.explore.driftBanner}
                </Text>
                <Feather
                  name="refresh-cw"
                  size={14}
                  color={colors.primaryForeground}
                />
              </Pressable>
            </Animated.View>
          )}

          {showWalkBanner && showContent && viewMode !== "map" ? (
            <Animated.View
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(200)}
            >
              <Pressable
                onPress={handleWalkBannerTap}
                style={[
                  styles.walkBannerOuter,
                  {
                    backgroundColor: colors.primary + "12",
                    borderColor: colors.primary + "30",
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Start listening nearby"
                accessibilityHint="Opens the Walk tab to wander or plan a route"
              >
                <View
                  style={[
                    styles.walkBannerIconWrap,
                    { backgroundColor: colors.primary + "20" },
                  ]}
                >
                  <Feather name="headphones" size={16} color={colors.primary} />
                </View>
                <View style={styles.walkBannerBody}>
                  <Text
                    style={[
                      styles.walkBannerTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    Start listening nearby
                  </Text>
                  <Text
                    style={[
                      styles.walkBannerSub,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Wander or plan a route with audio
                  </Text>
                </View>
                <Feather
                  name="chevron-right"
                  size={15}
                  color={colors.primary}
                  style={{ opacity: 0.7 }}
                />
                <Pressable
                  onPress={dismissWalkBanner}
                  hitSlop={14}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                  style={{ paddingLeft: 4 }}
                >
                  <Feather
                    name="x"
                    size={13}
                    color={colors.mutedForeground}
                    style={{ opacity: 0.6 }}
                  />
                </Pressable>
              </Pressable>
            </Animated.View>
          ) : null}

          {viewMode === "map" && places.length > 0 ? (
            <PlaceMapView
              places={allMapPlaces}
              userLatitude={effectiveLatitude}
              userLongitude={effectiveLongitude}
              onMapRegionDiscover={handleMapRegionDiscover}
              onPendingCenterChange={handlePendingCenterChange}
              isLoadingMore={mapLoading || discoverMutation.isPending}
            />
          ) : (
            <FlatList
              data={sortedPlaces}
              keyExtractor={(item) => item.id}
              renderItem={renderPlaceItem}
              contentContainerStyle={[
                styles.list,
                { paddingBottom: insets.bottom + webBottomInset + 90 },
              ]}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews
              windowSize={5}
              maxToRenderPerBatch={8}
              initialNumToRender={6}
              ListHeaderComponent={
                <View>
                  {showContent ? (
                    <>
                      <Pressable
                        onPress={() => {
                          if (Platform.OS !== "web")
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light,
                            );
                          router.push({
                            pathname: "/investigate",
                            params: {
                              ...(areaName ? { nearLocation: areaName } : {}),
                              ...(closestPrefill
                                ? { prefillAddress: closestPrefill }
                                : {}),
                            },
                          });
                        }}
                        style={({ pressed }) => [
                          styles.investigateCard,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            opacity: pressed ? 0.9 : 1,
                            transform: [{ scale: pressed ? 0.98 : 1 }],
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Investigate an Address"
                        accessibilityHint="Look up the history of a specific building by address"
                      >
                        <View style={styles.cardRow}>
                          <Feather
                            name="search"
                            size={20}
                            color={colors.foreground}
                          />
                          <View style={styles.cardRowText}>
                            <Text
                              style={[
                                styles.investigateCardTitle,
                                { color: colors.foreground },
                              ]}
                            >
                              {t.explore.investigateTitle}
                            </Text>
                            <Text
                              style={[
                                styles.investigateCardSubtitle,
                                { color: colors.mutedForeground },
                              ]}
                            >
                              {t.explore.investigateSubtitle}
                            </Text>
                          </View>
                          <Feather
                            name="chevron-right"
                            size={18}
                            color={colors.mutedForeground}
                          />
                        </View>
                      </Pressable>

                      {showRatingPaceWarning ? (
                        <Animated.View
                          entering={FadeIn.duration(250)}
                          exiting={FadeOut.duration(200)}
                          style={styles.ratingPaceWarning}
                          accessibilityRole="alert"
                          accessibilityLabel="You're rating quickly — pace yourself"
                        >
                          <Feather
                            name="clock"
                            size={14}
                            color={colors.mutedForeground}
                          />
                          <Text
                            style={[
                              styles.ratingPaceWarningText,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {t.explore.ratingPaceWarning}
                          </Text>
                          <Pressable
                            onPress={dismissWarning}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel="Dismiss warning"
                          >
                            <Feather
                              name="x"
                              size={14}
                              color={colors.mutedForeground}
                              style={{ opacity: 0.7 }}
                            />
                          </Pressable>
                        </Animated.View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              }
              refreshControl={
                <RefreshControl
                  refreshing={discoverMutation.isPending}
                  onRefresh={handleDiscover}
                  tintColor={colors.primary}
                />
              }
              ListEmptyComponent={
                discoverMutation.isPending ? (
                  <Animated.View
                    entering={Platform.OS !== "web" ? FadeIn : undefined}
                    style={styles.skeletonContainer}
                  >
                    <PlaceCardSkeleton count={4} />
                    <LoadingMessages variant="discovery" />
                    {showStillLoading ? (
                      <StillLoadingHint
                        hint={t.explore.stillLoading}
                        variant="fadeIn"
                        exiting={FadeOutDown.duration(300)}
                      />
                    ) : null}
                  </Animated.View>
                ) : discoverMutation.isError ? (
                  <View style={styles.emptyContainer}>
                    <Feather
                      name="alert-circle"
                      size={40}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[styles.emptyTitle, { color: colors.foreground }]}
                    >
                      {isBusy ? t.explore.busyTitle : t.explore.errorTitle}
                    </Text>
                    <Text
                      style={[
                        styles.emptyText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {isBusy ? t.explore.busyDetail : t.explore.errorDetail}
                    </Text>
                    <Pressable
                      onPress={handleDiscover}
                      style={({ pressed }) => [
                        styles.retryButton,
                        {
                          backgroundColor: colors.primary,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Retry discovering places"
                    >
                      <Feather
                        name="refresh-cw"
                        size={16}
                        color={colors.primaryForeground}
                      />
                      <Text
                        style={[
                          styles.retryText,
                          { color: colors.primaryForeground },
                        ]}
                      >
                        {t.common.retry}
                      </Text>
                    </Pressable>
                  </View>
                ) : discoverMutation.isSuccess ? (
                  <View style={styles.emptyContainer}>
                    <Feather
                      name="map-pin"
                      size={40}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[styles.emptyTitle, { color: colors.foreground }]}
                    >
                      {t.explore.nothingFoundTitle}
                    </Text>
                    <Text
                      style={[
                        styles.emptyText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {t.explore.nothingFoundDetail}
                    </Text>
                    <View style={styles.emptyActions}>
                      {searchRadius < 500 && (
                        <Pressable
                          onPress={() => {
                            const next = searchRadius === 150 ? 300 : 500;
                            setSearchRadius(next);
                            if (Platform.OS !== "web")
                              Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Light,
                              );
                            const coords =
                              manualCoords ??
                              (location
                                ? {
                                    latitude: location.coords.latitude,
                                    longitude: location.coords.longitude,
                                  }
                                : null);
                            if (coords)
                              discoverAt(
                                coords.latitude,
                                coords.longitude,
                                location?.coords.accuracy ?? null,
                                next,
                              );
                          }}
                          style={({ pressed }) => [
                            styles.retryButton,
                            {
                              backgroundColor: colors.primary,
                              opacity: pressed ? 0.85 : 1,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Try wider search range"
                        >
                          <Feather
                            name="maximize"
                            size={16}
                            color={colors.primaryForeground}
                          />
                          <Text
                            style={[
                              styles.retryText,
                              { color: colors.primaryForeground },
                            ]}
                          >
                            {t.explore.tryRange(
                              searchRadius === 150 ? 300 : 500,
                            )}
                          </Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={handleDiscover}
                        style={({ pressed }) => [
                          styles.retryButton,
                          {
                            backgroundColor: colors.muted,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Search again"
                      >
                        <Feather
                          name="refresh-cw"
                          size={16}
                          color={colors.foreground}
                        />
                        <Text
                          style={[
                            styles.retryText,
                            { color: colors.foreground },
                          ]}
                        >
                          {t.explore.searchAgain}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Feather
                      name="compass"
                      size={40}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[styles.emptyTitle, { color: colors.foreground }]}
                    >
                      {t.explore.startExploringTitle}
                    </Text>
                    <Text
                      style={[
                        styles.emptyText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {t.explore.startExploringDetail}
                    </Text>
                  </View>
                )
              }
            />
          )}
          <LanguagePickerModal
            visible={showLanguagePicker}
            onClose={() => setShowLanguagePicker(false)}
          />
        </>
      )}
      {exploreDebugEnabled && exploreSnapshot ? (
        <ExploreDebugOverlay explore={exploreSnapshot} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locationPermissionWrapper: {
    flex: 1,
  },
  header: {
    flexDirection: "column",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  languageChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconHeaderBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  greeting: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleContainer: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
  },
  toggleButton: {
    width: 38,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  radiusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  radiusLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginRight: 4,
  },
  radiusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    minWidth: 92,
    alignItems: "center",
  },
  radiusChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  cardRowText: {
    flex: 1,
  },
  investigateCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  investigateCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  investigateCardSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  list: {
    padding: 16,
    paddingTop: 12,
  },
  skeletonContainer: {
    paddingTop: 4,
    gap: 16,
    alignItems: "stretch",
  },

  emptyContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  driftBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  driftBannerText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
  },
  walkBannerOuter: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    gap: 10,
  },
  walkBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  walkBannerBody: {
    flex: 1,
    gap: 1,
  },
  walkBannerTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },
  walkBannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  tagline: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    marginTop: 3,
    opacity: 0.75,
  },
  ratingPaceWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(242, 162, 58, 0.10)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(242, 162, 58, 0.28)",
  },
  ratingPaceWarningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
