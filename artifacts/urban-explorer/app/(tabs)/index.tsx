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
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRouter } from "expo-router";

import { LoadingMessages } from "@/components/LoadingMessages";
import { LocationPermission } from "@/components/LocationPermission";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceMapView } from "@/components/PlaceMapView";
import { useColors } from "@/hooks/useColors";
import { unlockWebSpeech } from "@/hooks/useNarration";
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationCalibrating, setLocationCalibrating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchRadius, setSearchRadius] = useState<150 | 300 | 500>(300);

  const [manualCoords, setManualCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const discoverMutation = useDiscoverPlaces();
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
    if (activeFilters.size === 0) return places;
    return places.filter((p) => {
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
  }, [places, activeFilters]);

  const effectiveLatitude = manualCoords?.latitude ?? location?.coords.latitude ?? 0;
  const effectiveLongitude = manualCoords?.longitude ?? location?.coords.longitude ?? 0;
  const hasCoords = !!(manualCoords || location);

  const getLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationCalibrating(false);
    const accuracyPref =
      Platform.OS === "web" ? Location.Accuracy.High : Location.Accuracy.BestForNavigation;
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("location-timeout")), ms),
        ),
      ]);
    try {
      let first: Location.LocationObject;
      try {
        first = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: accuracyPref }),
          10000,
        );
      } catch {
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
      if (firstAcc <= 50) {
        setLocation(first);
        return first;
      }
      setLocationCalibrating(true);
      try {
        const second = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: accuracyPref }),
          6000,
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

  const discoverRequestRef = useRef(0);
  const discoverAt = useCallback(
    (lat: number, lng: number, accuracy?: number | null, radiusOverride?: 150 | 300 | 500) => {
      const requestId = ++discoverRequestRef.current;
      const r = radiusOverride ?? searchRadius;
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
          },
        },
      );
    },
    [discoverMutation, searchRadius],
  );

  const mapLoadingRef = useRef(false);

  const handleMapRegionDiscover = useCallback(
    (lat: number, lng: number) => {
      if (mapLoadingRef.current) return;
      mapLoadingRef.current = true;
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
            mapLoadingRef.current = false;
            setMapLoading(false);
          },
          onError: () => {
            mapLoadingRef.current = false;
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
              setGeocodeError("Couldn't find that location. Try being more specific.");
            }
          },
          onError: () => {
            setGeocodeError("Something went wrong. Please try again.");
          },
        },
      );
    },
    [geocodeMutation, discoverAt],
  );

  useEffect(() => {
    if (location && !manualCoords && !discoverMutation.data && !discoverMutation.isPending) {
      discoverAt(location.coords.latitude, location.coords.longitude, location.coords.accuracy);
    }
  }, [location]);

  const toggleViewMode = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setViewMode((prev) => (prev === "list" ? "map" : "list"));
  };

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
          router.push("/walk-plan");
        }}
      />
    );
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const showContent = places.length > 0 && !discoverMutation.isPending;

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
        <View style={styles.headerTextContainer}>
          <Text
            style={[styles.greeting, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {locationCalibrating
              ? "Improving GPS accuracy…"
              : locationLoading
              ? "Locating…"
              : areaName || "Ready to explore"}
            {!locationLoading && !manualCoords && location?.coords.accuracy
              ? `  ·  ±${Math.round(location.coords.accuracy)}m`
              : ""}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Discover
          </Text>
        </View>
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
            onPress={() => { setGeocodeError(null); setShowLocationSearch(true); }}
            style={({ pressed }) => [
              styles.searchButton,
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
          <Pressable
            onPress={handleDiscover}
            disabled={discoverMutation.isPending || locationLoading}
            style={({ pressed }) => [
              styles.discoverButton,
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
          </Pressable>
        </View>
      </View>

      {(hasCoords || locationLoading) && (
        <View style={[styles.radiusRow, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.radiusLabel, { color: colors.mutedForeground }]}>Range</Text>
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
                  {r === 150 ? "Close" : r === 300 ? "Medium" : "Wide"} · {r}m
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
                All
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
                  accessibilityLabel={`Filter by ${cat}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: isActive ? colors.background : colors.mutedForeground },
                    ]}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
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
          renderItem={({ item, index }) => {
            const isExpanded = expandedId === item.id || (expandedId === null && index === 0);
            return (
              <PlaceCard
                place={item}
                index={index}
                expanded={isExpanded}
                onToggleExpand={() => {
                  setExpandedId(isExpanded ? null : item.id);
                }}
              />
            );
          }}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + webBottomInset + 90 },
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            showContent ? (
              <Pressable
                onPress={() => {
                  unlockWebSpeech();
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/walk-plan");
                }}
                style={({ pressed }) => [
                  styles.walkCard,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Walk Mode"
                accessibilityHint="Start an audio walking tour with headphones or speaker"
              >
                <View style={styles.walkCardContent}>
                  <Feather name="headphones" size={22} color={colors.primaryForeground} />
                  <View style={styles.walkCardText}>
                    <Text style={[styles.walkCardTitle, { color: colors.primaryForeground }]}>
                      Walk Mode
                    </Text>
                    <Text style={[styles.walkCardSubtitle, { color: colors.primaryForeground + "cc" }]}>
                      Audio tour guide — headphones or speaker
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.primaryForeground + "aa"} />
                </View>
              </Pressable>
            ) : null
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
                style={styles.loadingContainer}
              >
                <ActivityIndicator size="large" color={colors.primary} />
                <LoadingMessages variant="discovery" />
              </Animated.View>
            ) : discoverMutation.isError ? (
              <View style={styles.emptyContainer}>
                <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
                <Text
                  style={[styles.emptyTitle, { color: colors.foreground }]}
                >
                  Something went wrong
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  We couldn't find places nearby. Try again.
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
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Feather name="compass" size={40} color={colors.mutedForeground} />
                <Text
                  style={[styles.emptyTitle, { color: colors.foreground }]}
                >
                  Start Exploring
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  Tap the compass to discover interesting places around you
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  greeting: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 2,
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
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  discoverButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
  },
  radiusChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
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
  walkCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  walkCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  walkCardText: {
    flex: 1,
  },
  walkCardTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  walkCardSubtitle: {
    fontSize: 13,
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 10,
    paddingHorizontal: 40,
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
});
