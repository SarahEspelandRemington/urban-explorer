import React from "react";
import { StyleSheet } from "react-native";
import Animated, {
  BounceIn,
  EasingFunction,
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInLeft,
  SlideInRight,
  ZoomIn,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

type AnimationVariant =
  | "fadeIn"
  | "fadeInDown"
  | "fadeInUp"
  | "slideInLeft"
  | "slideInRight"
  | "bounceIn"
  | "zoomIn";

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
    case "fadeInUp": {
      const anim = FadeInUp.duration(duration);
      return easing ? anim.easing(easing) : anim;
    }
    case "slideInLeft": {
      const anim = SlideInLeft.duration(duration);
      return easing ? anim.easing(easing) : anim;
    }
    case "slideInRight": {
      const anim = SlideInRight.duration(duration);
      return easing ? anim.easing(easing) : anim;
    }
    case "bounceIn": {
      // BounceIn uses internal withSequence/withTiming calls for its spring
      // physics, so the easing prop has no meaningful effect and is intentionally
      // not forwarded here.
      return BounceIn.duration(duration);
    }
    case "zoomIn": {
      const anim = ZoomIn.duration(duration);
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
