import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

interface LocationPermissionProps {
  permission: Location.LocationPermissionResponse | null;
  requestPermission: () => Promise<Location.LocationPermissionResponse>;
}

export function LocationPermission({
  permission,
  requestPermission,
}: LocationPermissionProps) {
  const colors = useColors();

  if (!permission) return null;

  const denied =
    !permission.granted &&
    permission.status === "denied" &&
    !permission.canAskAgain;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: colors.primary + "18" },
        ]}
      >
        <Feather name="map-pin" size={36} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Enable Location
      </Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Urban Explorer needs your location to discover interesting buildings and
        historical sites near you.
      </Text>
      {denied ? (
        Platform.OS !== "web" ? (
          <Pressable
            onPress={() => {
              try {
                Linking.openSettings();
              } catch {}
            }}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather name="settings" size={18} color={colors.primaryForeground} />
            <Text
              style={[styles.buttonText, { color: colors.primaryForeground }]}
            >
              Open Settings
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.deniedText, { color: colors.mutedForeground }]}>
            Location access was denied. Please enable it in your browser settings.
          </Text>
        )
      ) : (
        <Pressable
          onPress={requestPermission}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Feather name="navigation" size={18} color={colors.primaryForeground} />
          <Text
            style={[styles.buttonText, { color: colors.primaryForeground }]}
          >
            Allow Location Access
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  deniedText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
