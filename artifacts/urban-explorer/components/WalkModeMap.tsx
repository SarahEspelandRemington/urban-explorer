import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT, Region } from "react-native-maps";

import { useColors } from "@/hooks/useColors";
import { WalkPlace } from "@/contexts/WalkModeContext";

interface WalkModeMapProps {
  userLatitude: number;
  userLongitude: number;
  places: WalkPlace[];
  narratedIds: Map<string, number>;
  followUser?: boolean;
  currentlyPlayingPlaceId?: string;
  onOpenPlace?: (place: WalkPlace) => void;
  onPlayPlace?: (place: WalkPlace) => void;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function visitedOpacity(narratedAt: number | undefined): number {
  if (narratedAt === undefined) return 1;
  const ageMs = Date.now() - narratedAt;
  if (ageMs < ONE_HOUR_MS) return 1;
  const hours = ageMs / ONE_HOUR_MS;
  return Math.max(0.3, 1 - (hours - 1) * 0.1);
}

interface Cluster {
  key: string;
  latitude: number;
  longitude: number;
  places: WalkPlace[];
}

const CLUSTER_GRID_SIZE = 60;

function clusterPlaces(places: WalkPlace[], region: Region): Cluster[] {
  if (places.length === 0) return [];
  const cellLat = region.latitudeDelta / CLUSTER_GRID_SIZE;
  const cellLng = region.longitudeDelta / CLUSTER_GRID_SIZE;
  if (cellLat <= 0 || cellLng <= 0) {
    return places.map((p) => ({
      key: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      places: [p],
    }));
  }
  const buckets = new Map<string, WalkPlace[]>();
  for (const place of places) {
    const gx = Math.floor(place.latitude / cellLat);
    const gy = Math.floor(place.longitude / cellLng);
    const key = `${gx}:${gy}`;
    const arr = buckets.get(key);
    if (arr) arr.push(place);
    else buckets.set(key, [place]);
  }
  const clusters: Cluster[] = [];
  for (const [key, group] of buckets) {
    if (group.length === 1) {
      const p = group[0];
      clusters.push({
        key: p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        places: group,
      });
    } else {
      let lat = 0;
      let lng = 0;
      for (const p of group) {
        lat += p.latitude;
        lng += p.longitude;
      }
      clusters.push({
        key: `cluster:${key}`,
        latitude: lat / group.length,
        longitude: lng / group.length,
        places: group,
      });
    }
  }
  return clusters;
}

export function WalkModeMap({
  currentlyPlayingPlaceId,
  userLatitude,
  userLongitude,
  places,
  narratedIds,
  followUser = true,
  onOpenPlace,
  onPlayPlace,
}: WalkModeMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);
  const initialRegion: Region = {
    latitude: userLatitude,
    longitude: userLongitude,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  };
  const [region, setRegion] = useState<Region>(initialRegion);
  const [previewCluster, setPreviewCluster] = useState<Cluster | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<WalkPlace | null>(null);

  // Narration aura: a slow breathing animation that drives the isPlaying ring
  // opacity. Single value — only one place narrates at a time.
  const narrationPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (currentlyPlayingPlaceId) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(narrationPulse, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(narrationPulse, {
            toValue: 0,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      narrationPulse.setValue(0);
    }
  }, [currentlyPlayingPlaceId, narrationPulse]);

  // Stale preview guard (Problem C): clear the cluster preview card when any
  // of its places have been removed from the places prop (e.g. by a coordinate
  // trust filter). Without this, the preview card can display data for a place
  // that is no longer in the verified pool.
  useEffect(() => {
    if (!previewCluster) return;
    const placeIds = new Set(places.map((p) => p.id));
    const allPresent = previewCluster.places.every((p) => placeIds.has(p.id));
    if (!allPresent) setPreviewCluster(null);
  }, [places, previewCluster]);

  // Track whether the map camera is following the user.
  // Panning the map or zooming into a cluster disengages follow; the
  // re-center button re-engages it.
  const [isFollowing, setIsFollowing] = useState(followUser);
  // Stable ref to the current region so the coordinate-tracking effect can
  // read latitudeDelta/longitudeDelta without adding region to its dep array
  // (which would cause the effect to re-run on every map camera move).
  const regionRef = useRef(region);
  useEffect(() => {
    regionRef.current = region;
  }, [region]);
  // Ref to detect meaningful movement (>3 m) before calling animateToRegion,
  // avoiding jitter from sub-metre GPS noise.
  const prevUserPosRef = useRef({ lat: userLatitude, lng: userLongitude });

  // Drive the map camera from live coordinates. On iOS this supplements
  // followsUserLocation (which stops when the user pans). On Android it IS the
  // only follow mechanism — followsUserLocation is iOS-only.
  useEffect(() => {
    if (!isFollowing) return;
    const prev = prevUserPosRef.current;
    const dLat = Math.abs(userLatitude - prev.lat);
    const dLng = Math.abs(userLongitude - prev.lng);
    // ~3 m in degrees (1° ≈ 111 km → 3 m ≈ 0.000027°). Skip tiny GPS jitter.
    if (dLat < 0.000027 && dLng < 0.000027) return;
    prevUserPosRef.current = { lat: userLatitude, lng: userLongitude };
    mapRef.current?.animateToRegion(
      {
        latitude: userLatitude,
        longitude: userLongitude,
        latitudeDelta: regionRef.current.latitudeDelta,
        longitudeDelta: regionRef.current.longitudeDelta,
      },
      500,
    );
  }, [userLatitude, userLongitude, isFollowing]);

  const clusters = useMemo(
    // Exclude places the server flagged as spatially untrustworthy — their
    // stored coordinates don't match their described location, so rendering
    // a pin would mislead the user about where the place actually is.
    () =>
      clusterPlaces(
        places.filter((p) => !p.autoNarrationBlocked),
        region,
      ),
    [places, region],
  );

  const [expansion, setExpansion] = useState<{
    cluster: Cluster;
    startedAt: number;
  } | null>(null);
  const [expandProgress, setExpandProgress] = useState(0);

  const [collapse, setCollapse] = useState<{
    groups: {
      clusterKey: string;
      center: { latitude: number; longitude: number };
      places: WalkPlace[];
    }[];
    startedAt: number;
  } | null>(null);
  const [collapseProgress, setCollapseProgress] = useState(0);

  const prevClustersRef = useRef<Cluster[]>([]);

  useEffect(() => {
    if (!expansion) return;
    const duration = 420;
    let raf: number;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const elapsed = Date.now() - expansion.startedAt;
      const t = Math.min(1, elapsed / duration);
      setExpandProgress(Easing.out(Easing.cubic)(t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        clearTimer = setTimeout(() => setExpansion(null), 60);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [expansion]);

  useEffect(() => {
    const prev = prevClustersRef.current;
    prevClustersRef.current = clusters;
    if (expansion) return;
    const prevSinglePlaceIds = new Set<string>();
    for (const c of prev) {
      if (c.places.length === 1) prevSinglePlaceIds.add(c.places[0].id);
    }
    if (prevSinglePlaceIds.size === 0) return;
    const groups: {
      clusterKey: string;
      center: { latitude: number; longitude: number };
      places: WalkPlace[];
    }[] = [];
    for (const c of clusters) {
      if (c.places.length <= 1) continue;
      const merged = c.places.filter((p) => prevSinglePlaceIds.has(p.id));
      if (merged.length >= 1) {
        groups.push({
          clusterKey: c.key,
          center: { latitude: c.latitude, longitude: c.longitude },
          places: merged,
        });
      }
    }
    if (groups.length > 0) {
      setCollapseProgress(0);
      setCollapse({ groups, startedAt: Date.now() });
    }
  }, [clusters, expansion]);

  useEffect(() => {
    if (!collapse) return;
    const duration = 420;
    let raf: number;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const elapsed = Date.now() - collapse.startedAt;
      const t = Math.min(1, elapsed / duration);
      setCollapseProgress(Easing.in(Easing.cubic)(t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        clearTimer = setTimeout(() => setCollapse(null), 60);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [collapse]);

  const expandingPlaceIds = useMemo(() => {
    if (!expansion) return null;
    return new Set(expansion.cluster.places.map((p) => p.id));
  }, [expansion]);

  const collapsingClusterKeys = useMemo(() => {
    if (!collapse) return null;
    return new Set(collapse.groups.map((g) => g.clusterKey));
  }, [collapse]);

  const handleClusterPress = (cluster: Cluster) => {
    if (cluster.places.length <= 1) return;
    // User is intentionally inspecting a cluster; disengage follow so the
    // camera doesn't snap back to their position immediately.
    setIsFollowing(false);
    let minLat = cluster.places[0].latitude;
    let maxLat = cluster.places[0].latitude;
    let minLng = cluster.places[0].longitude;
    let maxLng = cluster.places[0].longitude;
    for (const p of cluster.places) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    const latitudeDelta = Math.max((maxLat - minLat) * 2.2, 0.0015);
    const longitudeDelta = Math.max((maxLng - minLng) * 2.2, 0.0015);
    setExpandProgress(0);
    setExpansion({ cluster, startedAt: Date.now() });
    mapRef.current?.animateToRegion(
      {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta,
        longitudeDelta,
      },
      400,
    );
  };

  const focusPlace = (place: WalkPlace) => {
    setIsFollowing(false);
    setPreviewCluster(null);
    mapRef.current?.animateToRegion(
      {
        latitude: place.latitude,
        longitude: place.longitude,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003,
      },
      300,
    );
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
        followsUserLocation={Platform.OS === "ios" && followUser && isFollowing}
        onPanDrag={() => setIsFollowing(false)}
        onPress={() => {
          setSelectedPlace(null);
          setPreviewCluster(null);
        }}
      >
        {expansion &&
          expansion.cluster.places.map((place) => {
            const t = expandProgress;
            const lat =
              expansion.cluster.latitude +
              (place.latitude - expansion.cluster.latitude) * t;
            const lng =
              expansion.cluster.longitude +
              (place.longitude - expansion.cluster.longitude) * t;
            return (
              <Marker
                key={`expand:${place.id}`}
                coordinate={{ latitude: lat, longitude: lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                opacity={0.35 + 0.65 * t}
              >
                <View
                  style={[
                    styles.expandPin,
                    {
                      backgroundColor: narratedIds.has(place.id)
                        ? colors.mutedForeground
                        : colors.primary,
                      borderColor: colors.background,
                      transform: [{ scale: 0.6 + 0.4 * t }],
                    },
                  ]}
                />
              </Marker>
            );
          })}

        {collapse &&
          collapse.groups.flatMap((group) =>
            group.places.map((place) => {
              const t = collapseProgress;
              const lat =
                place.latitude + (group.center.latitude - place.latitude) * t;
              const lng =
                place.longitude +
                (group.center.longitude - place.longitude) * t;
              return (
                <Marker
                  key={`collapse:${group.clusterKey}:${place.id}`}
                  coordinate={{ latitude: lat, longitude: lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  opacity={1 - 0.55 * t}
                >
                  <View
                    style={[
                      styles.expandPin,
                      {
                        backgroundColor: narratedIds.has(place.id)
                          ? colors.mutedForeground
                          : colors.primary,
                        borderColor: colors.background,
                        transform: [{ scale: 1 - 0.4 * t }],
                      },
                    ]}
                  />
                </Marker>
              );
            }),
          )}

        {clusters
          .filter((cluster) => {
            // Same exclusions as before — moved ahead of .map() so a
            // filtered-out entry never becomes a `null` in MapView's
            // children array (react-native-maps@1.18.0 predates Fabric and
            // renders through RCTLegacyViewManagerInteropComponentView,
            // which does not reliably strip null children).
            if (expansion && cluster.key === expansion.cluster.key)
              return false;
            if (collapse && collapsingClusterKeys?.has(cluster.key))
              return false;
            if (
              expandingPlaceIds &&
              cluster.places.length === 1 &&
              expandingPlaceIds.has(cluster.places[0].id)
            ) {
              return false;
            }
            return true;
          })
          .map((cluster) => {
            if (cluster.places.length === 1) {
              const place = cluster.places[0];
              const narratedAt = narratedIds.get(place.id);
              const wasNarrated = narratedAt !== undefined;
              const isSelected = selectedPlace?.id === place.id;
              const isPlaying = currentlyPlayingPlaceId === place.id;

              // Semantic opacity hierarchy:
              //   narration > selected > played (faded) > upcoming.
              //   Selected pins surface to full opacity so they visually link
              //   to the open preview card, even if previously narrated.
              const markerOpacity = isPlaying
                ? 1
                : isSelected
                  ? 1
                  : wasNarrated
                    ? visitedOpacity(narratedAt) * 0.1
                    : 0.7;

              // Active: 28 px dominant. Upcoming: 12 px quiet dot.
              // Played: 9 px small, neutral grey — visually subordinate.
              // Selected + not playing: surface with more-opaque primary.
              const pinSize = isPlaying ? 28 : wasNarrated ? 9 : 12;
              const isInterpretive =
                !isPlaying && place.discoveryClass === "INTERPRETIVE_OVERLAY";
              const isApproxSite =
                !isPlaying && place.discoveryClass === "APPROXIMATE_SITE";
              const pinColor = isPlaying
                ? colors.primary
                : isSelected
                  ? colors.primary + "CC"
                  : wasNarrated
                    ? colors.mutedForeground + "66"
                    : isInterpretive
                      ? colors.primary + "55"
                      : isApproxSite
                        ? colors.primary + "66"
                        : colors.primary + "88";
              // Active: 38 px wrapper. Selected: widen to fit halo ring. Others: pin + 8.
              const wrapperSize = isPlaying
                ? 38
                : isSelected
                  ? Math.max(pinSize + 8, 34)
                  : pinSize + 8;

              return (
                <Marker
                  key={cluster.key}
                  coordinate={{
                    latitude: place.latitude,
                    longitude: place.longitude,
                  }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={isSelected || isPlaying}
                  opacity={markerOpacity}
                  stopPropagation
                >
                  <Pressable
                    onPress={() => {
                      setPreviewCluster(null);
                      setSelectedPlace(isSelected ? null : place);
                    }}
                    hitSlop={14}
                    accessibilityRole="button"
                    accessibilityLabel={`${place.name}${isPlaying ? " (playing)" : wasNarrated ? " (played)" : ""}. Tap to play.`}
                  >
                    <View
                      style={[
                        styles.pinWrapper,
                        { width: wrapperSize, height: wrapperSize },
                      ]}
                    >
                      {isPlaying && (
                        <Animated.View
                          style={[
                            styles.pinRing,
                            {
                              width: 44,
                              height: 44,
                              borderRadius: 22,
                              borderColor: colors.primary,
                              borderWidth: 1.5,
                              backgroundColor: colors.primary + "0A",
                              opacity: narrationPulse.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.1, 0.3],
                              }),
                            },
                          ]}
                        />
                      )}
                      {isSelected && !isPlaying && (
                        <View
                          style={[
                            styles.pinRing,
                            {
                              width: 30,
                              height: 30,
                              borderRadius: 15,
                              borderColor: colors.primary + "80",
                              borderWidth: 1.5,
                              backgroundColor: colors.primary + "0D",
                              opacity: 0.85,
                            },
                          ]}
                        />
                      )}
                      <View
                        style={[
                          styles.pin,
                          {
                            width: pinSize,
                            height: pinSize,
                            borderRadius: pinSize / 2,
                            backgroundColor: pinColor,
                            borderColor: isPlaying
                              ? colors.primaryForeground
                              : colors.background,
                            borderWidth: isPlaying ? 2 : 1.25,
                            ...(isPlaying
                              ? {
                                  shadowColor: colors.primary,
                                  shadowOpacity: 0.4,
                                  shadowRadius: 8,
                                  elevation: 6,
                                }
                              : isSelected
                                ? {
                                    shadowColor: colors.primary,
                                    shadowOpacity: 0.2,
                                    shadowRadius: 4,
                                    elevation: 3,
                                  }
                                : wasNarrated
                                  ? { shadowOpacity: 0, elevation: 0 }
                                  : {
                                      shadowColor: "#000",
                                      shadowOpacity: 0.2,
                                      shadowRadius: 3,
                                      elevation: 2,
                                    }),
                          },
                        ]}
                      />
                    </View>
                  </Pressable>
                </Marker>
              );
            }
            const allNarrated = cluster.places.every((p) =>
              narratedIds.has(p.id),
            );
            const bg = allNarrated ? colors.mutedForeground : colors.primary;
            const size =
              cluster.places.length >= 100
                ? 52
                : cluster.places.length >= 10
                  ? 44
                  : 36;
            return (
              <Marker
                key={cluster.key}
                coordinate={{
                  latitude: cluster.latitude,
                  longitude: cluster.longitude,
                }}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
                stopPropagation
              >
                <Pressable
                  onPress={() => handleClusterPress(cluster)}
                  onLongPress={() => setPreviewCluster(cluster)}
                  delayLongPress={350}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Cluster of ${cluster.places.length} places. Long-press to preview.`}
                >
                  <View
                    style={[
                      styles.cluster,
                      {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor: bg,
                        borderColor: colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.clusterText,
                        { color: colors.primaryForeground },
                      ]}
                    >
                      {cluster.places.length}
                    </Text>
                  </View>
                </Pressable>
              </Marker>
            );
          })}
      </MapView>

      {!isFollowing && (
        <Pressable
          style={[
            styles.reCenterBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={() => {
            setIsFollowing(true);
            prevUserPosRef.current = { lat: userLatitude, lng: userLongitude };
            mapRef.current?.animateToRegion(
              {
                latitude: userLatitude,
                longitude: userLongitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              },
              400,
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="Re-center map on your location"
          hitSlop={8}
        >
          <Feather name="crosshair" size={18} color={colors.primary} />
        </Pressable>
      )}

      {selectedPlace && !previewCluster
        ? (() => {
            const isCurrentlyPlaying =
              selectedPlace.id === currentlyPlayingPlaceId;
            return (
              <View
                style={[
                  styles.selectedCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: isCurrentlyPlaying
                      ? colors.primary + "60"
                      : colors.border,
                    borderLeftColor: isCurrentlyPlaying
                      ? colors.primary
                      : colors.border,
                    borderLeftWidth: isCurrentlyPlaying ? 3 : 1,
                    opacity: isCurrentlyPlaying ? 1 : 0.88,
                  },
                ]}
              >
                <View style={styles.selectedCardBody}>
                  <View style={styles.selectedCardText}>
                    <Text
                      style={[
                        styles.selectedCardLabel,
                        {
                          color: isCurrentlyPlaying
                            ? colors.primary
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      {isCurrentlyPlaying ? "NOW PLAYING" : "PREVIEW"}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.selectedName,
                        { color: colors.foreground },
                      ]}
                    >
                      {selectedPlace.name}
                    </Text>
                    {(() => {
                      const sub = selectedPlace.summary
                        ?.split(/[.!?]/)[0]
                        ?.trim();
                      return sub ? (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.selectedSub,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {sub}
                        </Text>
                      ) : null;
                    })()}
                  </View>
                  {onOpenPlace ? (
                    <Pressable
                      onPress={() => {
                        setSelectedPlace(null);
                        onOpenPlace(selectedPlace);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Open details for ${selectedPlace.name}`}
                      style={({ pressed }) => [
                        styles.selectedActionBtn,
                        {
                          backgroundColor: pressed
                            ? colors.muted
                            : colors.muted + "80",
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Feather
                        name="info"
                        size={15}
                        color={colors.mutedForeground}
                      />
                    </Pressable>
                  ) : null}
                  {!isCurrentlyPlaying && onPlayPlace ? (
                    <Pressable
                      onPress={() => {
                        onPlayPlace(selectedPlace);
                        setSelectedPlace(null);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={
                        narratedIds.has(selectedPlace.id)
                          ? `Replay story for ${selectedPlace.name}`
                          : `Play story for ${selectedPlace.name}`
                      }
                      style={({ pressed }) => [
                        styles.selectedActionBtn,
                        styles.selectedPlayBtn,
                        {
                          backgroundColor: pressed
                            ? colors.primary + "cc"
                            : colors.primary,
                        },
                      ]}
                    >
                      <Feather
                        name={
                          narratedIds.has(selectedPlace.id)
                            ? "refresh-cw"
                            : "play"
                        }
                        size={15}
                        color={colors.primaryForeground}
                      />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })()
        : null}

      {previewCluster ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPreviewCluster(null)}
            accessibilityLabel="Dismiss cluster preview"
          />
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: colors.foreground,
              },
            ]}
          >
            <Text style={[styles.previewTitle, { color: colors.foreground }]}>
              {previewCluster.places.length} places here
            </Text>
            <ScrollView
              style={styles.previewList}
              keyboardShouldPersistTaps="handled"
            >
              {previewCluster.places.map((p) => {
                const narratedAt = narratedIds.get(p.id);
                const visited = narratedAt !== undefined;
                const iconOpacity = visited ? visitedOpacity(narratedAt) : 1;
                return (
                  <View key={p.id} style={styles.previewRow}>
                    <View style={styles.previewVisitedSlot}>
                      {visited ? (
                        <Feather
                          name="check-circle"
                          size={13}
                          color={colors.primary}
                          style={{ opacity: iconOpacity }}
                        />
                      ) : null}
                    </View>
                    {p.photoUrl ? (
                      <Image
                        source={{ uri: p.photoUrl }}
                        style={[
                          styles.previewThumb,
                          { opacity: visited ? 0.5 : 1 },
                        ]}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Pressable
                      onPress={() => focusPlace(p)}
                      style={({ pressed }) => [
                        styles.previewItem,
                        pressed && { backgroundColor: colors.muted },
                      ]}
                      accessibilityLabel={`Centre map on ${p.name}${visited ? " (visited)" : ""}`}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.previewItemText,
                          {
                            color: visited
                              ? colors.mutedForeground
                              : colors.foreground,
                          },
                        ]}
                      >
                        {p.name}
                      </Text>
                      {(() => {
                        const sub = p.summary?.split(/[.!?]/)[0]?.trim() ?? "";
                        return sub ? (
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.previewItemSubtext,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {sub}
                          </Text>
                        ) : null;
                      })()}
                    </Pressable>
                    {onOpenPlace ? (
                      <Pressable
                        onPress={() => onOpenPlace(p)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${p.name}`}
                        style={({ pressed }) => [
                          styles.previewOpenBtn,
                          {
                            backgroundColor: pressed
                              ? colors.muted
                              : "transparent",
                          },
                        ]}
                      >
                        <Feather
                          name="chevron-right"
                          size={16}
                          color={colors.mutedForeground}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 16, overflow: "hidden" },
  map: { flex: 1 },
  cluster: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  clusterText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  expandPin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  pinWrapper: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 3,
  },
  pinRing: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    opacity: 0.7,
  },
  selectedCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  selectedCardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectedCardText: {
    flex: 1,
    gap: 2,
  },
  selectedCardLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  selectedName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  selectedSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  selectedActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  selectedPlayBtn: {
    borderWidth: 0,
  },
  reCenterBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  previewCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
    maxHeight: 420,
  },
  previewTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  previewList: {
    maxHeight: 380,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  previewVisitedSlot: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  previewThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    marginRight: 6,
  },
  previewItem: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  previewItemText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  previewItemSubtext: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  previewOpenBtn: {
    padding: 6,
    borderRadius: 6,
    marginLeft: 2,
  },
});
