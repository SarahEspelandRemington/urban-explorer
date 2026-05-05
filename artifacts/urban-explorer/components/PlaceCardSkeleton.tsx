import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  count?: number;
}

/**
 * Lightweight placeholder cards rendered while the first /discover call is
 * in flight. Replaces the previous spinner so a brand-new user sees the
 * familiar shape of the result list immediately and the screen never
 * appears frozen.
 */
export function PlaceCardSkeleton({ count = 4 }: Props) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === "web") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });
  const blockBg = colors.muted;

  return (
    <View
      style={styles.wrapper}
      accessibilityLabel="Loading nearby places"
      accessibilityRole="progressbar"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity,
            },
          ]}
        >
          <View
            style={[
              styles.titleBar,
              {
                backgroundColor: blockBg,
                width: idx % 2 === 0 ? "70%" : "55%",
              },
            ]}
          />
          <View style={[styles.metaBar, { backgroundColor: blockBg }]} />
          <View style={[styles.bodyBar, { backgroundColor: blockBg }]} />
          <View
            style={[styles.bodyBar, { backgroundColor: blockBg, width: "85%" }]}
          />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 4,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  titleBar: {
    height: 16,
    borderRadius: 6,
  },
  metaBar: {
    height: 11,
    width: "40%",
    borderRadius: 5,
  },
  bodyBar: {
    height: 10,
    width: "100%",
    borderRadius: 5,
  },
});
