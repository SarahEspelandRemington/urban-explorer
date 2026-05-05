import React from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

type AnimationVariant = "fadeIn" | "fadeInDown";

interface StillLoadingHintProps {
  hint: string;
  variant?: AnimationVariant;
  duration?: number;
}

const DEFAULT_DURATION = 600;

function buildAnimation(variant: AnimationVariant, duration: number) {
  switch (variant) {
    case "fadeIn":
      return FadeIn.duration(duration);
    case "fadeInDown":
      return FadeInDown.duration(duration);
  }
}

export function StillLoadingHint({ hint, variant = "fadeInDown", duration = DEFAULT_DURATION }: StillLoadingHintProps) {
  const colors = useColors();

  return (
    <Animated.Text
      entering={buildAnimation(variant, duration)}
      style={[styles.text, { color: colors.mutedForeground }]}
    >
      {hint}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    opacity: 0.7,
    marginTop: 4,
  },
});
