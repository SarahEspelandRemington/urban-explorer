import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddressInput } from "@/components/AddressInput";
import { RoutePlanMap } from "@/components/RoutePlanMap";
import { useWalkMode, type PlannedRoute } from "@/contexts/WalkModeContext";
import { useColors } from "@/hooks/useColors";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface Waypoint {
  latitude: number;
  longitude: number;
}

interface RoutePlace {
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
  progressMeters: number;
  offsetMeters: number;
}

function formatDistance(m: number): string {
  const feet = m * 3.28084;
  if (feet < 528) return `${Math.round(feet)} ft`;
  const miles = m * 0.000621371;
  return `${miles.toFixed(2)} mi`;
}

function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function WalkPlanScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setPlannedRoute } = useWalkMode();

  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [start, setStart] = useState<Waypoint | null>(null);
  const [end, setEnd] = useState<Waypoint | null>(null);
  const [startLabel, setStartLabel] = useState<string | null>(null);
  const [endLabel, setEndLabel] = useState<string | null>(null);
  const [bendPoint, setBendPoint] = useState<Waypoint | null>(null);
  const [geometry, setGeometry] = useState<[number, number][]>([]);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [places, setPlaces] = useState<RoutePlace[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const [isResolving, setIsResolving] = useState<"start" | "end" | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planVersionRef = useRef(0);
  const planAbortRef = useRef<AbortController | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const resolveAddress = async (query: string): Promise<{ lat: number; lng: number; label: string } | null> => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    try {
      const res = await fetch(`${API_BASE}/api/explore/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (typeof data.latitude !== "number" || typeof data.longitude !== "number") return null;
      return { lat: data.latitude, lng: data.longitude, label: data.displayName || trimmed };
    } catch {
      return null;
    }
  };

  const useMyCurrentLocationForStart = async () => {
    setIsResolving("start");
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission required to use your current location.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setStart({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setStartLabel("Current location");
      setStartQuery("Current location");
    } catch {
      setError("Couldn't get your current location.");
    } finally {
      setIsResolving(null);
    }
  };

  const fetchRouteAndPlaces = async (
    s: Waypoint, e: Waypoint, bend: Waypoint | null,
  ) => {
    const myVersion = ++planVersionRef.current;
    if (planAbortRef.current) {
      try { planAbortRef.current.abort(); } catch {}
    }
    const controller = new AbortController();
    planAbortRef.current = controller;

    setIsPlanning(true);
    setError(null);
    const clearRouteState = () => {
      if (planVersionRef.current !== myVersion) return;
      setGeometry([]);
      setDistanceMeters(0);
      setDurationSeconds(0);
      setPlaces([]);
    };
    try {
      const routeRes = await fetch(`${API_BASE}/api/explore/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { latitude: s.latitude, longitude: s.longitude },
          end: { latitude: e.latitude, longitude: e.longitude },
          waypoints: bend ? [{ latitude: bend.latitude, longitude: bend.longitude }] : [],
        }),
        signal: controller.signal,
      });
      if (planVersionRef.current !== myVersion) return;
      if (!routeRes.ok) {
        const errBody = await routeRes.json().catch(() => ({}));
        if (planVersionRef.current !== myVersion) return;
        setError(errBody.error || "Couldn't find a walking route.");
        clearRouteState();
        return;
      }
      const routeData = await routeRes.json();
      if (planVersionRef.current !== myVersion) return;
      const geom: [number, number][] = routeData.geometry || [];
      setGeometry(geom);
      setDistanceMeters(routeData.distanceMeters || 0);
      setDurationSeconds(routeData.durationSeconds || 0);
      setPlaces([]);

      if (geom.length >= 2) {
        const placesRes = await fetch(`${API_BASE}/api/explore/places-along-route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry: geom, maxPlaces: 18, corridorMeters: 70 }),
          signal: controller.signal,
        });
        if (planVersionRef.current !== myVersion) return;
        if (placesRes.ok) {
          const placesData = await placesRes.json();
          if (planVersionRef.current !== myVersion) return;
          setPlaces(Array.isArray(placesData.places) ? placesData.places : []);
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || planVersionRef.current !== myVersion) return;
      setError("Couldn't plan the route. Check your connection.");
      clearRouteState();
    } finally {
      if (planVersionRef.current === myVersion) {
        setIsPlanning(false);
      }
    }
  };

  const handlePlanWalk = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let s = start;
    let sLabel = startLabel;
    if (!s && startQuery.trim()) {
      setIsResolving("start");
      const r = await resolveAddress(startQuery);
      setIsResolving(null);
      if (!r) {
        setError("Couldn't find the start address.");
        return;
      }
      s = { latitude: r.lat, longitude: r.lng };
      sLabel = r.label;
      setStart(s);
      setStartLabel(sLabel);
    }

    let e = end;
    let eLabel = endLabel;
    if (!e && endQuery.trim()) {
      setIsResolving("end");
      const r = await resolveAddress(endQuery);
      setIsResolving(null);
      if (!r) {
        setError("Couldn't find the end address.");
        return;
      }
      e = { latitude: r.lat, longitude: r.lng };
      eLabel = r.label;
      setEnd(e);
      setEndLabel(eLabel);
    }

    if (!s || !e) {
      setError("Please enter both a start and end address.");
      return;
    }

    setBendPoint(null);
    await fetchRouteAndPlaces(s, e, null);
  };

  const handleStartWalk = () => {
    if (!start || !end || geometry.length === 0) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const includedPlaces = places.filter((p) => !excluded.has(p.id));

    const route: PlannedRoute = {
      start: { latitude: start.latitude, longitude: start.longitude, label: startLabel || undefined },
      end: { latitude: end.latitude, longitude: end.longitude, label: endLabel || undefined },
      geometry,
      distanceMeters,
      durationSeconds,
      places: includedPlaces,
    };
    setPlannedRoute(route);
    router.replace("/walk-mode");
  };

  const togglePlace = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const includedCount = places.length - excluded.size;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.headerButton}
        >
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Plan Your Walk</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.inputs}>
        <AddressInput
          value={startQuery}
          onChangeText={(t) => {
            setStartQuery(t);
            setStart(null);
            setStartLabel(null);
          }}
          onSelectSuggestion={(s) => {
            setStartQuery(s.name);
            setStart(null);
            setStartLabel(null);
          }}
          placeholder="Start address"
          dotColor="#22c55e"
          editable={!isPlanning}
          returnKeyType="next"
          rightAdornment={
            <Pressable
              onPress={useMyCurrentLocationForStart}
              accessibilityRole="button"
              accessibilityLabel="Use my current location for start"
              hitSlop={8}
              disabled={isPlanning || isResolving === "start"}
            >
              {isResolving === "start" ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="crosshair" size={18} color={colors.primary} />
              )}
            </Pressable>
          }
        />

        <AddressInput
          value={endQuery}
          onChangeText={(t) => {
            setEndQuery(t);
            setEnd(null);
            setEndLabel(null);
          }}
          onSelectSuggestion={(s) => {
            setEndQuery(s.name);
            setEnd(null);
            setEndLabel(null);
          }}
          onSubmitEditing={handlePlanWalk}
          placeholder="End address"
          dotColor="#ef4444"
          editable={!isPlanning}
          returnKeyType="search"
          nearLocation={startLabel || startQuery}
          rightAdornment={
            isResolving === "end" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : undefined
          }
        />

        {error && (
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        )}

        <Pressable
          onPress={handlePlanWalk}
          disabled={isPlanning || (!startQuery.trim() && !start) || (!endQuery.trim() && !end)}
          style={({ pressed }) => [
            styles.planButton,
            {
              backgroundColor: colors.primary,
              opacity:
                isPlanning || (!startQuery.trim() && !start) || (!endQuery.trim() && !end)
                  ? 0.5
                  : pressed
                  ? 0.85
                  : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            geometry.length > 0 ? "Re-plan route" : "Plan walk"
          }
          accessibilityState={{ disabled: isPlanning || (!startQuery.trim() && !start) || (!endQuery.trim() && !end) }}
        >
          {isPlanning ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather
              name={geometry.length > 0 ? "refresh-cw" : "map"}
              size={16}
              color={colors.primaryForeground}
            />
          )}
          <Text style={[styles.planButtonText, { color: colors.primaryForeground }]}>
            {isPlanning ? "Planning..." : geometry.length > 0 ? "Re-plan Route" : "Plan Walk"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.mapContainer}>
        <RoutePlanMap
          start={start}
          end={end}
          bendPoint={bendPoint}
          geometry={geometry}
          places={places}
          excludedPlaceIds={excluded}
          onMoveStart={(next) => {
            setStart(next);
            if (end) fetchRouteAndPlaces(next, end, bendPoint);
          }}
          onMoveEnd={(next) => {
            setEnd(next);
            if (start) fetchRouteAndPlaces(start, next, bendPoint);
          }}
          onBendRoute={(next) => {
            setBendPoint(next);
            if (start && end) fetchRouteAndPlaces(start, end, next);
          }}
          onTogglePlace={togglePlace}
        />
      </View>

      {geometry.length > 0 && (
        <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.summaryRow}>
            <Feather name="map-pin" size={14} color={colors.mutedForeground} />
            <Text style={[styles.summaryText, { color: colors.foreground }]}>
              {formatDistance(distanceMeters)}
            </Text>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <Feather name="clock" size={14} color={colors.mutedForeground} />
            <Text style={[styles.summaryText, { color: colors.foreground }]}>
              {formatDuration(durationSeconds)}
            </Text>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <Feather name="headphones" size={14} color={colors.mutedForeground} />
            <Text style={[styles.summaryText, { color: colors.foreground }]}>
              {includedCount} {includedCount === 1 ? "story" : "stories"}
            </Text>
          </View>
          <Text style={[styles.summaryHint, { color: colors.mutedForeground }]}>
            {Platform.OS === "web"
              ? "Tap a place to skip or include it."
              : "Drag the green or red pin to adjust the start or end. Drag the small handle on the route to bend it. Tap a marker to skip a story."}
          </Text>
        </View>
      )}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleStartWalk}
          disabled={!start || !end || geometry.length === 0}
          style={({ pressed }) => [
            styles.startButton,
            {
              backgroundColor: colors.primary,
              opacity:
                !start || !end || geometry.length === 0 ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start the walk"
          accessibilityState={{ disabled: !start || !end || geometry.length === 0 }}
        >
          <Feather name="play" size={18} color={colors.primaryForeground} />
          <Text style={[styles.startButtonText, { color: colors.primaryForeground }]}>
            Start Walk
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  inputs: { paddingHorizontal: 16, gap: 10 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  planButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  planButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  mapContainer: { flex: 1, marginHorizontal: 16, marginTop: 12, marginBottom: 8, borderRadius: 16, overflow: "hidden" },
  summary: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  summaryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  summaryDivider: { width: 1, height: 14 },
  summaryHint: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  bottomBar: { paddingHorizontal: 16, paddingTop: 8 },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  startButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
