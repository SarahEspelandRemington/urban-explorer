import { BlurView } from "expo-blur";
import Constants from "expo-constants";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";
import {
  ExploreTabIcon,
  SavedTabIcon,
  WalkTabIcon,
} from "@/components/StreetlitTabIcon";

function NativeTabLayout() {
  const t = useT();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "safari", selected: "safari.fill" }} />
        <Label>{t.tabs.explore}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="walk">
        <Icon
          sf={{ default: "figure.walk", selected: "figure.walk.circle.fill" }}
        />
        <Label>{t.tabs.walk}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} />
        <Label>{t.tabs.saved}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const t = useT();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.explore,
          tabBarIcon: ({ color }) => <ExploreTabIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="walk"
        options={{
          title: t.tabs.walk,
          tabBarIcon: ({ color }) => <WalkTabIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: t.tabs.saved,
          tabBarIcon: ({ color }) => <SavedTabIcon color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const isExpoGo = Constants.executionEnvironment === "storeClient";
  if (!isExpoGo && isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
