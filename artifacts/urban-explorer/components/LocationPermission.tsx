import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

interface LocationPermissionProps {
  permission: Location.LocationPermissionResponse | null;
  requestPermission: () => Promise<Location.LocationPermissionResponse>;
  onManualLocation: (query: string) => void;
  isGeocoding?: boolean;
  geocodeError?: string | null;
}

export function LocationPermission({
  permission,
  requestPermission,
  onManualLocation,
  isGeocoding,
  geocodeError,
}: LocationPermissionProps) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  if (!permission) return null;

  const denied =
    !permission.granted &&
    permission.status === "denied" &&
    !permission.canAskAgain;

  const handleSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    onManualLocation(trimmed);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: colors.primary + "18" },
          ]}
        >
          <Feather name="map-pin" size={36} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {showSearch ? "Search a Location" : "Enable Location"}
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {showSearch
            ? "Enter a city, neighborhood, intersection, or address to explore."
            : "Urban Explorer needs your location to discover interesting buildings and historical sites near you."}
        </Text>

        {showSearch ? (
          <View style={styles.searchSection}>
            <View
              style={[
                styles.inputContainer,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="search" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="e.g. Greenwich Village, NYC"
                placeholderTextColor={colors.mutedForeground}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoFocus
                editable={!isGeocoding}
              />
              {query.length > 0 && !isGeocoding && (
                <Pressable onPress={() => setQuery("")} hitSlop={8}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>

            {geocodeError && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {geocodeError}
              </Text>
            )}

            <Pressable
              onPress={handleSearch}
              disabled={!query.trim() || isGeocoding}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: colors.primary,
                  opacity: !query.trim() || isGeocoding ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
            >
              {isGeocoding ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Feather name="compass" size={18} color={colors.primaryForeground} />
              )}
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                {isGeocoding ? "Finding location..." : "Explore This Location"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowSearch(false)}
              style={({ pressed }) => [
                styles.switchLink,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="navigation" size={14} color={colors.primary} />
              <Text style={[styles.switchText, { color: colors.primary }]}>
                Use my current location instead
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.buttonsSection}>
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
                  <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                    Open Settings
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.deniedText, { color: colors.mutedForeground }]}>
                  Location access was denied. Please enable it in your browser settings, or search for a location below.
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
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                  Allow Location Access
                </Text>
              </Pressable>
            )}

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <Pressable
              onPress={() => setShowSearch(true)}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="search" size={18} color={colors.foreground} />
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                Search by Location
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
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
  buttonsSection: {
    width: "100%",
    alignItems: "center",
    gap: 16,
    marginTop: 8,
  },
  searchSection: {
    width: "100%",
    alignItems: "center",
    gap: 14,
    marginTop: 8,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    width: "100%",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    width: "100%",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  switchLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  switchText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  deniedText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
