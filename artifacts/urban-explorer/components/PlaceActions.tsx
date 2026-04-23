import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useHeading, type HeadingTarget } from "@/contexts/HeadingContext";
import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  place: HeadingTarget;
  size?: "compact" | "full";
}

export function PlaceActions({ place, size = "full" }: Props) {
  const colors = useColors();
  const t = useT();
  const heading = useHeading();
  const isThisTarget = heading.target?.id === place.id;
  const isThisAudio = heading.audioPlace?.id === place.id;
  const isThisLoading = isThisAudio && heading.isAudioLoading;
  const isThisSpeaking =
    isThisAudio && (heading.narration.isSpeaking || heading.narration.isPaused);

  const onListen = () => heading.listen(place);
  const onHeadThere = () => heading.headTo(place);

  const compact = size === "compact";

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Pressable
        onPress={onListen}
        accessibilityRole="button"
        accessibilityLabel={`Listen to a deep dive about ${place.name}`}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: colors.muted,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {isThisLoading ? (
          <ActivityIndicator size="small" color={colors.foreground} />
        ) : (
          <Feather
            name={isThisSpeaking ? "volume-2" : "headphones"}
            size={16}
            color={colors.foreground}
          />
        )}
        <Text style={[styles.btnText, { color: colors.foreground }]}>
          {isThisSpeaking ? t.placeActions.playing : t.placeActions.tellMore}
        </Text>
      </Pressable>

      <Pressable
        onPress={onHeadThere}
        accessibilityRole="button"
        accessibilityLabel={`Head toward ${place.name} and start the deep dive audio`}
        style={({ pressed }) => [
          styles.btnPrimary,
          {
            backgroundColor: isThisTarget ? colors.primary + "dd" : colors.primary,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Feather name="navigation-2" size={16} color={colors.primaryForeground} />
        <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
          {isThisTarget ? t.placeActions.headingThere : t.placeActions.headThere}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  rowCompact: {
    marginTop: 8,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  btnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
