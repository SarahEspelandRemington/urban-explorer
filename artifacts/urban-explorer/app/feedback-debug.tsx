import { Feather } from "@expo/vector-icons";
import { useAudioPlayer } from "expo-audio";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  clearAllReports,
  deleteReport,
  exportReportsAsJson,
  exportReportsAsText,
  getReports,
  SEVERITY_META,
  type FeedbackReport,
} from "@/lib/feedback";

export default function FeedbackDebugScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setReports(await getReports());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleShareText = async () => {
    if (reports.length === 0) return;
    const text = exportReportsAsText(reports);
    await Share.share({ message: text });
  };

  const handleShareJson = async () => {
    if (reports.length === 0) return;
    const json = exportReportsAsJson(reports);
    await Share.share({ message: json });
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete this report?", "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteReport(id);
          refresh();
        },
      },
    ]);
  };

  const handleClearAll = () => {
    if (reports.length === 0) return;
    Alert.alert("Clear all reports?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear all",
        style: "destructive",
        onPress: async () => {
          await clearAllReports();
          refresh();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          Field reports ({reports.length})
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.toolbar}>
        <Pressable
          onPress={handleShareText}
          disabled={reports.length === 0}
          style={[
            styles.toolBtn,
            { backgroundColor: colors.accent, opacity: reports.length === 0 ? 0.4 : 1 },
          ]}
        >
          <Feather name="share-2" size={14} color="#fff" />
          <Text style={styles.toolBtnText}>Share text</Text>
        </Pressable>
        <Pressable
          onPress={handleShareJson}
          disabled={reports.length === 0}
          style={[
            styles.toolBtn,
            { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, opacity: reports.length === 0 ? 0.4 : 1 },
          ]}
        >
          <Feather name="code" size={14} color={colors.text} />
          <Text style={[styles.toolBtnText, { color: colors.text }]}>Share JSON</Text>
        </Pressable>
        <Pressable
          onPress={handleClearAll}
          disabled={reports.length === 0}
          style={[
            styles.toolBtn,
            { backgroundColor: "transparent", borderColor: colors.border, borderWidth: 1, opacity: reports.length === 0 ? 0.4 : 1 },
          ]}
        >
          <Feather name="trash-2" size={14} color={colors.mutedForeground} />
          <Text style={[styles.toolBtnText, { color: colors.mutedForeground }]}>Clear</Text>
        </Pressable>
      </View>

      <FlatList
        data={reports}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No reports yet. Tap the floating button on any screen to capture one.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ReportRow
            report={item}
            colors={colors}
            isExpanded={expanded.has(item.id)}
            onToggle={() => toggleExpanded(item.id)}
            onDelete={() => handleDelete(item.id)}
            isPlaying={playingId === item.id}
            onPlayToggle={() =>
              setPlayingId((prev) => (prev === item.id ? null : item.id))
            }
          />
        )}
      />
    </View>
  );
}

interface RowProps {
  report: FeedbackReport;
  colors: ReturnType<typeof useColors>;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
}

function ReportRow({ report, colors, isExpanded, onToggle, onDelete, isPlaying, onPlayToggle }: RowProps) {
  const meta = SEVERITY_META[report.severity];
  const player = useAudioPlayer(report.audioUri ?? null);

  useEffect(() => {
    if (!report.audioUri) return;
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
      player.seekTo(0);
    }
  }, [isPlaying, report.audioUri, player]);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Pressable onPress={onToggle} style={styles.cardHeader}>
        <View style={[styles.severityDot, { backgroundColor: meta.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={isExpanded ? undefined : 2}>
            {meta.emoji} {report.note || "(voice only)"}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
            {new Date(report.ts).toLocaleString()}
            {report.context.route ? ` · ${report.context.route}` : ""}
          </Text>
        </View>
        <Feather
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.mutedForeground}
        />
      </Pressable>

      {isExpanded ? (
        <View style={styles.cardBody}>
          {report.audioUri ? (
            <Pressable
              onPress={onPlayToggle}
              style={[styles.playBtn, { borderColor: colors.border }]}
            >
              <Feather name={isPlaying ? "pause" : "play"} size={14} color={colors.text} />
              <Text style={[styles.playBtnText, { color: colors.text }]}>
                {isPlaying ? "Pause" : "Play"} voice memo
                {report.audioDurationMs ? ` (${Math.round(report.audioDurationMs / 1000)}s)` : ""}
              </Text>
            </Pressable>
          ) : null}

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Context</Text>
          <View style={[styles.kvBox, { backgroundColor: colors.background }]}>
            {report.context.location ? (
              <Text style={[styles.kv, { color: colors.text }]}>
                📍 {report.context.location.lat.toFixed(5)}, {report.context.location.lng.toFixed(5)}
                {report.context.location.accuracy != null
                  ? ` ±${Math.round(report.context.location.accuracy)}m`
                  : ""}
              </Text>
            ) : null}
            {report.context.walkActive ? (
              <Text style={[styles.kv, { color: colors.text }]}>🚶 walk active</Text>
            ) : null}
            {report.context.currentPlace ? (
              <Text style={[styles.kv, { color: colors.text }]}>
                🏛 {report.context.currentPlace}
              </Text>
            ) : null}
            {report.context.walkStats ? (
              <Text style={[styles.kv, { color: colors.text }]}>
                📊 {report.context.walkStats.placesNarrated} narrated · {Math.round(report.context.walkStats.distanceWalked)}m
              </Text>
            ) : null}
          </View>

          {report.recentEvents.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                Recent events ({report.recentEvents.length})
              </Text>
              <View style={[styles.kvBox, { backgroundColor: colors.background }]}>
                {report.recentEvents.slice(-20).map((e, i) => (
                  <Text key={i} style={[styles.eventLine, { color: colors.mutedForeground }]}>
                    [{new Date(e.ts).toISOString().slice(11, 19)}] {e.type}
                    {Object.keys(e.data).length ? " " + JSON.stringify(e.data) : ""}
                  </Text>
                ))}
              </View>
            </>
          ) : null}

          <Pressable onPress={onDelete} style={styles.deleteBtn}>
            <Feather name="trash-2" size={13} color="#dc2626" />
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  toolbar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexWrap: "wrap",
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toolBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  empty: { padding: 32, alignItems: "center" },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
  },
  severityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
  cardMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  playBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  kvBox: { padding: 8, borderRadius: 8, gap: 4 },
  kv: { fontSize: 12, fontFamily: "Inter_400Regular" },
  eventLine: { fontSize: 10, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  deleteText: { color: "#dc2626", fontSize: 12, fontFamily: "Inter_500Medium" },
});
