import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Circle, LatLng, Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";

import { useColors } from "@/hooks/useColors";

interface WalkPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface WalkModeMapProps {
  userLatitude: number;
  userLongitude: number;
  places: WalkPlace[];
  narratedIds: Set<string>;
  routeGeometry?: [number, number][];
  startPoint?: { latitude: number; longitude: number } | null;
  endPoint?: { latitude: number; longitude: number } | null;
  followUser?: boolean;
}

export function WalkModeMap({
  userLatitude,
  userLongitude,
  places,
  narratedIds,
  routeGeometry,
  startPoint,
  endPoint,
  followUser = true,
}: WalkModeMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);
  const didFitRef = useRef(false);

  const polyline: LatLng[] =
    routeGeometry && routeGeometry.length > 0
      ? routeGeometry.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
      : [];

  useEffect(() => {
    if (didFitRef.current) return;
    if (polyline.length < 2 || !mapRef.current) return;
    didFitRef.current = true;
    const points: LatLng[] = [...polyline, { latitude: userLatitude, longitude: userLongitude }];
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 80, bottom: 240, left: 50, right: 50 },
      animated: true,
    });
  }, [polyline, userLatitude, userLongitude]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: userLatitude,
          longitude: userLongitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        followsUserLocation={followUser && polyline.length === 0}
      >
        {polyline.length >= 2 && (
          <Polyline
            coordinates={polyline}
            strokeColor={colors.primary}
            strokeWidth={5}
            lineCap="round"
          />
        )}

        <Circle
          center={{ latitude: userLatitude, longitude: userLongitude }}
          radius={80}
          fillColor={colors.primary + "15"}
          strokeColor={colors.primary + "40"}
          strokeWidth={1}
        />

        {startPoint && (
          <Marker
            coordinate={startPoint}
            title="Start"
            pinColor="#22c55e"
          />
        )}
        {endPoint && (
          <Marker
            coordinate={endPoint}
            title="End"
            pinColor="#ef4444"
          />
        )}

        {places.map((place) => (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.latitude, longitude: place.longitude }}
            title={place.name}
            pinColor={narratedIds.has(place.id) ? colors.mutedForeground : colors.primary}
            opacity={narratedIds.has(place.id) ? 0.5 : 1}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 16, overflow: "hidden" },
  map: { flex: 1 },
});
