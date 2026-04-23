import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { unlockWebSpeech } from "@/hooks/useNarration";
import { useSuggestLocations } from "@workspace/api-client-react";

interface LocationSuggestion {
  name: string;
  description: string;
}

interface LocationPermissionProps {
  permission: Location.LocationPermissionResponse | null;
  requestPermission: () => Promise<Location.LocationPermissionResponse>;
  onManualLocation: (query: string) => void;
  isGeocoding?: boolean;
  geocodeError?: string | null;
  showBackButton?: boolean;
  onBack?: () => void;
  onWalkMode?: () => void;
}

export function LocationPermission({
  permission,
  requestPermission,
  onManualLocation,
  isGeocoding,
  geocodeError,
  showBackButton,
  onBack,
  onWalkMode,
}: LocationPermissionProps) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(!!showBackButton);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestMutation = useSuggestLocations();

  if (!permission) return null;

  const denied =
    !permission.granted &&
    permission.status === "denied" &&
    !permission.canAskAgain;

  const handleSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setShowSuggestions(false);
    onManualLocation(trimmed);
  };

  const handleSelectSuggestion = (suggestion: LocationSuggestion) => {
    setQuery(suggestion.name);
    setShowSuggestions(false);
    Keyboard.dismiss();
    onManualLocation(suggestion.name);
  };

  const handleQueryChange = (text: string) => {
    setQuery(text);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (text.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      suggestMutation.mutate(
        { data: { query: text.trim() } },
        {
          onSuccess: (data: any) => {
            if (data?.suggestions?.length > 0) {
              setSuggestions(data.suggestions);
              setShowSuggestions(true);
            } else {
              setSuggestions([]);
              setShowSuggestions(false);
            }
          },
          onError: () => {
            setSuggestions([]);
            setShowSuggestions(false);
          },
        },
      );
    }, 400);
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
            <View style={styles.inputWrapper}>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    borderBottomLeftRadius: showSuggestions ? 0 : 12,
                    borderBottomRightRadius: showSuggestions ? 0 : 12,
                  },
                ]}
              >
                <Feather name="search" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="e.g. Greenwich Village, NYC"
                  placeholderTextColor={colors.mutedForeground}
                  value={query}
                  onChangeText={handleQueryChange}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  autoFocus
                  editable={!isGeocoding}
                />
                {suggestMutation.isPending && (
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                )}
                {query.length > 0 && !isGeocoding && !suggestMutation.isPending && (
                  <Pressable
                    onPress={() => {
                      setQuery("");
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    hitSlop={8}
                  >
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>

              {showSuggestions && suggestions.length > 0 && (
                <ScrollView
                  style={[
                    styles.suggestionsContainer,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {suggestions.map((suggestion, index) => (
                    <Pressable
                      key={`${suggestion.name}-${index}`}
                      onPress={() => handleSelectSuggestion(suggestion)}
                      style={({ pressed }) => [
                        styles.suggestionItem,
                        {
                          backgroundColor: pressed ? colors.muted : "transparent",
                          borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                          borderTopColor: colors.border,
                        },
                      ]}
                    >
                      <Feather name="map-pin" size={14} color={colors.primary} style={styles.suggestionIcon} />
                      <View style={styles.suggestionText}>
                        <Text
                          style={[styles.suggestionName, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {suggestion.name}
                        </Text>
                        <Text
                          style={[styles.suggestionDesc, { color: colors.mutedForeground }]}
                          numberOfLines={1}
                        >
                          {suggestion.description}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
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
              accessibilityRole="button"
              accessibilityLabel={isGeocoding ? "Finding location" : "Explore this location"}
              accessibilityState={{ disabled: !query.trim() || isGeocoding }}
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

            {showBackButton ? (
              <Pressable
                onPress={() => {
                  setSuggestions([]);
                  setShowSuggestions(false);
                  onBack?.();
                }}
                style={({ pressed }) => [
                  styles.switchLink,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Back to results"
              >
                <Feather name="arrow-left" size={14} color={colors.primary} />
                <Text style={[styles.switchText, { color: colors.primary }]}>
                  Back to results
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setShowSearch(false);
                  setSuggestions([]);
                  setShowSuggestions(false);
                }}
                style={({ pressed }) => [
                  styles.switchLink,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Use my current location instead"
              >
                <Feather name="navigation" size={14} color={colors.primary} />
                <Text style={[styles.switchText, { color: colors.primary }]}>
                  Use my current location instead
                </Text>
              </Pressable>
            )}
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
                  accessibilityRole="button"
                  accessibilityLabel="Open device settings to enable location"
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
                accessibilityRole="button"
                accessibilityLabel="Allow location access"
                accessibilityHint="Grants the app permission to use your GPS location"
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
              accessibilityRole="button"
              accessibilityLabel="Search by location"
              accessibilityHint="Enter a city or address to explore manually"
            >
              <Feather name="search" size={18} color={colors.foreground} />
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                Search by Location
              </Text>
            </Pressable>

            {onWalkMode && (
              <>
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                <Pressable
                  onPress={() => {
                    unlockWebSpeech();
                    onWalkMode?.();
                  }}
                  style={({ pressed }) => [
                    styles.walkButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Start Walking"
                  accessibilityHint="Start walking with audio narration of nearby places"
                >
                  <Feather name="headphones" size={18} color={colors.primaryForeground} />
                  <View style={styles.walkButtonText}>
                    <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                      Start Walking
                    </Text>
                    <Text style={[styles.walkSubtext, { color: colors.primaryForeground + "bb" }]}>
                      Skip ahead — explore on foot with audio
                    </Text>
                  </View>
                </Pressable>
              </>
            )}
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
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
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
  inputWrapper: {
    width: "100%",
    zIndex: 10,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    width: "100%",
    justifyContent: "center",
  },
  walkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
  },
  walkButtonText: {
    flex: 1,
  },
  walkSubtext: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
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
  suggestionsContainer: {
    maxHeight: 240,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.2,
  },
  suggestionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
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
