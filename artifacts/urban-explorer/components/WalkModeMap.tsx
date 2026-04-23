import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_DEFAULT } from "react-native-maps";

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
  followUser?: boolean;
}

export function WalkModeMap({
  userLatitude,
  userLongitude,
  places,
  narratedIds,
  followUser = true,
}: WalkModeMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);

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
        followsUserLocation={followUser}
      >
        <Circle
          center={{ latitude: userLatitude, longitude: userLongitude }}
          radius={80}
          fillColor={colors.primary + "15"}
          strokeColor={colors.primary + "40"}
          strokeWidth={1}
        />

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
