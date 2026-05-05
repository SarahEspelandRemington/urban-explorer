import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface SaveToastProps {
  visible: boolean;
  label: string;
  onHide: () => void;
}

export function SaveToast({ visible, label, onHide }: SaveToastProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const onHideRef = React.useRef(onHide);
  useEffect(() => {
    onHideRef.current = onHide;
  }, [onHide]);

  useEffect(() => {
    const dismiss = () => onHideRef.current();
    if (visible) {
      opacity.value = withSequence(
        withTiming(1, { duration: 180 }),
        withDelay(
          1600,
          withTiming(0, { duration: 240 }, (done) => {
            if (done) runOnJS(dismiss)();
          }),
        ),
      );
      translateY.value = withSequence(
        withSpring(-4, { damping: 14, stiffness: 280 }),
        withDelay(1600, withTiming(8, { duration: 240 })),
      );
    } else {
      opacity.value = 0;
      translateY.value = 20;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const bottomInset = insets.bottom + (Platform.OS === "web" ? 100 : 80);

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: colors.foreground, bottom: bottomInset },
        animStyle,
      ]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      <Feather name="bookmark" size={14} color={colors.background} />
      <Text style={[styles.label, { color: colors.background }]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 999,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
