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
  /**
   * Override the starting displacement (in pixels) for directional variants
   * (`slideInLeft`, `slideInRight`, `fadeInUp`, `fadeInDown`). The value is
   * used as the signed magnitude of the initial offset in the natural direction
   * of each variant: a larger positive number produces a more dramatic entrance,
   * while a smaller positive number produces a subtler one. Passing a negative
   * value inverts the starting direction of travel. Has no effect on `fadeIn`,
   * `bounceIn`, or `zoomIn`.
   */
  initialOffset?: number;
  /**
   * How long to wait (in milliseconds) before the entrance animation begins.
   * Callers that show the hint immediately can pass a small value for a snappier
   * feel; screens where content arrives slowly can pass a larger value to avoid
   * the hint flickering in before real content has had a chance to load.
   * Defaults to 0 (no delay).
   */
  delay?: number;
}

const DEFAULT_DURATION = 600;

function buildAnimation(
  variant: AnimationVariant,
  duration: number,
  easing?: EasingFunction,
  initialOffset?: number,
  delay?: number,
) {
  switch (variant) {
    case "fadeIn": {
      let anim = FadeIn.duration(duration);
      if (easing) anim = anim.easing(easing);
      if (delay !== undefined) anim = anim.delay(delay);
      return anim;
    }
    case "fadeInDown": {
      let anim = FadeInDown.duration(duration);
      if (easing) anim = anim.easing(easing);
      if (initialOffset !== undefined) {
        anim = anim.withInitialValues({ transform: [{ translateY: -initialOffset }] });
      }
      if (delay !== undefined) anim = anim.delay(delay);
      return anim;
    }
    case "fadeInUp": {
      let anim = FadeInUp.duration(duration);
      if (easing) anim = anim.easing(easing);
      if (initialOffset !== undefined) {
        anim = anim.withInitialValues({ transform: [{ translateY: initialOffset }] });
      }
      if (delay !== undefined) anim = anim.delay(delay);
      return anim;
    }
    case "slideInLeft": {
      let anim = SlideInLeft.duration(duration);
      if (easing) anim = anim.easing(easing);
      if (initialOffset !== undefined) {
        anim = anim.withInitialValues({ transform: [{ translateX: -initialOffset }] });
      }
      if (delay !== undefined) anim = anim.delay(delay);
      return anim;
    }
    case "slideInRight": {
      let anim = SlideInRight.duration(duration);
      if (easing) anim = anim.easing(easing);
      if (initialOffset !== undefined) {
        anim = anim.withInitialValues({ transform: [{ translateX: initialOffset }] });
      }
      if (delay !== undefined) anim = anim.delay(delay);
      return anim;
    }
    case "bounceIn": {
      // BounceIn uses internal withSequence/withTiming calls for its spring
      // physics, so the easing prop has no meaningful effect and is intentionally
      // not forwarded here.
      let anim = BounceIn.duration(duration);
      if (delay !== undefined) anim = anim.delay(delay);
      return anim;
    }
    case "zoomIn": {
      let anim = ZoomIn.duration(duration);
      if (easing) anim = anim.easing(easing);
      if (delay !== undefined) anim = anim.delay(delay);
      return anim;
    }
  }
}

export function StillLoadingHint({
  hint,
  variant = "fadeInDown",
  duration = DEFAULT_DURATION,
  easing,
  initialOffset,
  delay,
}: StillLoadingHintProps) {
  const colors = useColors();

  return (
    <Animated.Text
      entering={buildAnimation(variant, duration, easing, initialOffset, delay)}
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
