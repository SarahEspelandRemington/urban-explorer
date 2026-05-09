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
  Alert,
  Animated as RNAnimated,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NoteModal } from "@/components/NoteModal";
import { PlaceCard } from "@/components/PlaceCard";
import { SaveToast } from "@/components/SaveToast";
import { getCategoryColor } from "@/constants/categories";
import { useDiscovery } from "@/contexts/DiscoveryContext";
import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";
import { useRatingPaceWarning } from "@/hooks/useRatingPaceWarning";

import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

type SortMode = "newest" | "nearest";

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

export default function SavedScreen() {
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { savedPlaces, removePlace, updateNote } = useDiscovery();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastSaved, setToastSaved] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const {
    showWarning: showRatingPaceWarning,
    recordRating,
    dismissWarning,
  } = useRatingPaceWarning();

  const handlePlaceRated = useCallback(
    (_placeId: string, newRating: "up" | "down" | null) => {
      if (newRating !== null) recordRating();
    },
    [recordRating],
  );

  // Acquire location for distance sort (best-effort, no permission prompt)
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status !== "granted") return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((pos) =>
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        )
        .catch(() => {});
    });
  }, []);

  // Unique categories from saved places
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const p of savedPlaces) {
      if (p.category) seen.add(p.category);
    }
    return Array.from(seen).sort();
  }, [savedPlaces]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = [...savedPlaces];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.note && p.note.toLowerCase().includes(q)),
      );
    }
    if (categoryFilter) {
      list = list.filter((p) => p.category === categoryFilter);
    }
    if (sortMode === "nearest" && userLocation) {
      list.sort(
        (a, b) =>
          haversineMeters(
            userLocation.lat,
            userLocation.lng,
            a.latitude,
            a.longitude,
          ) -
          haversineMeters(
            userLocation.lat,
            userLocation.lng,
            b.latitude,
            b.longitude,
          ),
      );
    }
    return list;
  }, [savedPlaces, query, categoryFilter, sortMode, userLocation]);

  const handleSaveConfirm = useCallback((wasSaved: boolean) => {
    setToastSaved(wasSaved);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 10);
  }, []);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const editingPlace = editingNoteId
    ? savedPlaces.find((p) => p.id === editingNoteId)
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
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
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t.saved.title}
            </Text>
            <Text style={[styles.count, { color: colors.mutedForeground }]}>
              {filtered.length !== savedPlaces.length
                ? `${filtered.length} of ${savedPlaces.length}`
                : `${savedPlaces.length} ${savedPlaces.length === 1 ? t.saved.placeOne : t.saved.placeMany}`}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web")
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowMap((v) => !v);
            }}
            style={[
              styles.mapToggleBtn,
              {
                backgroundColor: showMap ? colors.primary + "18" : colors.muted,
                borderColor: showMap ? colors.primary + "40" : colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={showMap ? "Hide map" : "Show map"}
            accessibilityState={{ selected: showMap }}
          >
            <Feather
              name="map"
              size={15}
              color={showMap ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.mapToggleText,
                { color: showMap ? colors.primary : colors.mutedForeground },
              ]}
            >
              {t.saved.mapToggle}
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <View
          style={[
            styles.searchRow,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Feather
            name="search"
            size={15}
            color={colors.mutedForeground}
            style={{ opacity: 0.6 }}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.saved.searchPlaceholder}
            placeholderTextColor={colors.mutedForeground + "80"}
            style={[styles.searchInput, { color: colors.foreground }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={12}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        {/* Filters + Sort */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {/* Sort buttons */}
          <Pressable
            onPress={() => setSortMode("newest")}
            style={[
              styles.chip,
              {
                backgroundColor:
                  sortMode === "newest" ? colors.primary : colors.muted,
                borderColor:
                  sortMode === "newest" ? colors.primary : colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: sortMode === "newest" }}
          >
            <Feather
              name="clock"
              size={12}
              color={
                sortMode === "newest"
                  ? colors.primaryForeground
                  : colors.mutedForeground
              }
            />
            <Text
              style={[
                styles.chipText,
                {
                  color:
                    sortMode === "newest"
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                },
              ]}
            >
              {t.saved.sortNewest}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              if (!userLocation) {
                Alert.alert(
                  t.saved.sortNearest,
                  t.saved.sortNearestNoLocation,
                );
                return;
              }
              setSortMode("nearest");
            }}
            style={[
              styles.chip,
              {
                backgroundColor:
                  sortMode === "nearest" ? colors.primary : colors.muted,
                borderColor:
                  sortMode === "nearest" ? colors.primary : colors.border,
                opacity: !userLocation ? 0.5 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: sortMode === "nearest" }}
          >
            <Feather
              name="navigation"
              size={12}
              color={
                sortMode === "nearest"
                  ? colors.primaryForeground
                  : colors.mutedForeground
              }
            />
            <Text
              style={[
                styles.chipText,
                {
                  color:
                    sortMode === "nearest"
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                },
              ]}
            >
              {t.saved.sortNearest}
            </Text>
            {!userLocation && (
              <Feather
                name="info"
                size={10}
                color={colors.mutedForeground}
                style={{ marginLeft: 1, opacity: 0.7 }}
              />
            )}
          </Pressable>

          {/* Separator */}
          <View
            style={[styles.chipSeparator, { backgroundColor: colors.border }]}
          />

          {/* "All" category filter */}
          <Pressable
            onPress={() => setCategoryFilter(null)}
            style={[
              styles.chip,
              {
                backgroundColor:
                  categoryFilter === null ? colors.foreground : colors.muted,
                borderColor:
                  categoryFilter === null ? colors.foreground : colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: categoryFilter === null }}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color:
                    categoryFilter === null
                      ? colors.background
                      : colors.mutedForeground,
                },
              ]}
            >
              {t.saved.filterAll}
            </Text>
          </Pressable>

          {categories.map((cat) => {
            const active = categoryFilter === cat;
            const catColor = getCategoryColor(cat, colors);
            return (
              <Pressable
                key={cat}
                onPress={() => setCategoryFilter(active ? null : cat)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? catColor + "20" : colors.muted,
                    borderColor: active ? catColor + "60" : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? catColor : colors.mutedForeground },
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Mini Map */}
      {showMap && filtered.length > 0 ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[styles.mapContainer, { borderBottomColor: colors.border }]}
        >
          <MapView
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={{
              latitude: filtered[0].latitude,
              longitude: filtered[0].longitude,
              latitudeDelta: 0.04,
              longitudeDelta: 0.04,
            }}
            showsUserLocation
          >
            {filtered.map((place) => (
              <Marker
                key={place.id}
                coordinate={{
                  latitude: place.latitude,
                  longitude: place.longitude,
                }}
                title={place.name}
                description={place.category}
                pinColor={colors.primary}
              />
            ))}
          </MapView>
        </Animated.View>
      ) : null}

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isExpanded = expandedId === item.id;
          return (
            <SwipeToDelete
              onDelete={() => {
                if (Platform.OS !== "web")
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                removePlace(item.id);
              }}
              label={t.saved.swipeToDelete}
              colors={colors}
            >
              <Pressable
                onLongPress={() => setEditingNoteId(item.id)}
                delayLongPress={500}
              >
                <PlaceCard
                  place={item}
                  index={index}
                  expanded={isExpanded}
                  onToggleExpand={() =>
                    setExpandedId(isExpanded ? null : item.id)
                  }
                  onRate={handlePlaceRated}
                  onSaveConfirm={handleSaveConfirm}
                />
              </Pressable>
            </SwipeToDelete>
          );
        }}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + webBottomInset + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          showRatingPaceWarning ? (
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
                <Feather
                  name="x"
                  size={14}
                  color="#92400e"
                  style={{ opacity: 0.7 }}
                />
              </Pressable>
            </Animated.View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="bookmark" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {query || categoryFilter ? t.saved.noResults : t.saved.emptyTitle}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {query || categoryFilter
                ? t.saved.noResultsDetail
                : t.saved.emptyDetail}
            </Text>
          </View>
        }
      />

      {/* Note edit modal (from long-press in saved list) */}
      {editingPlace ? (
        <NoteModal
          visible={!!editingNoteId}
          placeName={editingPlace.name}
          existingNote={editingPlace.note}
          onSave={(note) => {
            updateNote(editingPlace.id, note);
            setEditingNoteId(null);
          }}
          onSkip={() => setEditingNoteId(null)}
        />
      ) : null}

      {/* Save confirmation toast */}
      <SaveToast
        visible={toastVisible}
        label={toastSaved ? t.saved.savedConfirm : t.saved.removedConfirm}
        onHide={() => setToastVisible(false)}
      />
    </View>
  );
}

// ─── Swipe-to-delete wrapper ──────────────────────────────────────────────────

interface SwipeToDeleteProps {
  children: React.ReactNode;
  onDelete: () => void;
  label: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}

function SwipeToDelete({
  children,
  onDelete,
  label,
  colors,
}: SwipeToDeleteProps) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const cardOpacity = useRef(new RNAnimated.Value(1)).current;
  const startX = useRef(0);
  const currentDx = useRef(0);
  const isRevealed = useRef(false);
  const THRESHOLD = 72;
  const SNAP = -100;

  if (Platform.OS === "web") {
    return <>{children}</>;
  }

  const springBack = () => {
    isRevealed.current = false;
    RNAnimated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  };

  const snapOpen = () => {
    isRevealed.current = true;
    RNAnimated.spring(translateX, {
      toValue: SNAP,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  };

  const deleteOpacity = translateX.interpolate({
    inputRange: [SNAP, -20, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.swipeWrapper}>
      <RNAnimated.View
        style={[
          styles.deleteAction,
          { backgroundColor: colors.destructive, opacity: deleteOpacity },
        ]}
      >
        <Pressable
          onPress={() => {
            RNAnimated.timing(cardOpacity, {
              toValue: 0.15,
              duration: 140,
              useNativeDriver: true,
            }).start(() => {
              springBack();
              onDelete();
            });
          }}
          style={styles.deleteActionInner}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Feather name="trash-2" size={18} color="#fff" />
          <Text style={styles.deleteActionText}>{label}</Text>
        </Pressable>
      </RNAnimated.View>
      <RNAnimated.View
        style={{ transform: [{ translateX }], opacity: cardOpacity }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={(e) => {
          const dx = Math.abs(e.nativeEvent.pageX - startX.current);
          const dy = Math.abs(
            e.nativeEvent.pageY - (e.nativeEvent.locationY ?? 0),
          );
          return dx > 5 && dx > dy;
        }}
        onResponderGrant={(e) => {
          startX.current = e.nativeEvent.pageX;
          currentDx.current = 0;
          translateX.stopAnimation();
        }}
        onResponderMove={(e) => {
          const rawDx = e.nativeEvent.pageX - startX.current;
          currentDx.current = rawDx;
          const base = isRevealed.current ? SNAP : 0;
          const clamped = Math.max(SNAP, Math.min(0, base + rawDx));
          translateX.setValue(clamped);
        }}
        onResponderRelease={() => {
          const dx = currentDx.current;
          if (isRevealed.current) {
            if (dx > 30) {
              springBack();
            } else {
              snapOpen();
            }
          } else {
            if (dx < -THRESHOLD) {
              snapOpen();
            } else {
              springBack();
            }
          }
        }}
        onResponderTerminate={springBack}
      >
        {children}
      </RNAnimated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerLeft: {
    gap: 2,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
  },
  count: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  mapToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
  },
  mapToggleText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  chipSeparator: {
    width: 1,
    height: 20,
    borderRadius: 1,
    marginHorizontal: 2,
  },
  noLocationHint: {
    fontSize: 11,
    marginLeft: 4,
    alignSelf: "center",
  },
  mapContainer: {
    height: 200,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  map: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 120,
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
  swipeWrapper: {
    position: "relative",
  },
  deleteAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
  },
  deleteActionInner: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
  },
  deleteActionText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
