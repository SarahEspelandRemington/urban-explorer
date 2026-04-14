import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

interface TimelineEra {
  period: string;
  title: string;
  description: string;
  visualDescription?: string;
  keyFigures?: string[];
  atmosphere: string;
}

interface PlaceTimelineProps {
  eras: TimelineEra[] | undefined;
  isLoading: boolean;
  error?: boolean;
  onLoad: () => void;
  onRetry?: () => void;
  hasLoaded: boolean;
}

export function PlaceTimeline({ eras, isLoading, error, onLoad, onRetry, hasLoaded }: PlaceTimelineProps) {
  const colors = useColors();
  const [expandedEra, setExpandedEra] = React.useState<number | null>(null);

  if (!hasLoaded && !isLoading) {
    return (
      <View style={styles.promptContainer}>
        <Pressable
          onPress={onLoad}
          style={({ pressed }) => [
            styles.loadButton,
            {
              backgroundColor: colors.accent + "15",
              borderColor: colors.accent + "40",
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Feather name="clock" size={20} color={colors.accent} />
          <View style={styles.loadButtonText}>
            <Text style={[styles.loadButtonTitle, { color: colors.foreground }]}>
              Time Travel
            </Text>
            <Text style={[styles.loadButtonSubtitle, { color: colors.mutedForeground }]}>
              See how this place evolved through history
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.accent} />
        </Pressable>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Traveling through time...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Feather name="alert-circle" size={20} color={colors.destructive} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Could not load timeline. Check your connection and try again.
        </Text>
        {onRetry && (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryButton,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.accent }]}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (!eras || eras.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Feather name="clock" size={18} color={colors.accent} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Time Travel
        </Text>
      </View>

      <View style={styles.timeline}>
        {eras.map((era, index) => {
          const isExpanded = expandedEra === index;
          const isLast = index === eras.length - 1;

          return (
            <Animated.View
              key={index}
              entering={Platform.OS !== "web" ? FadeInDown.delay(index * 100) : undefined}
            >
              <Pressable
                onPress={() => setExpandedEra(isExpanded ? null : index)}
                style={styles.eraRow}
              >
                <View style={styles.timelineTrack}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor: isLast ? colors.accent : colors.accent + "60",
                        borderColor: colors.accent,
                      },
                    ]}
                  />
                  {!isLast && (
                    <View style={[styles.timelineLine, { backgroundColor: colors.accent + "30" }]} />
                  )}
                </View>

                <View style={[styles.eraContent, { flex: 1 }]}>
                  <View style={styles.eraPeriodRow}>
                    <Text style={[styles.eraPeriod, { color: colors.accent }]}>
                      {era.period}
                    </Text>
                    <Feather
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={colors.mutedForeground}
                    />
                  </View>
                  <Text style={[styles.eraTitle, { color: colors.foreground }]}>
                    {era.title}
                  </Text>

                  <Text
                    style={[styles.atmosphereText, { color: colors.mutedForeground }]}
                    numberOfLines={isExpanded ? undefined : 2}
                  >
                    {era.atmosphere}
                  </Text>

                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      <Text style={[styles.descriptionText, { color: colors.foreground }]}>
                        {era.description}
                      </Text>

                      {era.visualDescription && (
                        <View
                          style={[
                            styles.visualCard,
                            { backgroundColor: colors.accent + "08", borderColor: colors.accent + "20" },
                          ]}
                        >
                          <Feather name="eye" size={13} color={colors.accent} style={{ marginTop: 2 }} />
                          <Text style={[styles.visualText, { color: colors.foreground }]}>
                            {era.visualDescription}
                          </Text>
                        </View>
                      )}

                      {era.keyFigures && era.keyFigures.length > 0 && (
                        <View style={styles.figuresRow}>
                          {era.keyFigures.map((figure, fi) => (
                            <View
                              key={fi}
                              style={[styles.figureChip, { backgroundColor: colors.muted }]}
                            >
                              <Feather name="user" size={11} color={colors.mutedForeground} />
                              <Text
                                style={[styles.figureText, { color: colors.foreground }]}
                                numberOfLines={2}
                              >
                                {figure}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {!isLast && <View style={{ height: 16 }} />}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  promptContainer: {
    marginTop: 4,
  },
  loadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  loadButtonText: {
    flex: 1,
  },
  loadButtonTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  loadButtonSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  timeline: {
    paddingLeft: 4,
  },
  eraRow: {
    flexDirection: "row",
  },
  timelineTrack: {
    width: 24,
    alignItems: "center",
    paddingTop: 4,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    zIndex: 1,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: -1,
  },
  eraContent: {
    paddingLeft: 12,
  },
  eraPeriodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eraPeriod: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  eraTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
    marginTop: 2,
    marginBottom: 4,
  },
  atmosphereText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    fontStyle: "italic",
  },
  expandedContent: {
    marginTop: 10,
  },
  descriptionText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 10,
  },
  visualCard: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  visualText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  figuresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  figureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: "100%",
  },
  figureText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
});
