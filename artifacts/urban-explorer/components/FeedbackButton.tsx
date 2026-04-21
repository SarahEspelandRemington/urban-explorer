import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFeedback } from "@/contexts/FeedbackContext";

import { FeedbackCaptureSheet } from "./FeedbackCaptureSheet";

export function FeedbackButton() {
  const feedback = useFeedback();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  if (!feedback.enabled) return null;

  const handleTap = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setOpen(true);
  };

  const handleLongPress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    router.push("/feedback-debug");
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[
          styles.wrap,
          { bottom: insets.bottom + 96, right: 16 },
        ]}
      >
        <Pressable
          onPress={handleTap}
          onLongPress={handleLongPress}
          delayLongPress={500}
          style={({ pressed }) => [
            styles.btn,
            { opacity: pressed ? 0.7 : 0.85 },
          ]}
          hitSlop={8}
          accessibilityLabel="Capture feedback (long-press for log)"
        >
          <Feather name="edit-3" size={20} color="#fff" />
        </Pressable>
      </View>
      <FeedbackCaptureSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 999,
    elevation: 999,
  },
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1f2937",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
