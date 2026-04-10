import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDiscovery } from "@/contexts/DiscoveryContext";
import { useColors } from "@/hooks/useColors";
import { useGetPlaceDetail } from "@workspace/api-client-react";

const CATEGORY_ICONS: Record<string, string> = {
  building: "office-building",
  monument: "pillar",
  park: "tree",
  bridge: "bridge",
  church: "church",
  museum: "bank",
  theater: "drama-masks",
  "historic site": "castle",
};

export default function PlaceDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { savePlace, removePlace, isPlaceSaved } = useDiscovery();

  const params = useLocalSearchParams<{
    name: string;
    latitude: string;
    longitude: string;
    category: string;
    yearBuilt: string;
    summary: string;
    facts: string;
  }>();

  const lat = parseFloat(params.latitude || "0");
  const lng = parseFloat(params.longitude || "0");
  const basicFacts: string[] = params.facts ? JSON.parse(params.facts) : [];
  const placeId = `${params.name}-${lat}-${lng}`;
  const saved = isPlaceSaved(placeId);
  const iconName = CATEGORY_ICONS[params.category?.toLowerCase() || ""] || "map-marker";

  const detailMutation = useGetPlaceDetail();

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
  }, [params.name]);

  const detail = detailMutation.data;

  const handleSave = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (saved) {
      removePlace(placeId);
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
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={handleSave} hitSlop={12}>
          <Feather
            name="bookmark"
            size={22}
            color={saved ? colors.primary : colors.mutedForeground}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.iconContainer, { backgroundColor: colors.primary + "18" }]}>
          <MaterialCommunityIcons name={iconName as any} size={32} color={colors.primary} />
        </View>

        <Text style={[styles.name, { color: colors.foreground }]}>{params.name}</Text>

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
        </View>

        <Text style={[styles.summary, { color: colors.mutedForeground }]}>
          {params.summary}
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Quick Facts
        </Text>
        {basicFacts.map((fact, i) => (
          <Animated.View
            key={i}
            entering={Platform.OS !== "web" ? FadeInDown.delay(i * 80) : undefined}
            style={[styles.factCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.factNumber, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[styles.factNumberText, { color: colors.primary }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.factContent, { color: colors.foreground }]}>{fact}</Text>
          </Animated.View>
        ))}

        {detailMutation.isPending ? (
          <View style={styles.detailLoading}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.detailLoadingText, { color: colors.mutedForeground }]}>
              Loading detailed history...
            </Text>
          </View>
        ) : detail ? (
          <Animated.View entering={Platform.OS !== "web" ? FadeInUp.delay(200) : undefined}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              History
            </Text>
            <Text style={[styles.historyText, { color: colors.foreground }]}>
              {detail.fullHistory}
            </Text>

            {detail.architecturalStyle ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>
                  Architecture
                </Text>
                <Text style={[styles.historyText, { color: colors.foreground }]}>
                  {detail.architecturalStyle}
                </Text>
              </>
            ) : null}

            {detail.notableEvents && detail.notableEvents.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>
                  Notable Events
                </Text>
                {detail.notableEvents.map((event: string, i: number) => (
                  <View key={i} style={styles.eventRow}>
                    <View style={[styles.eventDot, { backgroundColor: colors.accent }]} />
                    <Text style={[styles.eventText, { color: colors.foreground }]}>{event}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {detail.funFacts && detail.funFacts.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>
                  More Fun Facts
                </Text>
                {detail.funFacts.map((fact: string, i: number) => (
                  <View
                    key={i}
                    style={[styles.funFactCard, { backgroundColor: colors.primary + "0a" }]}
                  >
                    <Feather name="zap" size={14} color={colors.primary} />
                    <Text style={[styles.funFactText, { color: colors.foreground }]}>{fact}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {detail.nearbyRelated && detail.nearbyRelated.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>
                  Nearby Related
                </Text>
                <View style={styles.relatedRow}>
                  {detail.nearbyRelated.map((name: string, i: number) => (
                    <View
                      key={i}
                      style={[styles.relatedChip, { backgroundColor: colors.muted }]}
                    >
                      <Feather name="map-pin" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.relatedText, { color: colors.foreground }]}>{name}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  name: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textTransform: "capitalize",
  },
  summary: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  factCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
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
});
