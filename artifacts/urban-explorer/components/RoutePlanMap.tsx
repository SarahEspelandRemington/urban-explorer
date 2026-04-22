import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, {
  LatLng,
  MapPressEvent,
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
  bendPoint: Waypoint | null;
  geometry: [number, number][];
  places: RoutePlace[];
  excludedPlaceIds: Set<string>;
  selectingPoint?: "start" | "end" | null;
  onMoveStart?: (next: Waypoint) => void;
  onMoveEnd?: (next: Waypoint) => void;
  onBendRoute?: (next: Waypoint) => void;
  onTogglePlace?: (id: string) => void;
  onMapPress?: (coord: Waypoint) => void;
}

function midpointOfGeometry(geometry: [number, number][]): Waypoint | null {
  if (geometry.length < 2) return null;
  const idx = Math.floor(geometry.length / 2);
  const [lat, lng] = geometry[idx];
  return { latitude: lat, longitude: lng };
}

export function RoutePlanMap({
  start,
  end,
  bendPoint,
  geometry,
  places,
  excludedPlaceIds,
  selectingPoint,
  onMoveStart,
  onMoveEnd,
  onBendRoute,
  onTogglePlace,
  onMapPress,
}: RoutePlanMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);

  const polyline: LatLng[] =
    geometry.length > 0
      ? geometry.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
      : [start, end].filter(Boolean).map((p) => ({
          latitude: p!.latitude,
          longitude: p!.longitude,
        }));

  const handlePoint = bendPoint ?? midpointOfGeometry(geometry);

  useEffect(() => {
    if (!mapRef.current) return;
    const points: LatLng[] = [];
    if (start) points.push({ latitude: start.latitude, longitude: start.longitude });
    if (end) points.push({ latitude: end.latitude, longitude: end.longitude });
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
  }, [start, end, geometry]);

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

  const handleMapPress = (e: MapPressEvent) => {
    if (!selectingPoint || !onMapPress) return;
    onMapPress({
      latitude: e.nativeEvent.coordinate.latitude,
      longitude: e.nativeEvent.coordinate.longitude,
    });
  };

  const bannerColor = selectingPoint === "start" ? "#22c55e" : "#ef4444";
  const bannerLabel =
    selectingPoint === "start" ? "Tap map to set start point" : "Tap map to set end point";

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        onPress={selectingPoint ? handleMapPress : undefined}
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
            draggable={!selectingPoint}
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
            draggable={!selectingPoint}
            onDragEnd={(e: MarkerDragStartEndEvent) =>
              onMoveEnd?.({
                latitude: e.nativeEvent.coordinate.latitude,
                longitude: e.nativeEvent.coordinate.longitude,
              })
            }
          />
        )}

        {handlePoint && geometry.length >= 2 && !selectingPoint && (
          <Marker
            coordinate={{
              latitude: handlePoint.latitude,
              longitude: handlePoint.longitude,
            }}
            title="Drag to reshape route"
            anchor={{ x: 0.5, y: 0.5 }}
            draggable
            tracksViewChanges={false}
            onDragEnd={(e: MarkerDragStartEndEvent) =>
              onBendRoute?.({
                latitude: e.nativeEvent.coordinate.latitude,
                longitude: e.nativeEvent.coordinate.longitude,
              })
            }
          >
            <View style={[styles.bendHandleOuter, { borderColor: colors.primary }]}>
              <View style={[styles.bendHandleInner, { backgroundColor: colors.primary }]} />
            </View>
          </Marker>
        )}

        {!selectingPoint && places.map((p) => {
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

      {selectingPoint && (
        <View style={[styles.banner, { backgroundColor: bannerColor }]}>
          <Text style={styles.bannerText}>{bannerLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 16, overflow: "hidden" },
  map: { flex: 1 },
  bendHandleOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  bendHandleInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  banner: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  bannerText: {
    color: "white",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
