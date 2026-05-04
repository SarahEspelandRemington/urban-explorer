import React from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

interface StillLoadingHintProps {
  hint: string;
}

export function StillLoadingHint({ hint }: StillLoadingHintProps) {
  const colors = useColors();

  return (
    <Animated.Text
      entering={FadeInDown.duration(600)}
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
