import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddressInput } from "@/components/AddressInput";
import { useT } from "@/contexts/LocaleContext";
import { useWalkMode, type WalkPlace } from "@/contexts/WalkModeContext";
import { useColors } from "@/hooks/useColors";
import { unlockWebSpeech } from "@/hooks/useNarration";
import { authHeaders } from "@/lib/apiToken";
import { saveRecentRoute } from "@/lib/recentRoutes";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface Coords {
  latitude: number;
  longitude: number;
}

type Phase = "input" | "searching" | "fetching" | "ready" | "error";

async function geocodeAddress(
  query: string,
  headers: Record<string, string>,
): Promise<Coords | null> {
  try {
    const res = await fetch(`${API_BASE}/api/explore/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const lat =
      typeof data.latitude === "number"
        ? data.latitude
        : parseFloat(data.latitude);
    const lng =
      typeof data.longitude === "number"
        ? data.longitude
        : parseFloat(data.longitude);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  } catch {
    return null;
  }
}

function formatDuration(secs: number): string {
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function WalkPlanScreen() {
  const colors = useColors();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const walk = useWalkMode();
  const params = useLocalSearchParams<{
    prefillStart?: string;
    prefillEnd?: string;
  }>();

  const [startText, setStartText] = useState(params.prefillStart ?? "");
  const [endText, setEndText] = useState(params.prefillEnd ?? "");

  useEffect(() => {
    if (params.prefillStart) setStartText(params.prefillStart);
    if (params.prefillEnd) setEndText(params.prefillEnd);
  }, [params.prefillStart, params.prefillEnd]);
  const startCoordsRef = useRef<Coords | null>(null);
  const endCoordsRef = useRef<Coords | null>(null);

  const [phase, setPhase] = useState<Phase>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [prefetchedPlaces, setPrefetchedPlaces] = useState<WalkPlace[]>([]);
  const [routeMeta, setRouteMeta] = useState<{
    distanceMeters: number;
    durationSeconds: number;
  } | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const canSearch = startText.trim().length >= 2 && endText.trim().length >= 2;
  const canStart = phase === "ready";

  const handleSelectStart = (suggestion: {
    name: string;
    latitude?: number;
    longitude?: number;
  }) => {
    if (suggestion.latitude != null && suggestion.longitude != null) {
      startCoordsRef.current = {
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      };
    } else {
      startCoordsRef.current = null;
    }
  };

  const handleSelectEnd = (suggestion: {
    name: string;
    latitude?: number;
    longitude?: number;
  }) => {
    if (suggestion.latitude != null && suggestion.longitude != null) {
      endCoordsRef.current = {
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      };
    } else {
      endCoordsRef.current = null;
    }
  };

  const handleFindRoute = async () => {
    if (!canSearch) return;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase("searching");
    setErrorMsg("");
    setPrefetchedPlaces([]);
    setRouteMeta(null);

    try {
      const hdrs = await authHeaders();

      let startCoords = startCoordsRef.current;
      let endCoords = endCoordsRef.current;

      if (!startCoords) {
        startCoords = await geocodeAddress(startText.trim(), hdrs);
        if (!startCoords) {
          setErrorMsg(t.walkPlan.geocodeError);
          setPhase("error");
          return;
        }
        startCoordsRef.current = startCoords;
      }

      if (!endCoords) {
        endCoords = await geocodeAddress(endText.trim(), hdrs);
        if (!endCoords) {
          setErrorMsg(t.walkPlan.geocodeError);
          setPhase("error");
          return;
        }
        endCoordsRef.current = endCoords;
      }

      const routeRes = await fetch(`${API_BASE}/api/explore/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({
          start: {
            latitude: startCoords.latitude,
            longitude: startCoords.longitude,
          },
          end: { latitude: endCoords.latitude, longitude: endCoords.longitude },
        }),
      });

      if (!routeRes.ok) {
        const data: unknown = await routeRes.json().catch(() => ({}));
        const serverMsg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as Record<string, unknown>).error === "string"
            ? ((data as Record<string, unknown>).error as string)
            : null;
        if (routeRes.status === 404) {
          setErrorMsg(t.walkPlan.noRoute);
        } else {
          setErrorMsg(serverMsg ?? t.walkPlan.routeError);
        }
        setPhase("error");
        return;
      }

      const routeData = await routeRes.json();
      const geometry: number[][] = routeData.geometry;
      setRouteMeta({
        distanceMeters: routeData.distanceMeters ?? 0,
        durationSeconds: routeData.durationSeconds ?? 0,
      });

      setPhase("fetching");

      const places = await walk.fetchPlacesAlongRoute(geometry);
      setPrefetchedPlaces(places);
      setPhase("ready");
    } catch {
      setErrorMsg(t.walkPlan.routeError);
      setPhase("error");
    }
  };

  const handleStartWalk = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    unlockWebSpeech();
    await saveRecentRoute({
      startText,
      endText,
      distanceMeters: routeMeta?.distanceMeters,
      durationSeconds: routeMeta?.durationSeconds,
    });
    const started = await walk.startWalk(prefetchedPlaces);
    if (started) {
      router.push("/walk-mode");
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + webTopInset + 8,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [
            styles.backButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Feather name="arrow-left" size={16} color={colors.foreground} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {t.walkPlan.title}
          </Text>
          <Text
            style={[styles.headerSubtitle, { color: colors.mutedForeground }]}
          >
            {t.walkPlan.subtitle}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.routeLine}>
          <View
            style={[styles.routeConnector, { backgroundColor: colors.border }]}
          />

          <View style={styles.inputRow}>
            <AddressInput
              testID="walk-plan-start"
              value={startText}
              onChangeText={(v) => {
                setStartText(v);
                startCoordsRef.current = null;
                if (phase !== "input") setPhase("input");
              }}
              onSelectSuggestion={handleSelectStart}
              onSubmitEditing={() => {}}
              placeholder={t.walkPlan.startPlaceholder}
              dotColor="#22c55e"
              returnKeyType="next"
              nearLocation={endText.trim() || undefined}
            />
          </View>

          <View style={styles.inputRow}>
            <AddressInput
              testID="walk-plan-end"
              value={endText}
              onChangeText={(v) => {
                setEndText(v);
                endCoordsRef.current = null;
                if (phase !== "input") setPhase("input");
              }}
              onSelectSuggestion={handleSelectEnd}
              onSubmitEditing={handleFindRoute}
              placeholder={t.walkPlan.endPlaceholder}
              dotColor={colors.primary}
              returnKeyType="search"
              nearLocation={startText.trim() || undefined}
            />
          </View>
        </View>

        {phase !== "ready" && (
          <Pressable
            onPress={handleFindRoute}
            disabled={
              !canSearch || phase === "searching" || phase === "fetching"
            }
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: canSearch ? colors.primary : colors.muted,
                opacity: pressed ? 0.85 : 1,
                marginTop: 16,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t.walkPlan.findRoute}
          >
            {phase === "searching" || phase === "fetching" ? (
              <View style={styles.buttonRow}>
                <ActivityIndicator
                  size="small"
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.buttonText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  {phase === "searching"
                    ? t.walkPlan.searching
                    : t.walkPlan.fetchingStops}
                </Text>
              </View>
            ) : (
              <View style={styles.buttonRow}>
                <Feather
                  name="navigation"
                  size={16}
                  color={
                    canSearch
                      ? colors.primaryForeground
                      : colors.mutedForeground
                  }
                />
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color: canSearch
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {t.walkPlan.findRoute}
                </Text>
              </View>
            )}
          </Pressable>
        )}

        {phase === "error" && (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather
              name="alert-circle"
              size={16}
              color="#ef4444"
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.errorText, { color: "#ef4444" }]}>
              {errorMsg}
            </Text>
          </View>
        )}

        {phase === "ready" && (
          <View style={styles.readySection}>
            {routeMeta && (
              <View
                style={[
                  styles.routeMetaCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.routeMetaItem}>
                  <Feather
                    name="map"
                    size={14}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[styles.routeMetaText, { color: colors.foreground }]}
                  >
                    {formatDistance(routeMeta.distanceMeters)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.routeMetaDivider,
                    { backgroundColor: colors.border },
                  ]}
                />
                <View style={styles.routeMetaItem}>
                  <Feather
                    name="clock"
                    size={14}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[styles.routeMetaText, { color: colors.foreground }]}
                  >
                    {formatDuration(routeMeta.durationSeconds)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.routeMetaDivider,
                    { backgroundColor: colors.border },
                  ]}
                />
                <View style={styles.routeMetaItem}>
                  <Feather
                    name="headphones"
                    size={14}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[styles.routeMetaText, { color: colors.foreground }]}
                  >
                    {t.walkPlan.stopsFound(prefetchedPlaces.length)}
                  </Text>
                </View>
              </View>
            )}

            {prefetchedPlaces.length === 0 && (
              <View
                style={[
                  styles.emptyNote,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather
                  name="info"
                  size={14}
                  color={colors.mutedForeground}
                  style={{ marginRight: 8, marginTop: 1 }}
                />
                <Text
                  style={[
                    styles.emptyNoteText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {t.walkPlan.emptyRouteNote}
                </Text>
              </View>
            )}

            {prefetchedPlaces.length > 0 && (
              <View style={styles.stopsSection}>
                <Text
                  style={[styles.stopsLabel, { color: colors.mutedForeground }]}
                >
                  {t.walkPlan.previewLabel}
                </Text>
                {prefetchedPlaces.map((place, i) => (
                  <View
                    key={place.id}
                    style={[
                      styles.stopCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        borderTopWidth: i === 0 ? 1 : 0,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.stopIndex,
                        { backgroundColor: colors.muted },
                      ]}
                    >
                      <Text
                        style={[
                          styles.stopIndexText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <View style={styles.stopInfo}>
                      <Text
                        style={[styles.stopName, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {place.name}
                      </Text>
                      <Text
                        style={[
                          styles.stopCategory,
                          { color: colors.mutedForeground },
                        ]}
                        numberOfLines={1}
                      >
                        {place.category}
                        {place.address ? ` · ${place.address}` : ""}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.startButtonRow}>
              <Pressable
                onPress={() => {
                  setPhase("input");
                  setPrefetchedPlaces([]);
                  setRouteMeta(null);
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t.walkPlan.findRoute}
              >
                <Feather
                  name="refresh-cw"
                  size={15}
                  color={colors.foreground}
                />
              </Pressable>

              <Pressable
                onPress={handleStartWalk}
                disabled={!canStart}
                style={({ pressed }) => [
                  styles.startButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
                    flex: 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t.walkPlan.startWalk}
              >
                <View style={styles.buttonRow}>
                  <Feather
                    name="headphones"
                    size={16}
                    color={colors.primaryForeground}
                  />
                  <Text
                    style={[
                      styles.buttonText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {t.walkPlan.startWalk}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    lineHeight: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 0,
  },
  routeLine: {
    position: "relative",
    gap: 10,
  },
  routeConnector: {
    position: "absolute",
    left: 16,
    top: 34,
    width: 2,
    height: 28,
    zIndex: 0,
  },
  inputRow: {
    zIndex: 10,
  },
  actionButton: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  readySection: {
    gap: 14,
    marginTop: 16,
  },
  routeMetaCard: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  routeMetaItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  routeMetaDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
  },
  routeMetaText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.2,
  },
  stopsSection: {
    borderRadius: 12,
    overflow: "hidden",
  },
  stopsLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  stopCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  stopIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stopIndexText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.2,
  },
  stopCategory: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  emptyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  emptyNoteText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  startButtonRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  startButton: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
});
