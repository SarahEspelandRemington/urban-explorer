import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface RoutePlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface Waypoint {
  latitude: number;
  longitude: number;
}

interface RoutePlanMapProps {
  start: Waypoint | null;
  end: Waypoint | null;
  bendPoint: Waypoint | null;
  geometry: [number, number][];
  places: RoutePlace[];
  excludedPlaceIds: Set<string>;
  onMoveStart?: (next: Waypoint) => void;
  onMoveEnd?: (next: Waypoint) => void;
  onBendRoute?: (next: Waypoint) => void;
  onTogglePlace?: (id: string) => void;
}

export function RoutePlanMap({
  start,
  end,
  geometry,
  places,
  excludedPlaceIds,
  onTogglePlace,
}: RoutePlanMapProps) {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <View style={styles.summaryBlock}>
        <Feather name="map" size={32} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>Route preview</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Interactive map editing is available on the mobile app.
        </Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {start && (
          <View style={[styles.item, { borderColor: colors.border }]}>
            <View style={[styles.dot, { backgroundColor: "#22c55e" }]} />
            <Text style={[styles.itemText, { color: colors.foreground }]}>
              Start ({start.latitude.toFixed(4)}, {start.longitude.toFixed(4)})
            </Text>
          </View>
        )}

        {end && (
          <View style={[styles.item, { borderColor: colors.border }]}>
            <View style={[styles.dot, { backgroundColor: "#ef4444" }]} />
            <Text style={[styles.itemText, { color: colors.foreground }]}>
              End ({end.latitude.toFixed(4)}, {end.longitude.toFixed(4)})
            </Text>
          </View>
        )}

        {geometry.length > 0 && (
          <Text style={[styles.geo, { color: colors.mutedForeground }]}>
            {geometry.length} route points · {places.length} places
          </Text>
        )}

        {places.map((p) => {
          const excluded = excludedPlaceIds.has(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => onTogglePlace?.(p.id)}
              accessibilityRole="button"
              accessibilityLabel={`${excluded ? "Include" : "Skip"} ${p.name}`}
              style={({ pressed }) => [
                styles.placeRow,
                {
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : excluded ? 0.5 : 1,
                  backgroundColor: excluded ? "transparent" : colors.primary + "10",
                },
              ]}
            >
              <Feather
                name={excluded ? "circle" : "check-circle"}
                size={14}
                color={excluded ? colors.mutedForeground : colors.primary}
              />
              <Text style={[styles.placeName, { color: colors.foreground }]} numberOfLines={1}>
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12 },
  summaryBlock: { alignItems: "center", paddingVertical: 12, gap: 4 },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  list: { flex: 1, marginTop: 8 },
  listContent: { gap: 8, paddingBottom: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  itemText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  geo: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  placeName: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
});
