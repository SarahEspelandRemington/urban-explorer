import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddressInput } from "@/components/AddressInput";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { LoadingMessages } from "@/components/LoadingMessages";
import { StillLoadingHint } from "@/components/StillLoadingHint";
import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";
import { useStillLoading } from "@/hooks/useStillLoading";
import { useInvestigateAddress } from "@workspace/api-client-react";

interface Suggestion {
  name: string;
  description: string;
  latitude?: number;
  longitude?: number;
}

export default function InvestigateScreen() {
  const colors = useColors();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    nearLocation?: string;
    prefillAddress?: string;
    autoFill?: string;
  }>();

  const addressInputRef = useRef<TextInput>(null);

  const shouldAutoFill = params.autoFill === "true" && !!params.prefillAddress;

  const [address, setAddress] = useState(
    shouldAutoFill ? (params.prefillAddress ?? "") : "",
  );
  const [pickedCoords, setPickedCoords] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const [chipDismissed, setChipDismissed] = useState(shouldAutoFill);
  const [showRefinementInput, setShowRefinementInput] = useState(false);

  useEffect(() => {
    if (!shouldAutoFill || !params.prefillAddress) return;
    // Address is already set in state at mount; submit immediately so the
    // user lands on the loading/result state without showing the input UI.
    handleSubmit();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showChip =
    !!params.prefillAddress && !chipDismissed && address.length === 0;

  const handleChipPress = useCallback(() => {
    if (!params.prefillAddress) return;
    setAddress(params.prefillAddress);
    setChipDismissed(true);
    const len = params.prefillAddress.length;
    setTimeout(() => {
      addressInputRef.current?.focus();
      addressInputRef.current?.setNativeProps({
        selection: { start: len, end: len },
      });
    }, 50);
  }, [params.prefillAddress]);

  const investigate = useInvestigateAddress();
  const result = investigate.data;
  const error = investigate.error as {
    status?: number;
    message?: string;
    data?: { suggestions?: string[] };
  } | null;
  const showStillLoading = useStillLoading(investigate.isPending);

  const handleSelectSuggestion = useCallback((s: Suggestion) => {
    if (typeof s.latitude === "number" && typeof s.longitude === "number") {
      setPickedCoords({ lat: s.latitude, lng: s.longitude, name: s.name });
    } else {
      setPickedCoords(null);
    }
  }, []);

  const handleChangeAddress = useCallback((text: string) => {
    setAddress(text);
    // Auto-dismiss the suggestion chip as soon as the user types anything.
    if (text.length > 0) {
      setChipDismissed(true);
    }
    // Only invalidate picked coords if the text has truly diverged from the
    // suggestion the user picked. Tolerates trailing edits like adding a unit
    // number or zip while preserving the precise coords.
    setPickedCoords((prev) => {
      if (!prev) return null;
      const trimmedText = text.trim();
      if (trimmedText === prev.name || trimmedText.startsWith(prev.name))
        return prev;
      return null;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = address.trim();
    if (trimmed.length < 3) return;
    Keyboard.dismiss();
    setShowRefinementInput(false);
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    investigate.mutate({
      data: {
        address: trimmed,
        ...(pickedCoords
          ? { latitude: pickedCoords.lat, longitude: pickedCoords.lng }
          : {}),
      },
    });
  }, [address, pickedCoords, investigate]);

  const handleTryDifferentName = useCallback(() => {
    setShowRefinementInput(true);
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => {
      addressInputRef.current?.focus();
      const len = address.length;
      addressInputRef.current?.setNativeProps({
        selection: { start: 0, end: len },
      });
    }, 80);
  }, [address]);

  const handleSuggestionChipPress = useCallback((suggestion: string) => {
    setAddress(suggestion);
    setPickedCoords(null);
    setShowRefinementInput(true);
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => {
      addressInputRef.current?.focus();
      addressInputRef.current?.setNativeProps({
        selection: { start: 0, end: suggestion.length },
      });
    }, 80);
  }, []);

  const canSubmit = address.trim().length >= 3 && !investigate.isPending;

  const isEmptyResult = useMemo(() => {
    if (!result || investigate.isPending) return false;
    return (
      !result.buildingName &&
      !result.history &&
      !(result.facts && result.facts.length > 0)
    );
  }, [result, investigate.isPending]);

  const errorMessage = useMemo(() => {
    if (!error) return null;
    if (error.status === 404) {
      return t.investigate.notFoundError;
    }
    if (error.status === 429 || error.status === 503) {
      return t.investigate.busyError;
    }
    return t.investigate.genericError;
  }, [error, t]);

  const errorTip = useMemo(() => {
    if (!error) return null;
    if (error.status === 404) {
      return t.investigate.notFoundErrorTip;
    }
    if (error.status === 429 || error.status === 503) {
      return t.investigate.busyErrorTip;
    }
    return null;
  }, [error, t]);

  const errorSuggestions = useMemo(() => {
    if (!error || error.status !== 404) return [];
    const suggestions = error.data?.suggestions;
    if (!Array.isArray(suggestions)) return [];
    return suggestions.filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
  }, [error]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {shouldAutoFill && params.prefillAddress
              ? params.prefillAddress
              : t.investigate.headerTitle}
          </Text>
          {!shouldAutoFill && (
            <Text
              style={[styles.headerSubtitle, { color: colors.mutedForeground }]}
            >
              {t.investigate.headerSubtitle}
            </Text>
          )}
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 80 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        {(!shouldAutoFill || showRefinementInput) && (
          <View style={styles.inputBlock}>
            <AddressInput
              ref={addressInputRef}
              value={address}
              onChangeText={handleChangeAddress}
              onSelectSuggestion={handleSelectSuggestion}
              onSubmitEditing={handleSubmit}
              placeholder={t.investigate.placeholder}
              dotColor={colors.primary}
              returnKeyType="search"
              nearLocation={params.nearLocation ?? null}
              testID="investigate-address-input"
            />

            {showChip && !showRefinementInput && (
              <Animated.View
                style={styles.chipRow}
                entering={
                  Platform.OS !== "web" ? FadeInDown.duration(300) : undefined
                }
                exiting={
                  Platform.OS !== "web" ? FadeOutDown.duration(180) : undefined
                }
              >
                <Pressable
                  onPress={handleChipPress}
                  style={[
                    styles.prefillChip,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.investigate.nearestChipPrefix} ${params.prefillAddress}`}
                  accessibilityHint={t.investigate.nearestChipDismiss}
                >
                  <Feather name="map-pin" size={12} color={colors.primary} />
                  <Text
                    style={[
                      styles.prefillChipText,
                      { color: colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {t.investigate.nearestChipPrefix}{" "}
                    <Text style={{ color: colors.primary }}>
                      {params.prefillAddress}
                    </Text>
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setChipDismissed(true)}
                  hitSlop={8}
                  accessibilityLabel={t.investigate.nearestChipDismiss}
                  style={[
                    styles.chipDismiss,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Feather name="x" size={12} color={colors.mutedForeground} />
                </Pressable>
              </Animated.View>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: canSubmit ? colors.primary : colors.muted,
                  opacity: pressed && canSubmit ? 0.9 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Investigate this address"
            >
              {investigate.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather
                    name="search"
                    size={16}
                    color={
                      canSubmit
                        ? colors.primaryForeground
                        : colors.mutedForeground
                    }
                  />
                  <Text
                    style={[
                      styles.submitText,
                      {
                        color: canSubmit
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {t.investigate.investigate}
                  </Text>
                </>
              )}
            </Pressable>

            {!showRefinementInput && (
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                {t.investigate.hint}
              </Text>
            )}
          </View>
        )}

        {errorMessage && (
          <>
            <Animated.View
              entering={Platform.OS !== "web" ? FadeInUp : undefined}
              style={[
                styles.errorCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Feather
                name="alert-circle"
                size={18}
                color={colors.mutedForeground}
              />
              <Text style={[styles.errorText, { color: colors.foreground }]}>
                {errorMessage}
              </Text>
            </Animated.View>
            {errorTip && (
              <Text
                style={[styles.errorTip, { color: colors.mutedForeground }]}
              >
                {errorTip}
              </Text>
            )}
            {errorSuggestions.length > 0 && (
              <Animated.View
                entering={
                  Platform.OS !== "web" ? FadeInDown.duration(300) : undefined
                }
                style={styles.searchSuggestionsRow}
              >
                {errorSuggestions.map((suggestion, index) => (
                  <Pressable
                    key={index}
                    onPress={() => handleSuggestionChipPress(suggestion)}
                    style={({ pressed }) => [
                      styles.searchSuggestionChip,
                      {
                        backgroundColor: colors.muted,
                        borderColor: colors.primary,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.investigate.searchSuggestionsPrefix} ${suggestion}`}
                    accessibilityHint={t.investigate.searchSuggestionsHint}
                  >
                    <Feather name="search" size={11} color={colors.primary} />
                    <Text
                      style={[
                        styles.searchSuggestionChipText,
                        { color: colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      <Text style={{ color: colors.mutedForeground }}>
                        {t.investigate.searchSuggestionsPrefix}{" "}
                      </Text>
                      {suggestion}
                    </Text>
                  </Pressable>
                ))}
              </Animated.View>
            )}
            {!showRefinementInput && (
              <Animated.View
                entering={
                  Platform.OS !== "web" ? FadeInDown.duration(250) : undefined
                }
              >
                <Pressable
                  onPress={handleTryDifferentName}
                  style={({ pressed }) => [
                    styles.refinementButton,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t.investigate.tryDifferentName}
                >
                  <Feather name="edit-2" size={14} color={colors.primary} />
                  <Text
                    style={[
                      styles.refinementButtonText,
                      { color: colors.foreground },
                    ]}
                  >
                    {t.investigate.tryDifferentName}
                  </Text>
                </Pressable>
              </Animated.View>
            )}
          </>
        )}

        {investigate.isPending && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <LoadingMessages variant="discovery" />
            {showStillLoading ? (
              <StillLoadingHint
                hint={t.investigate.stillLoading}
                variant="fadeInDown"
                exiting={FadeOutDown.duration(300)}
              />
            ) : null}
          </View>
        )}

        {isEmptyResult && !showRefinementInput && (
          <Animated.View
            entering={
              Platform.OS !== "web" ? FadeInDown.duration(250) : undefined
            }
          >
            <Pressable
              onPress={handleTryDifferentName}
              style={({ pressed }) => [
                styles.refinementButton,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t.investigate.tryDifferentName}
            >
              <Feather name="edit-2" size={14} color={colors.primary} />
              <Text
                style={[
                  styles.refinementButtonText,
                  { color: colors.foreground },
                ]}
              >
                {t.investigate.tryDifferentName}
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {result && !investigate.isPending && (
          <Animated.View
            entering={Platform.OS !== "web" ? FadeInDown : undefined}
            style={[
              styles.resultCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={[styles.resultAddress, { color: colors.mutedForeground }]}
            >
              {result.address}
            </Text>

            {isEmptyResult ? (
              <>
                <View
                  style={[
                    styles.emptyResultBox,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.muted,
                    },
                  ]}
                >
                  <Feather
                    name="info"
                    size={14}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.emptyResultText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t.investigate.emptyResult}
                  </Text>
                </View>
                <Text
                  style={[styles.errorTip, { color: colors.mutedForeground }]}
                >
                  {t.investigate.emptyResultTip}
                </Text>
                {result.searchSuggestions &&
                  result.searchSuggestions.length > 0 && (
                    <Animated.View
                      entering={
                        Platform.OS !== "web"
                          ? FadeInDown.duration(300)
                          : undefined
                      }
                      style={styles.searchSuggestionsRow}
                    >
                      {result.searchSuggestions.map((suggestion, index) => (
                        <Pressable
                          key={index}
                          onPress={() => handleSuggestionChipPress(suggestion)}
                          style={({ pressed }) => [
                            styles.searchSuggestionChip,
                            {
                              backgroundColor: colors.muted,
                              borderColor: colors.primary,
                              opacity: pressed ? 0.75 : 1,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${t.investigate.searchSuggestionsPrefix} ${suggestion}`}
                          accessibilityHint={
                            t.investigate.searchSuggestionsHint
                          }
                        >
                          <Feather
                            name="search"
                            size={11}
                            color={colors.primary}
                          />
                          <Text
                            style={[
                              styles.searchSuggestionChipText,
                              { color: colors.foreground },
                            ]}
                            numberOfLines={1}
                          >
                            <Text style={{ color: colors.mutedForeground }}>
                              {t.investigate.searchSuggestionsPrefix}{" "}
                            </Text>
                            {suggestion}
                          </Text>
                        </Pressable>
                      ))}
                    </Animated.View>
                  )}
              </>
            ) : null}

            {result.buildingName ? (
              <Text style={[styles.resultName, { color: colors.foreground }]}>
                {result.buildingName}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              {result.yearBuilt ? (
                <View style={[styles.chip, { backgroundColor: colors.muted }]}>
                  <Feather
                    name="clock"
                    size={12}
                    color={colors.mutedForeground}
                  />
                  <Text style={[styles.chipText, { color: colors.foreground }]}>
                    {result.yearBuilt}
                  </Text>
                </View>
              ) : null}
              {result.originalUse ? (
                <View style={[styles.chip, { backgroundColor: colors.muted }]}>
                  <Feather
                    name="home"
                    size={12}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[styles.chipText, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {t.investigate.originallyPrefix}{" "}
                    {summarize(result.originalUse, 40)}
                  </Text>
                </View>
              ) : null}
            </View>

            <Section
              title={t.investigate.sectionOriginally}
              colors={colors}
              body={result.originalUse}
            />
            <Section
              title={t.investigate.sectionToday}
              colors={colors}
              body={result.currentUse}
            />
            <Section
              title={t.investigate.sectionWhatToLookFor}
              colors={colors}
              body={result.architecturalStyle}
            />
            <Section
              title={t.investigate.sectionHistory}
              colors={colors}
              body={result.history}
            />

            {result.facts && result.facts.length > 0 ? (
              <View style={styles.section}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {t.investigate.sectionFacts}
                </Text>
                {result.facts.map((f: string, i: number) => (
                  <View key={i} style={styles.factRow}>
                    <View
                      style={[
                        styles.factDot,
                        { backgroundColor: colors.primary },
                      ]}
                    />
                    <Text
                      style={[styles.factText, { color: colors.foreground }]}
                    >
                      {f}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Section
              title={t.investigate.sectionBlockContext}
              colors={colors}
              body={result.neighborhoodContext}
            />

            {result.uncertainty ? (
              <View
                style={[
                  styles.uncertaintyBox,
                  { borderColor: colors.border, backgroundColor: colors.muted },
                ]}
              >
                <Feather name="info" size={14} color={colors.mutedForeground} />
                <Text
                  style={[
                    styles.uncertaintyText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {result.uncertainty}
                </Text>
              </View>
            ) : null}
          </Animated.View>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function Section({
  title,
  body,
  colors,
}: {
  title: string;
  body?: string;
  colors: ReturnType<typeof useColors>;
}) {
  if (!body) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
        {title}
      </Text>
      <Text style={[styles.sectionBody, { color: colors.foreground }]}>
        {body}
      </Text>
    </View>
  );
}

function summarize(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  backButton: { padding: 4, marginTop: 2 },
  headerTextWrap: { flex: 1, paddingLeft: 4 },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  inputBlock: { gap: 10 },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  submitText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    paddingHorizontal: 2,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  prefillChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 0,
  },
  prefillChipText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  chipDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  errorTip: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  loadingContainer: {
    paddingVertical: 36,
    alignItems: "center",
    gap: 14,
  },
  resultCard: {
    padding: 18,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  resultAddress: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  resultName: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.4,
    marginTop: -6,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    maxWidth: "100%",
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  section: { gap: 6 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionBody: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 4,
  },
  factDot: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
  factText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  uncertaintyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  uncertaintyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    fontStyle: "italic",
  },
  emptyResultBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyResultText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  refinementButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  refinementButtonText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  searchSuggestionsRow: {
    flexDirection: "column",
    gap: 6,
    marginTop: 4,
  },
  searchSuggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchSuggestionChipText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
});
