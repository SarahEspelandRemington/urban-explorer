import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";
import { loadCustomMessages } from "@/lib/customMessages";

interface LoadingMessagesProps {
  variant?: "discovery" | "detail";
  interval?: number;
  style?: any;
}

export function LoadingMessages({ variant = "discovery", interval = 4000, style }: LoadingMessagesProps) {
  const colors = useColors();
  const t = useT();
  const defaultMessages = variant === "detail" ? t.loadingMessages.detail : t.loadingMessages.discovery;
  const [messages, setMessages] = useState<string[]>(defaultMessages);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadCustomMessages().then((custom) => {
      const customForVariant = variant === "discovery" ? custom.discovery : custom.detail;
      if (customForVariant && customForVariant.length > 0) {
        setMessages(customForVariant);
      }
    });
  }, [variant]);

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
