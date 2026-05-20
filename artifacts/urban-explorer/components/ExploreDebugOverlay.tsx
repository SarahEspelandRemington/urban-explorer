/**
 * Floating debug panel for Explore Mode and Plan-a-Walk.
 *
 * Rendered only when the developer has enabled it. Accepts either an
 * ExploreSnapshot (for Explore / map view) or a PlanSnapshot (for Plan a Walk)
 * as props. Never affects discovery logic.
 *
 * Position: absolute, anchored near the bottom of the screen so it stays out
 * of the main content area but above the tab bar / action buttons.
 */

import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type {
  ExploreDebugPlace,
  ExploreSnapshot,
  PlanSnapshot,
} from "@/lib/exploreDiagnostics";

interface Props {
  explore?: ExploreSnapshot | null;
  plan?: PlanSnapshot | null;
}

export function ExploreDebugOverlay({ explore, plan }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const hasData = !!(explore ?? plan);
  if (!hasData) return null;

  const label = explore ? "Explore debug" : "Plan debug";

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        onPress={() => setCollapsed((c) => !c)}
        style={styles.panel}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? `Expand ${label}` : `Collapse ${label}`}
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{label}</Text>
          <Text style={styles.headerHint}>{collapsed ? "▼" : "▲"}</Text>
        </View>
        {!collapsed && (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {explore ? (
              <ExploreContent s={explore} />
            ) : plan ? (
              <PlanContent s={plan} />
            ) : null}
          </ScrollView>
        )}
      </Pressable>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.line} numberOfLines={1}>
      {label.padEnd(11)} {value}
    </Text>
  );
}

function ExploreContent({ s }: { s: ExploreSnapshot }) {
  const sel = s.selectedPlace;

  // Class distribution from the top-places sample (may be a subset of all pins).
  const verified = s.topPlaces.filter(
    (p) => !p.discoveryClass || p.discoveryClass === "VERIFIED_PLACE",
  ).length;
  const approx = s.topPlaces.filter(
    (p) => p.discoveryClass === "APPROXIMATE_SITE",
  ).length;
  const interp = s.topPlaces.filter(
    (p) => p.discoveryClass === "INTERPRETIVE_OVERLAY",
  ).length;
  const suppressed = s.topPlaces.filter(
    (p) => p.spatialSuppression === "llmCoordWithSpecificLocationText",
  ).length;

  // coordSrc distribution from the same sample.
  const srcNom = s.topPlaces.filter(
    (p) => p.coordSource === "nominatim",
  ).length;
  const srcNomC = s.topPlaces.filter(
    (p) => p.coordSource === "nominatim-corrected",
  ).length;
  const srcLlm = s.topPlaces.filter((p) => !p.coordSource).length;

  return (
    <>
      <Row label="mode" value={s.mode} />
      <Row label="radius" value={`${s.searchRadius}m`} />
      <Row label="area" value={s.areaName.slice(0, 40) || "—"} />

      <SectionTitle>Context</SectionTitle>
      <Row
        label="srch ctr"
        value={`${s.searchCenter.latitude.toFixed(5)}, ${s.searchCenter.longitude.toFixed(5)}`}
      />
      {s.userGps ? (
        <Row
          label="user GPS"
          value={`${s.userGps.latitude.toFixed(5)}, ${s.userGps.longitude.toFixed(5)}${s.userGps.accuracy != null ? `  ±${Math.round(s.userGps.accuracy)}m` : ""}`}
        />
      ) : (
        <Text style={styles.lineDim}>user GPS —</Text>
      )}
      {s.mapCenter ? (
        <Row
          label="map ctr"
          value={`${s.mapCenter.latitude.toFixed(5)}, ${s.mapCenter.longitude.toFixed(5)}`}
        />
      ) : null}

      <SectionTitle>
        Results ({s.totalPlaces} pins · v{verified} ap{approx} interp{interp}
        {suppressed > 0 ? ` sup${suppressed}` : ""})
      </SectionTitle>
      {s.topPlaces.length > 0 ? (
        <Text style={styles.lineDim} numberOfLines={1}>
          coordSrc: llm×{srcLlm} nom×{srcNom} nom-c×{srcNomC}
        </Text>
      ) : null}
      {s.topPlaces.length === 0 ? (
        <Text style={styles.lineDim}>(none)</Text>
      ) : (
        s.topPlaces.map((p) => <PlaceLine key={p.id} p={p} />)
      )}

      {sel ? (
        <>
          <SectionTitle>Selected</SectionTitle>
          <Text style={styles.lineActive} numberOfLines={1}>
            {sel.name}
          </Text>
          <Row
            label="coords"
            value={`${sel.latitude.toFixed(5)}, ${sel.longitude.toFixed(5)}`}
          />
          {sel.address ? (
            <Text style={styles.lineDim} numberOfLines={1}>
              {sel.address}
            </Text>
          ) : null}
          <Row
            label="Δcenter"
            value={`${Math.round(sel.distFromCenter)}m${sel.distFromUser != null ? `  Δuser ${Math.round(sel.distFromUser)}m` : ""}`}
          />
          <ClassBadge cls={sel.discoveryClass} />
          {sel.spatialSuppression ? (
            <Text style={styles.lineWarn} numberOfLines={1}>
              {"suppressed".padEnd(11)} {sel.spatialSuppression}
            </Text>
          ) : null}
          {sel.confidence ? (
            <Row label="confidence" value={sel.confidence} />
          ) : null}
          <Row label="coordSrc" value={sel.coordSource ?? "llm"} />
          {sel.autoNarrationBlocked ? (
            <Text style={styles.lineWarn}>autoNarrationBlocked</Text>
          ) : null}
          {sel.addressCoherenceStatus && sel.addressCoherenceStatus !== "ok" ? (
            <Text style={styles.lineWarn}>
              coherence: {sel.addressCoherenceStatus}
            </Text>
          ) : null}
        </>
      ) : null}

      {s.spatialWarnings.length > 0 ? (
        <>
          <SectionTitle>⚠ Spatial warnings</SectionTitle>
          {s.spatialWarnings.map((w, i) => (
            <Text key={i} style={styles.lineWarn} numberOfLines={2}>
              {w}
            </Text>
          ))}
        </>
      ) : null}
    </>
  );
}

function PlanContent({ s }: { s: PlanSnapshot }) {
  return (
    <>
      <SectionTitle>Route</SectionTitle>
      <Row
        label="start"
        value={`${s.startCoords.latitude.toFixed(5)}, ${s.startCoords.longitude.toFixed(5)}`}
      />
      <Row
        label="end"
        value={`${s.endCoords.latitude.toFixed(5)}, ${s.endCoords.longitude.toFixed(5)}`}
      />
      <Row
        label="geometry"
        value={`${s.geometryPoints} pts  corridor ${s.corridorMeters}m`}
      />

      <SectionTitle>Places along route ({s.places.length})</SectionTitle>
      {s.places.length === 0 ? (
        <Text style={styles.lineDim}>(none)</Text>
      ) : (
        s.places.map((p, i) => (
          <Text key={p.id} style={styles.line} numberOfLines={1}>
            {String(i + 1).padStart(2)}. {p.name.slice(0, 24)}
            {p.distanceMeters != null
              ? ` · ${Math.round(p.distanceMeters)}m`
              : ""}
            {p.autoNarrationBlocked ? " ⚠" : ""}
            {p.addressCoherenceStatus && p.addressCoherenceStatus !== "ok"
              ? ` [${p.addressCoherenceStatus}]`
              : ""}
          </Text>
        ))
      )}
    </>
  );
}

function ClassBadge({ cls }: { cls: string | undefined }) {
  if (!cls) return null;
  const color =
    cls === "VERIFIED_PLACE"
      ? "#6ee7b7"
      : cls === "APPROXIMATE_SITE"
        ? "#fcd34d"
        : "#fb923c";
  return (
    <Text style={[styles.line, { color }]} numberOfLines={1}>
      {"class".padEnd(11)} {cls}
    </Text>
  );
}

function PlaceLine({ p }: { p: ExploreDebugPlace }) {
  const isInterpretive = p.discoveryClass === "INTERPRETIVE_OVERLAY";
  const isApprox = p.discoveryClass === "APPROXIMATE_SITE";
  const lineStyle = p.autoNarrationBlocked
    ? styles.lineWarn
    : isInterpretive
      ? styles.lineInterp
      : isApprox
        ? styles.lineApprox
        : styles.line;
  return (
    <Text style={lineStyle} numberOfLines={1}>
      {p.name.slice(0, 26)}
      {" · "}
      {Math.round(p.distFromCenter)}m
      {p.discoveryClass && p.discoveryClass !== "VERIFIED_PLACE"
        ? ` [${p.discoveryClass === "INTERPRETIVE_OVERLAY" ? "interp" : "approx"}]`
        : ""}
      {p.autoNarrationBlocked ? " ⚠" : ""}
      {p.addressCoherenceStatus && p.addressCoherenceStatus !== "ok"
        ? ` [${p.addressCoherenceStatus}]`
        : ""}
    </Text>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 90,
    zIndex: 9999,
  },
  panel: {
    backgroundColor: "#000000cc",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 8,
    maxHeight: 380,
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
    fontSize: 11,
    fontFamily: "Menlo",
    lineHeight: 14,
  },
  lineDim: {
    color: "#bbb",
    fontSize: 11,
    fontFamily: "Menlo",
    lineHeight: 14,
  },
  lineWarn: {
    color: "#fcd34d",
    fontSize: 11,
    fontFamily: "Menlo",
    lineHeight: 14,
  },
  lineInterp: {
    color: "#fb923c",
    fontSize: 11,
    fontFamily: "Menlo",
    lineHeight: 14,
  },
  lineApprox: {
    color: "#e2c97e",
    fontSize: 11,
    fontFamily: "Menlo",
    lineHeight: 14,
  },
});
