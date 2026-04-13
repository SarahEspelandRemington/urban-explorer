import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LocationPermission } from "@/components/LocationPermission";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceMapView } from "@/components/PlaceMapView";
import { useColors } from "@/hooks/useColors";
import { useDiscoverPlaces } from "@workspace/api-client-react";

interface DiscoveredPlace {
  id: string;
  name: string;
  category: string;
  yearBuilt?: string;
  summary: string;
  facts: string[];
  latitude: number;
  longitude: number;
  distanceMeters?: number;
}

type ViewMode = "list" | "map";

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const discoverMutation = useDiscoverPlaces();

  const places = (discoverMutation.data?.places as DiscoveredPlace[] | undefined) ?? [];
  const areaName = discoverMutation.data?.location ?? "";

  const getLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(loc);
      return loc;
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permission?.granted && !location) {
      getLocation();
    }
  }, [permission?.granted, location, getLocation]);

  const handleDiscover = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    let loc = location;
    if (!loc) {
      loc = await getLocation();
    }
    if (loc) {
      discoverMutation.mutate({
        data: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          radius: 300,
        },
      });
    }
  }, [location, discoverMutation, getLocation]);

  useEffect(() => {
    if (location && !discoverMutation.data && !discoverMutation.isPending) {
      discoverMutation.mutate({
        data: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          radius: 300,
        },
      });
    }
  }, [location]);

  const toggleViewMode = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setViewMode((prev) => (prev === "list" ? "map" : "list"));
  };

  if (!permission?.granted) {
    return (
      <LocationPermission
        permission={permission}
        requestPermission={requestPermission}
      />
    );
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const showContent = places.length > 0 && !discoverMutation.isPending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + webTopInset + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            {locationLoading ? "Locating..." : areaName || "Ready to explore"}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Discover
          </Text>
        </View>
        <View style={styles.headerActions}>
          {showContent && (
            <View style={[styles.toggleContainer, { backgroundColor: colors.muted }]}>
              <Pressable
                onPress={() => { setViewMode("list"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[
                  styles.toggleButton,
                  viewMode === "list" && { backgroundColor: colors.card },
                ]}
              >
                <Feather
                  name="list"
                  size={16}
                  color={viewMode === "list" ? colors.foreground : colors.mutedForeground}
                />
              </Pressable>
              <Pressable
                onPress={() => { setViewMode("map"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[
                  styles.toggleButton,
                  viewMode === "map" && { backgroundColor: colors.card },
                ]}
              >
                <Feather
                  name="map"
                  size={16}
                  color={viewMode === "map" ? colors.foreground : colors.mutedForeground}
                />
              </Pressable>
            </View>
          )}
          <Pressable
            onPress={handleDiscover}
            disabled={discoverMutation.isPending || locationLoading}
            style={({ pressed }) => [
              styles.discoverButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            {discoverMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="compass" size={20} color={colors.primaryForeground} />
            )}
          </Pressable>
        </View>
      </View>

      {showContent && viewMode === "map" ? (
        <PlaceMapView
          places={places}
          userLatitude={location?.coords.latitude ?? 0}
          userLongitude={location?.coords.longitude ?? 0}
        />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <PlaceCard place={item} index={index} />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + webBottomInset + 90 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={discoverMutation.isPending}
              onRefresh={handleDiscover}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            discoverMutation.isPending ? (
              <Animated.View
                entering={Platform.OS !== "web" ? FadeIn : undefined}
                style={styles.loadingContainer}
              >
                <ActivityIndicator size="large" color={colors.primary} />
                <Text
                  style={[styles.loadingText, { color: colors.mutedForeground }]}
                >
                  Discovering nearby places...
                </Text>
                <Text
                  style={[styles.loadingSubtext, { color: colors.mutedForeground }]}
                >
                  Looking up history and stories
                </Text>
              </Animated.View>
            ) : discoverMutation.isError ? (
              <View style={styles.emptyContainer}>
                <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
                <Text
                  style={[styles.emptyTitle, { color: colors.foreground }]}
                >
                  Something went wrong
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  We couldn't find places nearby. Try again.
                </Text>
                <Pressable
                  onPress={handleDiscover}
                  style={({ pressed }) => [
                    styles.retryButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Feather name="refresh-cw" size={16} color={colors.primaryForeground} />
                  <Text
                    style={[
                      styles.retryText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Feather name="compass" size={40} color={colors.mutedForeground} />
                <Text
                  style={[styles.emptyTitle, { color: colors.foreground }]}
                >
                  Start Exploring
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  Tap the compass to discover interesting places around you
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  greeting: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 2,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 2,
  },
  toggleContainer: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
  },
  toggleButton: {
    width: 34,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  discoverButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: 16,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    marginTop: 8,
  },
  loadingSubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
