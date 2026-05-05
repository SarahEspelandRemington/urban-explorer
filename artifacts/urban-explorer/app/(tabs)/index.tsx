import { STARTUP_KEYS, getStartupValue, setStartupValue } from "@/lib/startupStorage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRouter } from "expo-router";

import { LanguagePickerModal } from "@/components/LanguagePickerModal";
import { LoadingMessages } from "@/components/LoadingMessages";
import { StillLoadingHint } from "@/components/StillLoadingHint";
import { LocationPermission } from "@/components/LocationPermission";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceCardSkeleton } from "@/components/PlaceCardSkeleton";
import { PlaceMapView } from "@/components/PlaceMapView";
import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";
import { useRatingPaceWarning } from "@/hooks/useRatingPaceWarning";
import { markStartupPhase } from "@/lib/coldStart";
import { useDiscoverPlaces, useGeocodeLocation } from "@workspace/api-client-react";

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

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const OSM_CATEGORY_LABELS: Record<string, string> = {
  arts_centre: "Arts Center",
  place_of_worship: "Place of Worship",
  fast_food: "Fast Food",
  fire_station: "Fire Station",
  town_hall: "Town Hall",
  water_tower: "Water Tower",
  community_centre: "Community Center",
  social_facility: "Social Facility",
  parking_space: "Parking",
  parking_entrance: "Parking",
  bus_station: "Bus Station",
  railway_station: "Train Station",
  subway_entrance: "Subway",
  toilets: "Public Restroom",
  waste_basket: "Waste Bin",
  bicycle_parking: "Bike Parking",
  fuel: "Gas Station",
  car_wash: "Car Wash",
  charging_station: "Charging Station",
  ice_cream: "Ice Cream",
  food_court: "Food Court",
};

function formatCategoryLabel(cat: string): string {
  if (!cat) return "";
  const key = cat.toLowerCase().trim();
  if (OSM_CATEGORY_LABELS[key]) return OSM_CATEGORY_LABELS[key];
  return key
    .replace(/_+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEra(yearBuilt?: string): string | null {
  if (!yearBuilt || yearBuilt === "unknown") return null;
  const match = yearBuilt.match(/\d{4}|\d{3}0s/);
  if (!match) return null;
  const yearStr = match[0];
  const year = yearStr.endsWith("s") ? parseInt(yearStr.slice(0, -1), 10) : parseInt(yearStr, 10);
  if (isNaN(year)) return null;
  if (year < 1850) return "Pre-1850";
  if (year < 1900) return "1850–1900";
  if (year < 1930) return "1900–1930";
  if (year < 1960) return "1930–1960";
  if (year < 1990) return "1960–1990";
  return "1990+";
}

type ViewMode = "list" | "map";

export default function ExploreScreen() {
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationCalibrating, setLocationCalibrating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [searchRadius, setSearchRadius] = useState<150 | 300 | 500>(300);

  const [manualCoords, setManualCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 25 s client-side cap so the mutation surfaces an error (and shows the
  // retry button) before the 30 s global fetch default.  The server-side LLM
  // cap is 15 s; total worst-case wall-clock is ~24 s, so 25 s gives a 1 s
  // buffer without letting the client hang noticeably longer.
  const discoverMutation = useDiscoverPlaces({ request: { timeout: 25_000 } });
  const mapDiscoverMutation = useDiscoverPlaces();
  const geocodeMutation = useGeocodeLocation();

  const [mapPlaces, setMapPlaces] = useState<DiscoveredPlace[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const mapPlacesRef = useRef<DiscoveredPlace[]>([]);

  const [places, setPlaces] = useState<DiscoveredPlace[]>([]);
  const [areaName, setAreaName] = useState<string>("");

  const allMapPlaces = useMemo(() => {
    const combined = [...places, ...mapPlaces];
    const seen = new Set<string>();
    return combined.filter((p) => {
      const key = `${p.name}-${p.latitude.toFixed(4)}-${p.longitude.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [places, mapPlaces]);

  const filterGroups = useMemo(() => {
    const cats = [...new Set(places.map((p) => p.category))].sort();
    const eras = [...new Set(places.map((p) => getEra(p.yearBuilt)).filter(Boolean))] as string[];
    const eraOrder = ["Pre-1850", "1850–1900", "1900–1930", "1930–1960", "1960–1990", "1990+"];
    eras.sort((a, b) => eraOrder.indexOf(a) - eraOrder.indexOf(b));
    const allTags = places.flatMap((p) => p.tags || []);
    const tagCounts = new Map<string, number>();
    allTags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
    const tags = [...tagCounts.keys()].sort((a, b) => (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0));
    return { categories: cats, eras, tags };
  }, [places]);

  const allFilters = useMemo(() => [
    ...filterGroups.categories,
    ...filterGroups.eras,
    ...filterGroups.tags,
  ], [filterGroups]);

  const filteredPlaces = useMemo(() => {
    const filtered = activeFilters.size === 0
      ? places
      : places.filter((p) => {
          const placeEra = getEra(p.yearBuilt);
          const placeTags = new Set([
            p.category,
            ...(placeEra ? [placeEra] : []),
            ...(p.tags || []),
          ]);
          for (const f of activeFilters) {
            if (placeTags.has(f)) return true;
          }
          return false;
        });
    return [...filtered].sort((a, b) => (b.netScore ?? 0) - (a.netScore ?? 0));
  }, [places, activeFilters]);

  const [showStillLoading, setShowStillLoading] = useState(false);

  useEffect(() => {
    if (discoverMutation.isPending) {
      const timer = setTimeout(() => setShowStillLoading(true), 10_000);
      return () => clearTimeout(timer);
    } else {
      setShowStillLoading(false);
    }
  }, [discoverMutation.isPending]);

  const { showWarning: showRatingPaceWarning, recordRating, dismissWarning } = useRatingPaceWarning();

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

  const dismissWalkBanner = useCallback(() => {
    setShowWalkBanner(false);
    // Use the write-through helper so a later getStartupValue() — e.g. on
    // re-mount — sees the dismissal instead of the boot snapshot.
    setStartupValue(WALK_BANNER_KEY, "1").catch(() => {});
  }, [WALK_BANNER_KEY]);

  const handleWalkBannerTap = useCallback(() => {
    dismissWalkBanner();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/walk");
  }, [dismissWalkBanner, router]);

  const handlePlaceRated = useCallback(
    (placeId: string, newRating: "up" | "down" | null, prevRating: "up" | "down" | null) => {
      const delta = (newRating === "up" ? 1 : newRating === "down" ? -1 : 0) - (prevRating === "up" ? 1 : prevRating === "down" ? -1 : 0);
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

  const handleToggleExpand = useCallback((itemId: string, isExpanded: boolean) => {
    setExpandedId(isExpanded ? null : itemId);
  }, []);

  const renderPlaceItem = useCallback(
    ({ item, index }: { item: DiscoveredPlace; index: number }) => {
      const isExpanded = expandedId === item.id || (expandedId === null && index === 0);
      return (
        <PlaceCard
          place={item}
          index={index}
          expanded={isExpanded}
          onToggleExpand={handleToggleExpand}
          onRate={handlePlaceRated}
        />
      );
    },
    [expandedId, handleToggleExpand, handlePlaceRated],
  );

  const effectiveLatitude = manualCoords?.latitude ?? location?.coords.latitude ?? 0;
  const effectiveLongitude = manualCoords?.longitude ?? location?.coords.longitude ?? 0;
  const hasCoords = !!(manualCoords || location);

  const getLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationCalibrating(false);
    const accuracyPref =
      Platform.OS === "web" ? Location.Accuracy.High : Location.Accuracy.BestForNavigation;
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => {
      let timerId: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([
        p.then((v) => { clearTimeout(timerId); return v; }),
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

  const lastDiscoverCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
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
    (lat: number, lng: number, accuracy?: number | null, radiusOverride?: 150 | 300 | 500) => {
      const requestId = ++discoverRequestRef.current;
      const r = radiusOverride ?? searchRadius;
      lastDiscoverCoordsRef.current = { latitude: lat, longitude: lng };
      lastSetDriftRef.current = 0;
      setDriftMeters(0);
      setActiveFilters(new Set());
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
      // Invalidate any pending auto-discover so its slow result can't
      // overwrite the map after the user has already panned away.
      discoverRequestRef.current++;
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
            const newPlaces = (data?.places as DiscoveredPlace[] | undefined) ?? [];
            if (newPlaces.length > 0) {
              const existing = new Set(
                mapPlacesRef.current.map(
                  (p) => `${p.name}-${p.latitude.toFixed(4)}-${p.longitude.toFixed(4)}`,
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
      discoverAt(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy);
    }
  }, [location, manualCoords, discoverAt, getLocation]);

  const handleManualLocation = useCallback(
    (query: string) => {
      setGeocodeError(null);
      geocodeMutation.mutate(
        { data: { query } },
        {
          onSuccess: (data: any) => {
            if (typeof data?.latitude === "number" && typeof data?.longitude === "number") {
              const coords = { latitude: data.latitude, longitude: data.longitude };
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
    if (location && !manualCoords && !discoverMutation.data && !discoverMutation.isPending) {
      discoverAt(location.coords.latitude, location.coords.longitude, location.coords.accuracy);
    }
    // Only re-run on `location` change. Adding mutation state would cause an
    // infinite loop because discoverAt() sets discoverMutation.data itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  if ((!permission?.granted && !manualCoords) || showLocationSearch) {
    return (
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
        showBackButton={showLocationSearch && (permission?.granted || !!manualCoords)}
        onBack={() => setShowLocationSearch(false)}
        onWalkMode={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/walk-mode");
        }}
        onWalkPlan={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/walk-plan");
        }}
      />
    );
  }

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
      <View
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
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowLanguagePicker(true);
            }}
            style={({ pressed }) => [
              styles.languageChip,
              { backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Walk notification language"
          >
            <Feather name="globe" size={13} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <View style={styles.headerBottomRow}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {t.explore.discover}
          </Text>
          <View style={styles.headerActions}>
            {showContent && (
              <View style={[styles.toggleContainer, { backgroundColor: colors.muted }]}>
                <Pressable
                  onPress={() => { setViewMode("list"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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
                    color={viewMode === "list" ? colors.foreground : colors.mutedForeground}
                  />
                </Pressable>
                <Pressable
                  onPress={() => { setViewMode("map"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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
                    color={viewMode === "map" ? colors.foreground : colors.mutedForeground}
                  />
                </Pressable>
              </View>
            )}
            <Pressable
              onPress={handleDiscover}
              disabled={discoverMutation.isPending || locationLoading}
              style={({ pressed }) => [
                styles.labeledHeaderBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Discover nearby places"
            >
              {discoverMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Feather name="compass" size={20} color={colors.primaryForeground} />
              )}
              <Text style={[styles.labeledHeaderBtnText, { color: colors.primaryForeground }]}>
                Discover
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setGeocodeError(null); setShowLocationSearch(true); }}
              style={({ pressed }) => [
                styles.labeledHeaderBtn,
                { backgroundColor: colors.muted, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Search by location"
            >
              <Feather name="search" size={18} color={colors.foreground} />
              <Text style={[styles.labeledHeaderBtnText, { color: colors.mutedForeground }]}>
                Search
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {(hasCoords || locationLoading) && (
        <View style={[styles.radiusRow, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.radiusLabel, { color: colors.mutedForeground }]}>{t.explore.range}</Text>
          {([150, 300, 500] as const).map((r) => {
            const isActive = searchRadius === r;
            return (
              <Pressable
                key={`r-${r}`}
                onPress={() => {
                  if (r === searchRadius) return;
                  setSearchRadius(r);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (manualCoords) {
                    discoverAt(manualCoords.latitude, manualCoords.longitude, null, r);
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
                  { backgroundColor: isActive ? colors.foreground : colors.muted },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Set discovery range to ${r} meters`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.radiusChipText,
                    { color: isActive ? colors.background : colors.mutedForeground },
                  ]}
                >
                  {r === 150 ? t.explore.rangeClose : r === 300 ? t.explore.rangeMedium : t.explore.rangeWide} · {r}m
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {showContent && allFilters.length > 1 && (
        <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            <Pressable
              onPress={() => {
                setActiveFilters(new Set());
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: activeFilters.size === 0 ? colors.foreground : colors.muted,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Show all categories"
              accessibilityState={{ selected: activeFilters.size === 0 }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: activeFilters.size === 0 ? colors.background : colors.mutedForeground },
                ]}
              >
                {t.explore.all}
              </Text>
            </Pressable>
            {filterGroups.categories.length > 1 && filterGroups.categories.map((cat) => {
              const isActive = activeFilters.has(cat);
              return (
                <Pressable
                  key={`cat-${cat}`}
                  onPress={() => {
                    setActiveFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(cat)) next.delete(cat); else next.add(cat);
                      return next;
                    });
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isActive ? colors.foreground : colors.muted,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${formatCategoryLabel(cat)}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: isActive ? colors.background : colors.mutedForeground },
                    ]}
                    numberOfLines={1}
                  >
                    {formatCategoryLabel(cat)}
                  </Text>
                </Pressable>
              );
            })}
            {filterGroups.eras.length > 0 && (
              <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />
            )}
            {filterGroups.eras.map((era) => {
              const isActive = activeFilters.has(era);
              return (
                <Pressable
                  key={`era-${era}`}
                  onPress={() => {
                    setActiveFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(era)) next.delete(era); else next.add(era);
                      return next;
                    });
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={[
                    styles.filterChip,
                    styles.filterChipEra,
                    {
                      backgroundColor: isActive ? colors.primary : colors.primary + "15",
                      borderColor: colors.primary + "30",
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by era: ${era}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Feather name="clock" size={11} color={isActive ? colors.primaryForeground : colors.primary} />
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: isActive ? colors.primaryForeground : colors.primary },
                    ]}
                  >
                    {era}
                  </Text>
                </Pressable>
              );
            })}
            {filterGroups.tags.length > 0 && (
              <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />
            )}
            {filterGroups.tags.map((tag) => {
              const isActive = activeFilters.has(tag);
              return (
                <Pressable
                  key={`tag-${tag}`}
                  onPress={() => {
                    setActiveFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(tag)) next.delete(tag); else next.add(tag);
                      return next;
                    });
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isActive ? colors.foreground : colors.muted,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by tag: ${tag}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: isActive ? colors.background : colors.mutedForeground },
                    ]}
                  >
                    #{tag}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {showDriftBanner && (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
        >
          <Pressable
            onPress={handleDiscover}
            style={[styles.driftBanner, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel={`You've moved ${Math.round(driftMeters)}m — tap to refresh results for this area`}
          >
            <Feather name="navigation" size={14} color={colors.primaryForeground} />
            <Text style={[styles.driftBannerText, { color: colors.primaryForeground }]}>
              {t.explore.driftBanner}
            </Text>
            <Feather name="refresh-cw" size={14} color={colors.primaryForeground} />
          </Pressable>
        </Animated.View>
      )}

      {showContent && viewMode === "map" ? (
        <PlaceMapView
          places={allMapPlaces}
          userLatitude={effectiveLatitude}
          userLongitude={effectiveLongitude}
          onMapRegionDiscover={handleMapRegionDiscover}
          isLoadingMore={mapLoading}
        />
      ) : (
        <FlatList
          data={filteredPlaces}
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
              {showWalkBanner ? (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  exiting={FadeOut.duration(200)}
                  style={[styles.walkBanner, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
                >
                  <Pressable
                    onPress={handleWalkBannerTap}
                    style={styles.walkBannerContent}
                    accessibilityRole="button"
                    accessibilityLabel="Start Walking — tap to open Walk tab"
                    accessibilityHint="Opens the Walk tab to start your audio tour"
                  >
                    <Feather name="headphones" size={16} color={colors.primary} />
                    <Text style={[styles.walkBannerText, { color: colors.primary }]}>
                      Tap Walk tab to start your audio tour
                    </Text>
                    <Feather name="arrow-right" size={14} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={dismissWalkBanner}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss tip"
                  >
                    <Feather name="x" size={14} color={colors.primary} style={{ opacity: 0.6 }} />
                  </Pressable>
                </Animated.View>
              ) : null}

              {showContent ? (
                <>
                  <Pressable
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/investigate");
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
                      <Feather name="search" size={20} color={colors.foreground} />
                      <View style={styles.cardRowText}>
                        <Text style={[styles.investigateCardTitle, { color: colors.foreground }]}>
                          {t.explore.investigateTitle}
                        </Text>
                        <Text style={[styles.investigateCardSubtitle, { color: colors.mutedForeground }]}>
                          {t.explore.investigateSubtitle}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
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
                    <Feather name="clock" size={14} color="#92400e" />
                    <Text style={styles.ratingPaceWarningText}>
                      {t.explore.ratingPaceWarning}
                    </Text>
                    <Pressable
                      onPress={dismissWarning}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss warning"
                    >
                      <Feather name="x" size={14} color="#92400e" style={{ opacity: 0.7 }} />
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
                  <StillLoadingHint hint={t.explore.stillLoading} variant="fadeIn" exiting={FadeOut.duration(300)} />
                ) : null}
              </Animated.View>
            ) : discoverMutation.isError ? (
              <View style={styles.emptyContainer}>
                <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
                <Text
                  style={[styles.emptyTitle, { color: colors.foreground }]}
                >
                  {(discoverMutation.error as any)?.status === 429 || (discoverMutation.error as any)?.status === 503
                    ? t.explore.busyTitle
                    : t.explore.errorTitle}
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  {(discoverMutation.error as any)?.status === 429 || (discoverMutation.error as any)?.status === 503
                    ? t.explore.busyDetail
                    : t.explore.errorDetail}
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
                  <Feather name="refresh-cw" size={16} color={colors.primaryForeground} />
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
                <Feather name="map-pin" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {t.explore.nothingFoundTitle}
                </Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {t.explore.nothingFoundDetail}
                </Text>
                <View style={styles.emptyActions}>
                  {searchRadius < 500 && (
                    <Pressable
                      onPress={() => {
                        const next = searchRadius === 150 ? 300 : 500;
                        setSearchRadius(next);
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const coords = manualCoords ?? (location ? { latitude: location.coords.latitude, longitude: location.coords.longitude } : null);
                        if (coords) discoverAt(coords.latitude, coords.longitude, location?.coords.accuracy ?? null, next);
                      }}
                      style={({ pressed }) => [
                        styles.retryButton,
                        { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Try wider search range"
                    >
                      <Feather name="maximize" size={16} color={colors.primaryForeground} />
                      <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
                        {t.explore.tryRange(searchRadius === 150 ? 300 : 500)}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={handleDiscover}
                    style={({ pressed }) => [
                      styles.retryButton,
                      { backgroundColor: colors.muted, opacity: pressed ? 0.85 : 1 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Search again"
                  >
                    <Feather name="refresh-cw" size={16} color={colors.foreground} />
                    <Text style={[styles.retryText, { color: colors.foreground }]}>{t.explore.searchAgain}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Feather name="compass" size={40} color={colors.mutedForeground} />
                <Text
                  style={[styles.emptyTitle, { color: colors.foreground }]}
                >
                  {t.explore.startExploringTitle}
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  labeledHeaderBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 54,
  },
  labeledHeaderBtnText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
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
  filterRow: {
    borderBottomWidth: 1,
    paddingVertical: 10,
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
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  filterChipEra: {
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  filterDivider: {
    width: 1,
    height: 20,
    alignSelf: "center",
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
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 12,
  },
  skeletonContainer: {
    paddingTop: 4,
    gap: 16,
    alignItems: "stretch",
  },

  emptyContainer: {
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
  walkBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    gap: 8,
  },
  walkBannerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  walkBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
  },
  ratingPaceWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  ratingPaceWarningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#92400e",
  },
});
