import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";

interface PlaceDetailMapProps {
  latitude: number;
  longitude: number;
  name: string;
  address?: string;
}

export function PlaceDetailMap({
  latitude,
  longitude,
  name,
  address,
}: PlaceDetailMapProps) {
  const colors = useColors();
  const t = useT();
  const [coords, setCoords] = useState({ latitude, longitude });

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await Location.geocodeAsync(address);
        if (!cancelled && results.length > 0) {
          setCoords({
            latitude: results[0].latitude,
            longitude: results[0].longitude,
          });
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const handleOpenMaps = async () => {
    const searchQuery = address || name;
    const encodedQuery = encodeURIComponent(searchQuery);

    const urls = Platform.select({
      ios: [
        `maps:0,0?q=${encodedQuery}&ll=${latitude},${longitude}`,
        `https://maps.apple.com/?q=${encodedQuery}&ll=${latitude},${longitude}`,
        `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
      ],
      android: [
        `geo:${latitude},${longitude}?q=${encodedQuery}`,
        `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
      ],
      default: [
        `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
      ],
    }) as string[];

    for (const url of urls) {
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          return;
        }
      } catch {}
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.mapContainer, { borderColor: colors.border }]}>
        <MapView
          style={styles.map}
          region={{
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.003,
            longitudeDelta: 0.003,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsUserLocation
          provider={PROVIDER_DEFAULT}
        >
          <Marker coordinate={coords} title={name} pinColor={colors.primary} />
        </MapView>
      </View>
      <Pressable
        onPress={handleOpenMaps}
        style={({ pressed }) => [
          styles.directionsButton,
          {
            backgroundColor: colors.primary,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Feather name="navigation" size={16} color={colors.primaryForeground} />
        <Text
          style={[styles.directionsText, { color: colors.primaryForeground }]}
        >
          {t.placeDetailMap.getDirections}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  mapContainer: {
    height: 180,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
  },
  map: {
    flex: 1,
  },
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  directionsText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
