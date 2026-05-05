import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LoadingMessages } from "@/components/LoadingMessages";
import { StillLoadingHint } from "@/components/StillLoadingHint";
import { NoteModal } from "@/components/NoteModal";
import { PlaceActions } from "@/components/PlaceActions";
import { PlaceDetailMap } from "@/components/PlaceDetailMap";
import { PlaceTimeline } from "@/components/PlaceTimeline";
import { SaveToast } from "@/components/SaveToast";
import { getCategoryColor, getCategoryIcon } from "@/constants/categories";
import { useDiscovery } from "@/contexts/DiscoveryContext";
import { buildPlaceId } from "@/lib/placeId";
import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";
import { useStillLoading } from "@/hooks/useStillLoading";
import {
  useGetPlaceDetail,
  useGetPlaceTimeline,
} from "@workspace/api-client-react";

export default function PlaceDetailScreen() {
  const colors = useColors();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { savePlace, removePlace, isPlaceSaved, updateNote } = useDiscovery();
  const [toastVisible, setToastVisible] = React.useState(false);
  const [toastSaved, setToastSaved] = React.useState(true);
  const [noteModalVisible, setNoteModalVisible] = React.useState(false);

  const params = useLocalSearchParams<{
    name: string;
    latitude: string;
    longitude: string;
    category: string;
    yearBuilt: string;
    tags: string;
    summary: string;
    facts: string;
    address: string;
    photoUrl: string;
    /** Uniqueness token injected by related-place navigation so expo-router treats
     *  each drill-down as a distinct stack entry rather than reusing the existing
     *  place-detail entry. Never read at runtime; only present in the URL. */
    _push?: string;
  }>();

  const lat = parseFloat(params.latitude || "0");
  const lng = parseFloat(params.longitude || "0");
  const basicFacts = React.useMemo<string[]>(() => {
    try {
      return params.facts ? (JSON.parse(params.facts) as string[]) : [];
    } catch {
      return [];
    }
  }, [params.facts]);
  const tags = React.useMemo<string[]>(() => {
    try {
      return params.tags ? (JSON.parse(params.tags) as string[]) : [];
    } catch {
      return [];
    }
  }, [params.tags]);
  const placeId = React.useMemo(
    () => (params.name ? buildPlaceId(params.name, lat, lng) : ""),
    [params.name, lat, lng],
  );
  const saved = isPlaceSaved(placeId);
  const iconName = getCategoryIcon(params.category || "");
  const categoryColor = getCategoryColor(params.category || "", colors);

  const detailMutation = useGetPlaceDetail();
  const timelineMutation = useGetPlaceTimeline();
  const [timelineLoaded, setTimelineLoaded] = React.useState(false);
  const showStillLoading = useStillLoading(detailMutation.isPending);

  React.useEffect(() => {
    if (params.name) {
      detailMutation.mutate({
        data: {
          placeName: params.name,
          latitude: lat,
          longitude: lng,
          category: params.category,
        },
      });
    }
    // Re-fetch only when the place identity changes. lat/lng can drift slightly
    // for the same place; we don't want to re-narrate on every GPS jitter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.name]);

  const detail = detailMutation.data;

  const handleLoadTimeline = React.useCallback(() => {
    if (timelineMutation.isPending || timelineLoaded) return;
    setTimelineLoaded(true);
    timelineMutation.mutate({
      data: {
        placeName: params.name,
        latitude: lat,
        longitude: lng,
        category: params.category,
        yearBuilt: params.yearBuilt || undefined,
      },
    });
  }, [
    params.name,
    lat,
    lng,
    params.category,
    params.yearBuilt,
    timelineMutation,
    timelineLoaded,
  ]);

  const handleSave = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (saved) {
      removePlace(placeId);
      setToastSaved(false);
      setToastVisible(false);
      setTimeout(() => setToastVisible(true), 10);
    } else {
      savePlace({
        id: placeId,
        name: params.name,
        category: params.category,
        yearBuilt: params.yearBuilt,
        summary: params.summary,
        facts: basicFacts,
        latitude: lat,
        longitude: lng,
      });
      setToastSaved(true);
      setToastVisible(false);
      setTimeout(() => setToastVisible(true), 10);
      setNoteModalVisible(true);
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + webTopInset + 8,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel={t.placeDetail.goBackAccessibility}
          style={styles.topBarButton}
        >
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={handleSave}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel={
            saved
              ? `${t.placeDetail.removeSavedAccessibility} ${params.name}`
              : `${t.placeDetail.saveAccessibility} ${params.name}`
          }
          accessibilityState={{ selected: saved }}
          style={styles.topBarButton}
        >
          <Feather
            name="bookmark"
            size={22}
            color={saved ? colors.primary : colors.mutedForeground}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {params.photoUrl ? (
          <Image
            source={{ uri: params.photoUrl }}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityLabel={`${t.placeDetail.photoOf} ${params.name}`}
          />
        ) : null}

        <View style={styles.content}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: categoryColor + "18" },
            ]}
          >
            <MaterialCommunityIcons
              name={iconName as any}
              size={24}
              color={categoryColor}
            />
          </View>

          <Text style={[styles.name, { color: colors.foreground }]}>
            {params.name}
          </Text>

          {params.address ? (
            <View style={styles.addressRow}>
              <Feather
                name="map-pin"
                size={14}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.addressText, { color: colors.mutedForeground }]}
              >
                {params.address}
              </Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            {params.category ? (
              <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                <Text style={[styles.badgeText, { color: colors.foreground }]}>
                  {params.category}
                </Text>
              </View>
            ) : null}
            {params.yearBuilt ? (
              <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                <Text style={[styles.badgeText, { color: colors.foreground }]}>
                  {params.yearBuilt}
                </Text>
              </View>
            ) : null}
            {tags.map((tag) => (
              <View
                key={tag}
                style={[
                  styles.badge,
                  { backgroundColor: categoryColor + "15" },
                ]}
              >
                <Text style={[styles.badgeText, { color: categoryColor }]}>
                  #{tag}
                </Text>
              </View>
            ))}
          </View>

          <Text style={[styles.summary, { color: colors.mutedForeground }]}>
            {params.summary}
          </Text>

          <PlaceActions
            place={{
              id: placeId,
              name: params.name,
              category: params.category,
              yearBuilt: params.yearBuilt,
              summary: params.summary,
              facts: basicFacts,
              latitude: lat,
              longitude: lng,
            }}
          />

          <View style={styles.mapSection}>
            <PlaceDetailMap
              latitude={lat}
              longitude={lng}
              name={params.name}
              address={params.address}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t.placeDetail.quickFacts}
          </Text>
          {basicFacts.map((fact, i) => (
            <Animated.View
              key={i}
              entering={
                Platform.OS !== "web" ? FadeInDown.delay(i * 80) : undefined
              }
              style={[
                styles.factCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.factNumber,
                  { backgroundColor: colors.primary + "18" },
                ]}
              >
                <Text
                  style={[styles.factNumberText, { color: colors.primary }]}
                >
                  {i + 1}
                </Text>
              </View>
              <Text style={[styles.factContent, { color: colors.foreground }]}>
                {fact}
              </Text>
            </Animated.View>
          ))}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <PlaceTimeline
            eras={timelineMutation.data?.eras}
            isLoading={timelineMutation.isPending}
            error={timelineMutation.isError}
            onLoad={handleLoadTimeline}
            onRetry={() => {
              setTimelineLoaded(false);
              timelineMutation.reset();
              // Actually re-fire the request — reset() alone only cleared the
              // error state; without mutate() no new network call is made.
              timelineMutation.mutate({
                data: {
                  placeName: params.name,
                  latitude: lat,
                  longitude: lng,
                  category: params.category,
                  yearBuilt: params.yearBuilt || undefined,
                },
              });
            }}
            hasLoaded={timelineLoaded}
          />

          {detailMutation.isPending ? (
            <View style={styles.detailLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <LoadingMessages variant="detail" />
              {showStillLoading ? (
                <StillLoadingHint
                  hint={t.placeDetail.stillLoading}
                  variant="fadeInDown"
                  exiting={FadeOutDown.duration(300)}
                />
              ) : null}
            </View>
          ) : detailMutation.isError ? (
            <View style={styles.detailLoading}>
              <Feather
                name="alert-circle"
                size={20}
                color={colors.destructive}
              />
              <Text
                style={[
                  styles.detailLoadingText,
                  { color: colors.mutedForeground },
                ]}
              >
                {t.placeDetail.couldNotLoad}
              </Text>
              <Pressable
                onPress={() =>
                  detailMutation.mutate({
                    data: {
                      placeName: params.name,
                      latitude: lat,
                      longitude: lng,
                      category: params.category,
                    },
                  })
                }
                style={[styles.retryButton, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={t.placeDetail.retryHistoryAccessibility}
              >
                <Text style={[styles.retryText, { color: colors.accent }]}>
                  {t.common.retry}
                </Text>
              </Pressable>
            </View>
          ) : detail ? (
            <Animated.View
              entering={Platform.OS !== "web" ? FadeInUp.delay(200) : undefined}
            >
              <View
                style={[styles.divider, { backgroundColor: colors.border }]}
              />

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t.placeDetail.history}
              </Text>
              <Text style={[styles.historyText, { color: colors.foreground }]}>
                {detail.fullHistory}
              </Text>

              {detail.architecturalStyle ? (
                <>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.foreground, marginTop: 24 },
                    ]}
                  >
                    {t.placeDetail.architecture}
                  </Text>
                  <Text
                    style={[styles.historyText, { color: colors.foreground }]}
                  >
                    {detail.architecturalStyle}
                  </Text>
                </>
              ) : null}

              {detail.notableEvents && detail.notableEvents.length > 0 ? (
                <>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.foreground, marginTop: 24 },
                    ]}
                  >
                    {t.placeDetail.notableEvents}
                  </Text>
                  {detail.notableEvents.map((event: string, i: number) => (
                    <View key={i} style={styles.eventRow}>
                      <View
                        style={[
                          styles.eventDot,
                          { backgroundColor: colors.accent },
                        ]}
                      />
                      <Text
                        style={[styles.eventText, { color: colors.foreground }]}
                      >
                        {event}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}

              {detail.funFacts && detail.funFacts.length > 0 ? (
                <>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.foreground, marginTop: 24 },
                    ]}
                  >
                    {t.placeDetail.moreFunFacts}
                  </Text>
                  {detail.funFacts.map((fact: string, i: number) => (
                    <View
                      key={i}
                      style={[
                        styles.funFactCard,
                        { backgroundColor: colors.primary + "0a" },
                      ]}
                    >
                      <Feather name="zap" size={14} color={colors.primary} />
                      <Text
                        style={[
                          styles.funFactText,
                          { color: colors.foreground },
                        ]}
                      >
                        {fact}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}

              {detail.nearbyRelated && detail.nearbyRelated.length > 0 ? (
                <>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.foreground, marginTop: 24 },
                    ]}
                  >
                    {t.placeDetail.nearbyRelated}
                  </Text>
                  <View style={styles.relatedRow}>
                    {detail.nearbyRelated.map((related, i) => {
                      const relatedName =
                        typeof related === "string" ? related : related.name;
                      const relatedLat =
                        typeof related === "string" ? null : related.latitude;
                      const relatedLng =
                        typeof related === "string" ? null : related.longitude;
                      const relatedCategory =
                        typeof related === "string"
                          ? undefined
                          : related.category;
                      return (
                        <Pressable
                          key={i}
                          onPress={() => {
                            if (Platform.OS !== "web")
                              Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Light,
                              );
                            if (relatedLat != null && relatedLng != null) {
                              router.push({
                                pathname: "/place-detail",
                                params: {
                                  name: relatedName,
                                  latitude: String(relatedLat),
                                  longitude: String(relatedLng),
                                  category: relatedCategory ?? "",
                                  // Unique token so expo-router pushes a new stack entry
                                  // instead of reusing the existing place-detail screen.
                                  _push: String(Date.now()),
                                },
                              });
                            } else {
                              router.push({
                                pathname: "/investigate",
                                params: { prefillAddress: relatedName },
                              });
                            }
                          }}
                          style={({ pressed }) => [
                            styles.relatedChip,
                            {
                              backgroundColor: colors.muted,
                              opacity: pressed ? 0.75 : 1,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${t.placeDetail.lookUp} ${relatedName}`}
                        >
                          <Feather
                            name="map-pin"
                            size={12}
                            color={colors.primary}
                          />
                          <Text
                            style={[
                              styles.relatedText,
                              { color: colors.foreground },
                            ]}
                          >
                            {relatedName}
                          </Text>
                          <Feather
                            name="chevron-right"
                            size={12}
                            color={colors.mutedForeground}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>

      <NoteModal
        visible={noteModalVisible}
        placeName={params.name}
        existingNote={undefined}
        onSave={(note) => {
          updateNote(placeId, note);
          setNoteModalVisible(false);
        }}
        onSkip={() => setNoteModalVisible(false)}
      />

      <SaveToast
        visible={toastVisible}
        label={toastSaved ? t.saved.savedConfirm : t.saved.removedConfirm}
        onHide={() => setToastVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroImage: {
    width: "100%",
    height: 220,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  content: {
    padding: 20,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  name: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  addressText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  topBarButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  mapSection: {
    marginTop: 20,
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  factCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  factNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  factNumberText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  factContent: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  detailLoading: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 10,
  },
  detailLoadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  historyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
  },
  eventText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  funFactCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  funFactText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  relatedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  relatedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  relatedText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
