import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_DEFAULT, Region } from "react-native-maps";

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
      clusters.push({ key: p.id, latitude: p.latitude, longitude: p.longitude, places: group });
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
  userLatitude,
  userLongitude,
  places,
  narratedIds,
  followUser = true,
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

  const clusters = useMemo(() => clusterPlaces(places, region), [places, region]);

  const handleClusterPress = (cluster: Cluster) => {
    if (cluster.places.length <= 1) return;
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
    mapRef.current?.animateToRegion(
      {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta,
        longitudeDelta,
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
        followsUserLocation={followUser}
      >
        <Circle
          center={{ latitude: userLatitude, longitude: userLongitude }}
          radius={80}
          fillColor={colors.primary + "15"}
          strokeColor={colors.primary + "40"}
          strokeWidth={1}
        />

        {clusters.map((cluster) => {
          if (cluster.places.length === 1) {
            const place = cluster.places[0];
            return (
              <Marker
                key={cluster.key}
                coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                title={place.name}
                pinColor={narratedIds.has(place.id) ? colors.mutedForeground : colors.primary}
                opacity={narratedIds.has(place.id) ? 0.5 : 1}
              />
            );
          }
          const allNarrated = cluster.places.every((p) => narratedIds.has(p.id));
          const bg = allNarrated ? colors.mutedForeground : colors.primary;
          const size = cluster.places.length >= 100 ? 52 : cluster.places.length >= 10 ? 44 : 36;
          return (
            <Marker
              key={cluster.key}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              onPress={() => handleClusterPress(cluster)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
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
                <Text style={[styles.clusterText, { color: colors.primaryForeground }]}>
                  {cluster.places.length}
                </Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
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
});
