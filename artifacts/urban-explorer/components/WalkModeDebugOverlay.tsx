/**
 * Floating diagnostic overlay for Walk Mode field testing.
 *
 * Rendered only when the user has enabled it in Settings → Developer.
 * Subscribes to the in-process walkDiagnostics surface and re-renders on
 * every snapshot/rejection event. Never visible to users who haven't
 * toggled it on.
 *
 * Read-only: this overlay observes; it never affects narration logic.
 *
 * Three clearly separated sections:
 *   PLAYING    — place the audio engine is currently speaking (activeNarrationPlace)
 *   QUEUED     — enqueued but audio not yet started (queuedNarrationPlace)
 *   NEXT CAND  — top pick from the most recent pickNext run (lastSnapshot.selected)
 */

import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useWalkMode } from "@/contexts/WalkModeContext";
import { useColors } from "@/hooks/useColors";
import {
  getWalkDiagnostics,
  subscribeWalkDiagnostics,
} from "@/lib/walkDiagnostics";

export function WalkModeDebugOverlay() {
  const colors = useColors();
  const walk = useWalkMode();
  const [, setTick] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    return subscribeWalkDiagnostics(() => setTick((t) => t + 1));
  }, []);

  const { lastSnapshot, rejections } = getWalkDiagnostics();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: 90 }]}>
      <Pressable
        onPress={() => setCollapsed((c) => !c)}
        style={[
          styles.panel,
          {
            backgroundColor: "#000000cc",
            borderColor: colors.border,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          collapsed
            ? "Expand Walk debug overlay"
            : "Collapse Walk debug overlay"
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Walk debug</Text>
          <Text style={styles.headerHint}>{collapsed ? "▼" : "▲"}</Text>
        </View>
        {collapsed ? null : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {lastSnapshot ? (
              <>
                <Text style={styles.line}>
                  GPS {lastSnapshot.location.latitude.toFixed(5)},{" "}
                  {lastSnapshot.location.longitude.toFixed(5)}
                </Text>
                <Text style={styles.line}>
                  Heading{" "}
                  {lastSnapshot.heading !== null
                    ? `${Math.round(lastSnapshot.heading)}° (${lastSnapshot.headingSource}${
                        lastSnapshot.headingSource === "velocity"
                          ? lastSnapshot.velocityHeadingFresh
                            ? "/fresh"
                            : "/STALE"
                          : ""
                      })`
                    : "none"}
                </Text>
                <Text style={styles.line}>
                  Velocity{" "}
                  {lastSnapshot.velocityMps !== null
                    ? `${lastSnapshot.velocityMps.toFixed(2)} m/s`
                    : "—"}
                </Text>
                <Text style={styles.line}>
                  Pins {lastSnapshot.visiblePinCount} · Eligible{" "}
                  {lastSnapshot.eligibleCount}
                  {rejections.filter((r) => r.reason === "interpretiveOverlay")
                    .length > 0
                    ? ` · interp ${rejections.filter((r) => r.reason === "interpretiveOverlay").length}`
                    : ""}
                </Text>

                {/* ── Active story state ─────────────────────────────── */}
                <Text style={styles.sectionTitle}>Playing</Text>
                <Text
                  style={[
                    styles.line,
                    walk.activeNarrationPlace
                      ? styles.lineActive
                      : styles.lineDim,
                  ]}
                  numberOfLines={1}
                >
                  {walk.activeNarrationPlace
                    ? walk.activeNarrationPlace.name.slice(0, 34)
                    : "—"}
                </Text>

                <Text style={styles.sectionTitle}>Queued</Text>
                <Text
                  style={[
                    styles.line,
                    walk.queuedNarrationPlace
                      ? styles.lineQueued
                      : styles.lineDim,
                  ]}
                  numberOfLines={1}
                >
                  {walk.queuedNarrationPlace
                    ? walk.queuedNarrationPlace.name.slice(0, 34)
                    : "—"}
                </Text>

                {/* ── Ranking pipeline ───────────────────────────────── */}
                <Text style={styles.sectionTitle}>Top candidates</Text>
                {lastSnapshot.topCandidates.length === 0 ? (
                  <Text style={styles.lineDim}>(none)</Text>
                ) : (
                  lastSnapshot.topCandidates.map((c, i) => (
                    <Text key={c.id} style={styles.line} numberOfLines={1}>
                      {i + 1}. {c.name.slice(0, 28)} · {Math.round(c.distance)}m
                      {c.bearingDiff !== null
                        ? ` · ${Math.round(c.bearingDiff)}°`
                        : ""}
                      {" · s="}
                      {Math.round(c.score)}
                    </Text>
                  ))
                )}

                <Text style={styles.sectionTitle}>Next candidate</Text>
                <Text style={styles.line} numberOfLines={2}>
                  {lastSnapshot.selected
                    ? `${lastSnapshot.selected.name} — ${lastSnapshot.selected.reason}`
                    : "—"}
                </Text>
              </>
            ) : (
              <Text style={styles.lineDim}>Waiting for first GPS tick…</Text>
            )}
            <Text style={styles.sectionTitle}>
              Recent rejections ({rejections.length})
            </Text>
            {rejections.length === 0 ? (
              <Text style={styles.lineDim}>(none)</Text>
            ) : (
              rejections.slice(0, 20).map((r, i) => (
                <Text
                  key={`${r.placeId}-${r.ts}-${i}`}
                  style={styles.lineDim}
                  numberOfLines={1}
                >
                  {r.reason}
                  {r.spatialNote ? ` (${r.spatialNote})` : ""} ·{" "}
                  {r.placeName.slice(0, 22)}
                  {r.distance !== null ? ` · ${Math.round(r.distance)}m` : ""}
                  {r.bearingDiff !== null
                    ? ` · ${Math.round(r.bearingDiff)}°`
                    : ""}
                </Text>
              ))
            )}
          </ScrollView>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 8,
    right: 8,
    zIndex: 9999,
  },
  panel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    maxHeight: 360,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  headerHint: { color: "#fff", fontSize: 12 },
  scroll: { maxHeight: 320 },
  scrollContent: { paddingBottom: 4 },
  sectionTitle: {
    color: "#aaa",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 6,
    marginBottom: 2,
    letterSpacing: 0.4,
  },
  line: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Menlo",
    lineHeight: 14,
  },
  lineActive: {
    color: "#6ee7b7",
  },
  lineQueued: {
    color: "#fcd34d",
  },
  lineDim: {
    color: "#bbb",
    fontSize: 11,
    fontFamily: "Menlo",
    lineHeight: 14,
  },
});
