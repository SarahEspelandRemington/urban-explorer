import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";

interface LoadingMessagesProps {
  variant?: "discovery" | "detail";
  interval?: number;
  style?: any;
}

export function LoadingMessages({ variant = "discovery", interval = 4000, style }: LoadingMessagesProps) {
  const colors = useColors();
  const t = useT();
  const messages = variant === "detail" ? t.loadingMessages.detail : t.loadingMessages.discovery;
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
        {messages[index % messages.length]}
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
