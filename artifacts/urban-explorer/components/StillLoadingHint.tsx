import React from "react";
import { StyleSheet } from "react-native";
import Animated, { EasingFunction, FadeIn, FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

type AnimationVariant = "fadeIn" | "fadeInDown";

interface StillLoadingHintProps {
  hint: string;
  variant?: AnimationVariant;
  duration?: number;
  easing?: EasingFunction;
}

const DEFAULT_DURATION = 600;

function buildAnimation(variant: AnimationVariant, duration: number, easing?: EasingFunction) {
  switch (variant) {
    case "fadeIn": {
      const anim = FadeIn.duration(duration);
      return easing ? anim.easing(easing) : anim;
    }
    case "fadeInDown": {
      const anim = FadeInDown.duration(duration);
      return easing ? anim.easing(easing) : anim;
    }
  }
}

export function StillLoadingHint({ hint, variant = "fadeInDown", duration = DEFAULT_DURATION, easing }: StillLoadingHintProps) {
  const colors = useColors();

  return (
    <Animated.Text
      entering={buildAnimation(variant, duration, easing)}
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
