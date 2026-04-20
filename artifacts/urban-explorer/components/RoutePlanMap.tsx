import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, {
  LatLng,
  LongPressEvent,
  Marker,
  MarkerDragStartEndEvent,
  Polyline,
  PROVIDER_DEFAULT,
} from "react-native-maps";

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
  waypoints: Waypoint[];
  geometry: [number, number][];
  places: RoutePlace[];
  excludedPlaceIds: Set<string>;
  onMoveStart?: (next: Waypoint) => void;
  onMoveEnd?: (next: Waypoint) => void;
  onMoveWaypoint?: (index: number, next: Waypoint) => void;
  onAddWaypoint?: (next: Waypoint) => void;
  onRemoveWaypoint?: (index: number) => void;
  onTogglePlace?: (id: string) => void;
}

export function RoutePlanMap({
  start,
  end,
  waypoints,
  geometry,
  places,
  excludedPlaceIds,
  onMoveStart,
  onMoveEnd,
  onMoveWaypoint,
  onAddWaypoint,
  onRemoveWaypoint,
  onTogglePlace,
}: RoutePlanMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);

  const polyline: LatLng[] =
    geometry.length > 0
      ? geometry.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
      : [start, ...waypoints, end].filter(Boolean).map((p) => ({
          latitude: p!.latitude,
          longitude: p!.longitude,
        }));

  useEffect(() => {
    if (!mapRef.current) return;
    const points: LatLng[] = [];
    if (start) points.push({ latitude: start.latitude, longitude: start.longitude });
    if (end) points.push({ latitude: end.latitude, longitude: end.longitude });
    waypoints.forEach((w) => points.push({ latitude: w.latitude, longitude: w.longitude }));
    geometry.forEach(([lat, lng]) => points.push({ latitude: lat, longitude: lng }));
    if (points.length >= 2) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 80, bottom: 200, left: 50, right: 50 },
        animated: true,
      });
    } else if (points.length === 1) {
      mapRef.current.animateToRegion({
        latitude: points[0].latitude,
        longitude: points[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [start, end, waypoints, geometry]);

  const initialRegion = start
    ? {
        latitude: start.latitude,
        longitude: start.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : end
    ? {
        latitude: end.latitude,
        longitude: end.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : {
        latitude: 40.7308,
        longitude: -73.9973,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  const handleLongPress = (e: LongPressEvent) => {
    if (!onAddWaypoint) return;
    const c = e.nativeEvent.coordinate;
    onAddWaypoint({ latitude: c.latitude, longitude: c.longitude });
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        onLongPress={handleLongPress}
      >
        {polyline.length >= 2 && (
          <Polyline
            coordinates={polyline}
            strokeColor={colors.primary}
            strokeWidth={5}
            lineCap="round"
          />
        )}

        {start && (
          <Marker
            coordinate={{ latitude: start.latitude, longitude: start.longitude }}
            title="Start"
            pinColor="#22c55e"
            draggable
            onDragEnd={(e: MarkerDragStartEndEvent) =>
              onMoveStart?.({
                latitude: e.nativeEvent.coordinate.latitude,
                longitude: e.nativeEvent.coordinate.longitude,
              })
            }
          />
        )}

        {end && (
          <Marker
            coordinate={{ latitude: end.latitude, longitude: end.longitude }}
            title="End"
            pinColor="#ef4444"
            draggable
            onDragEnd={(e: MarkerDragStartEndEvent) =>
              onMoveEnd?.({
                latitude: e.nativeEvent.coordinate.latitude,
                longitude: e.nativeEvent.coordinate.longitude,
              })
            }
          />
        )}

        {waypoints.map((w, i) => (
          <Marker
            key={`wp-${i}`}
            coordinate={{ latitude: w.latitude, longitude: w.longitude }}
            title={`Waypoint ${i + 1}`}
            description="Long-press to remove"
            pinColor="#3b82f6"
            draggable
            onDragEnd={(e: MarkerDragStartEndEvent) =>
              onMoveWaypoint?.(i, {
                latitude: e.nativeEvent.coordinate.latitude,
                longitude: e.nativeEvent.coordinate.longitude,
              })
            }
            onCalloutPress={() => onRemoveWaypoint?.(i)}
          />
        ))}

        {places.map((p) => {
          const excluded = excludedPlaceIds.has(p.id);
          return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              title={p.name}
              description={excluded ? "Tap to include" : "Tap to skip"}
              pinColor={excluded ? colors.mutedForeground : colors.primary}
              opacity={excluded ? 0.4 : 1}
              onCalloutPress={() => onTogglePlace?.(p.id)}
            />
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 16, overflow: "hidden" },
  map: { flex: 1 },
});
