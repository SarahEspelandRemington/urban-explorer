import { Feather } from "@expo/vector-icons";
import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

import { useColors } from "@/hooks/useColors";

interface PlaceDetailMapProps {
  latitude: number;
  longitude: number;
  name: string;
}

export function PlaceDetailMap({ latitude, longitude, name }: PlaceDetailMapProps) {
  const colors = useColors();

  const handleOpenMaps = () => {
    const scheme = Platform.select({
      ios: `maps:0,0?q=${name}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${name})`,
    });
    if (scheme) {
      Linking.openURL(scheme).catch(() => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
      });
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.mapContainer, { borderColor: colors.border }]}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude,
            longitude,
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
          <Marker
            coordinate={{ latitude, longitude }}
            title={name}
            pinColor={colors.primary}
          />
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
        <Text style={[styles.directionsText, { color: colors.primaryForeground }]}>
          Get Directions
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
