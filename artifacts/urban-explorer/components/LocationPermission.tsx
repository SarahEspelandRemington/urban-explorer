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
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

import { useT } from "@/contexts/LocaleContext";
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
  onWalkPlan?: () => void;
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
  onWalkPlan,
}: LocationPermissionProps) {
  const colors = useColors();
  const t = useT();
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={styles.content}
          entering={
            Platform.OS !== "web" ? FadeInDown.duration(300) : undefined
          }
          exiting={Platform.OS !== "web" ? FadeOutUp.duration(300) : undefined}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.primary + "18" },
            ]}
          >
            <Feather name="map-pin" size={36} color={colors.primary} />
          </View>
          <Animated.Text
            key={showSearch ? "title-search" : "title-enable"}
            style={[styles.title, { color: colors.foreground }]}
            entering={
              Platform.OS !== "web" ? FadeInDown.duration(200) : undefined
            }
            exiting={
              Platform.OS !== "web" ? FadeOutUp.duration(160) : undefined
            }
          >
            {showSearch
              ? t.locationPermission.titleSearch
              : t.locationPermission.titleEnable}
          </Animated.Text>
          <Animated.Text
            key={showSearch ? "desc-search" : "desc-enable"}
            style={[styles.description, { color: colors.mutedForeground }]}
            entering={
              Platform.OS !== "web" ? FadeInDown.duration(200) : undefined
            }
            exiting={
              Platform.OS !== "web" ? FadeOutUp.duration(160) : undefined
            }
          >
            {showSearch
              ? t.locationPermission.descriptionSearch
              : t.locationPermission.descriptionEnable}
          </Animated.Text>

          {showSearch ? (
            <Animated.View
              key="search-section"
              style={styles.searchSection}
              entering={
                Platform.OS !== "web" ? FadeInDown.duration(220) : undefined
              }
              exiting={
                Platform.OS !== "web" ? FadeOutUp.duration(180) : undefined
              }
            >
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
                  <Feather
                    name="search"
                    size={18}
                    color={colors.mutedForeground}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder={t.locationPermission.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    value={query}
                    onChangeText={handleQueryChange}
                    onSubmitEditing={handleSearch}
                    returnKeyType="search"
                    autoFocus
                    editable={!isGeocoding}
                  />
                  {suggestMutation.isPending && (
                    <ActivityIndicator
                      size="small"
                      color={colors.mutedForeground}
                    />
                  )}
                  {query.length > 0 &&
                    !isGeocoding &&
                    !suggestMutation.isPending && (
                      <Pressable
                        onPress={() => {
                          setQuery("");
                          setSuggestions([]);
                          setShowSuggestions(false);
                        }}
                        hitSlop={8}
                      >
                        <Feather
                          name="x"
                          size={16}
                          color={colors.mutedForeground}
                        />
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
                            backgroundColor: pressed
                              ? colors.muted
                              : "transparent",
                            borderTopWidth:
                              index > 0 ? StyleSheet.hairlineWidth : 0,
                            borderTopColor: colors.border,
                          },
                        ]}
                      >
                        <Feather
                          name="map-pin"
                          size={14}
                          color={colors.primary}
                          style={styles.suggestionIcon}
                        />
                        <View style={styles.suggestionText}>
                          <Text
                            style={[
                              styles.suggestionName,
                              { color: colors.foreground },
                            ]}
                            numberOfLines={1}
                          >
                            {suggestion.name}
                          </Text>
                          <Text
                            style={[
                              styles.suggestionDesc,
                              { color: colors.mutedForeground },
                            ]}
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
                <Text
                  style={[styles.errorText, { color: colors.destructive }]}
                >
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
                    opacity:
                      !query.trim() || isGeocoding ? 0.5 : pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  isGeocoding ? "Finding location" : "Explore this location"
                }
                accessibilityState={{ disabled: !query.trim() || isGeocoding }}
              >
                {isGeocoding ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primaryForeground}
                  />
                ) : (
                  <Feather
                    name="compass"
                    size={18}
                    color={colors.primaryForeground}
                  />
                )}
                <Text
                  style={[
                    styles.buttonText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  {isGeocoding
                    ? t.locationPermission.finding
                    : t.locationPermission.exploreThis}
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
                  <Feather
                    name="arrow-left"
                    size={14}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.switchText, { color: colors.primary }]}
                  >
                    {t.locationPermission.backToResults}
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
                  <Feather
                    name="navigation"
                    size={14}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.switchText, { color: colors.primary }]}
                  >
                    {t.locationPermission.useCurrentInstead}
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          ) : (
            <Animated.View
              key="buttons-section"
              style={styles.buttonsSection}
              entering={
                Platform.OS !== "web" ? FadeInDown.duration(220) : undefined
              }
              exiting={
                Platform.OS !== "web" ? FadeOutUp.duration(180) : undefined
              }
            >
              {/* EXPLORE card */}
              <View
                style={[
                  styles.modeCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.modeLabel, { color: colors.mutedForeground }]}
                >
                  {t.tabs.explore}
                </Text>
                <Text
                  style={[styles.modeHeadline, { color: colors.foreground }]}
                >
                  {t.locationPermission.exploreHeadline}
                </Text>
                <Text
                  style={[
                    styles.modeBody,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {t.locationPermission.exploreBody}
                </Text>
                <View style={styles.modeActions}>
                  <Pressable
                    onPress={() => setShowSearch(true)}
                    style={({ pressed }) => [
                      styles.cardButton,
                      {
                        backgroundColor: colors.primary,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Search by location"
                    accessibilityHint="Enter a city or address to explore manually"
                  >
                    <Feather
                      name="search"
                      size={16}
                      color={colors.primaryForeground}
                    />
                    <Text
                      style={[
                        styles.cardButtonText,
                        { color: colors.primaryForeground },
                      ]}
                    >
                      {t.locationPermission.searchByLocation}
                    </Text>
                  </Pressable>

                  {denied ? (
                    Platform.OS !== "web" ? (
                      <Pressable
                        onPress={() => {
                          try {
                            Linking.openSettings();
                          } catch {}
                        }}
                        style={({ pressed }) => [
                          styles.cardButtonGhost,
                          {
                            borderColor: colors.border,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Open device settings to enable location"
                      >
                        <Feather
                          name="settings"
                          size={16}
                          color={colors.foreground}
                        />
                        <Text
                          style={[
                            styles.cardButtonGhostText,
                            { color: colors.foreground },
                          ]}
                        >
                          {t.locationPermission.openSettings}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text
                        style={[
                          styles.deniedText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {t.locationPermission.deniedWeb}
                      </Text>
                    )
                  ) : (
                    <Pressable
                      onPress={requestPermission}
                      style={({ pressed }) => [
                        styles.cardButtonGhost,
                        {
                          borderColor: colors.border,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Allow location access"
                      accessibilityHint="Grants the app permission to use your GPS location"
                    >
                      <Feather
                        name="navigation"
                        size={16}
                        color={colors.foreground}
                      />
                      <Text
                        style={[
                          styles.cardButtonGhostText,
                          { color: colors.foreground },
                        ]}
                      >
                        {t.locationPermission.allow}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* WALK card */}
              {onWalkMode && (
                <View
                  style={[
                    styles.modeCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t.tabs.walk}
                  </Text>
                  <Text
                    style={[
                      styles.modeHeadline,
                      { color: colors.foreground },
                    ]}
                  >
                    {t.locationPermission.walkHeadline}
                  </Text>
                  <Text
                    style={[
                      styles.modeBody,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t.locationPermission.walkBody}
                  </Text>
                  <View style={styles.modeActions}>
                    <Pressable
                      onPress={() => {
                        unlockWebSpeech();
                        onWalkMode?.();
                      }}
                      style={({ pressed }) => [
                        styles.cardButton,
                        {
                          backgroundColor: colors.primary,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Start Walking"
                      accessibilityHint="Start walking with audio narration of nearby places"
                    >
                      <Feather
                        name="headphones"
                        size={16}
                        color={colors.primaryForeground}
                      />
                      <Text
                        style={[
                          styles.cardButtonText,
                          { color: colors.primaryForeground },
                        ]}
                      >
                        {t.locationPermission.startWalking}
                      </Text>
                    </Pressable>

                    {onWalkPlan && (
                      <Pressable
                        onPress={onWalkPlan}
                        style={({ pressed }) => [
                          styles.cardButtonGhost,
                          {
                            borderColor: colors.border,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Plan a Walk"
                        accessibilityHint="Pre-fetch stops along a planned route before walking"
                      >
                        <Feather
                          name="map"
                          size={16}
                          color={colors.foreground}
                        />
                        <Text
                          style={[
                            styles.cardButtonGhostText,
                            { color: colors.foreground },
                          ]}
                        >
                          {t.walkPlan.title}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </Animated.View>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 40,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
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
    gap: 12,
    marginTop: 8,
  },
  modeCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 4,
  },
  modeLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  modeHeadline: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  modeBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginTop: 2,
  },
  modeActions: {
    gap: 10,
    marginTop: 16,
  },
  cardButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: "center",
  },
  cardButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  cardButtonGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
  },
  cardButtonGhostText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
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
