import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

const DISCOVERY_MESSAGES = [
  "Digging through the archives...",
  "Checking old maps and records...",
  "Unearthing local secrets...",
  "What's hiding in plain sight here...",
  "Your personal time machine is warming up...",
  "Building your personal history guide...",
  "Every spot has a story — finding yours now...",
  "Crafting discoveries just for this spot — hang tight...",
];

const DETAIL_MESSAGES = [
  "Digging deeper into the archives...",
  "Uncovering the full story...",
  "Piecing together forgotten chapters...",
  "Crafting a history just for this place...",
];

interface LoadingMessagesProps {
  variant?: "discovery" | "detail";
  interval?: number;
  style?: any;
}

export function LoadingMessages({ variant = "discovery", interval = 4000, style }: LoadingMessagesProps) {
  const colors = useColors();
  const messages = variant === "detail" ? DETAIL_MESSAGES : DISCOVERY_MESSAGES;
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [interval, messages.length]);

  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} key={index}>
      <Text style={[styles.message, { color: colors.mutedForeground }, style]}>
        {messages[index]}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
