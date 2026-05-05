import React from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

type AnimationVariant = "fadeIn" | "fadeInDown";

interface StillLoadingHintProps {
  hint: string;
  variant?: AnimationVariant;
}

const ANIMATIONS: Record<AnimationVariant, React.ComponentProps<typeof Animated.Text>["entering"]> = {
  fadeIn: FadeIn.duration(600),
  fadeInDown: FadeInDown.duration(600),
};

export function StillLoadingHint({ hint, variant = "fadeInDown" }: StillLoadingHintProps) {
  const colors = useColors();

  return (
    <Animated.Text
      entering={ANIMATIONS[variant]}
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
