import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  clearCustomMessages,
  loadCustomMessages,
  saveCustomMessages,
} from "@/lib/customMessages";

const DEFAULT_DISCOVERY = [
  "Digging through the archives...",
  "Checking old maps and records...",
  "Unearthing local secrets...",
  "What's hiding in plain sight here...",
  "Your personal time machine is warming up...",
  "Building your personal history guide...",
  "Every spot has a story — finding yours now...",
  "Crafting discoveries just for this spot — hang tight...",
];

const DEFAULT_DETAIL = [
  "Digging deeper into the archives...",
  "Uncovering the full story...",
  "Piecing together forgotten chapters...",
  "Crafting a history just for this place...",
];

function MessageSection({
  title,
  subtitle,
  messages,
  onUpdate,
  onDelete,
  onAdd,
  onReset,
  colors,
}: {
  title: string;
  subtitle: string;
  messages: string[];
  onUpdate: (idx: number, text: string) => void;
  onDelete: (idx: number) => void;
  onAdd: () => void;
  onReset: () => void;
  colors: any;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleGroup}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          onPress={onReset}
          style={({ pressed }) => [
            styles.resetBtn,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityLabel="Reset to defaults"
        >
          <Feather name="refresh-ccw" size={12} color={colors.mutedForeground} />
          <Text style={[styles.resetBtnText, { color: colors.mutedForeground }]}>
            Reset
          </Text>
        </Pressable>
      </View>

      {messages.map((msg, i) => (
        <View
          key={i}
          style={[
            styles.messageRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <TextInput
            style={[styles.messageInput, { color: colors.foreground }]}
            value={msg}
            onChangeText={(text) => onUpdate(i, text)}
            placeholder="Enter a message..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            blurOnSubmit
          />
          <Pressable
            onPress={() => onDelete(i)}
            hitSlop={8}
            style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityLabel={`Delete message ${i + 1}`}
          >
            <Feather name="trash-2" size={16} color="#EF4444" />
          </Pressable>
        </View>
      ))}

      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [
          styles.addBtn,
          {
            borderColor: colors.primary + "60",
            backgroundColor: colors.primary + "10",
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        accessibilityLabel="Add a new message"
      >
        <Feather name="plus" size={16} color={colors.primary} />
        <Text style={[styles.addBtnText, { color: colors.primary }]}>
          Add Message
        </Text>
      </Pressable>
    </View>
  );
}

export default function SettingsMessagesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [discovery, setDiscovery] = useState<string[]>(DEFAULT_DISCOVERY);
  const [detail, setDetail] = useState<string[]>(DEFAULT_DETAIL);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadCustomMessages().then((custom) => {
      if (custom.discovery && custom.discovery.length > 0) setDiscovery(custom.discovery);
      if (custom.detail && custom.detail.length > 0) setDetail(custom.detail);
      setLoaded(true);
    });
  }, []);

  const updateDiscovery = useCallback((idx: number, text: string) => {
    setDiscovery((prev) => {
      const next = prev.map((m, i) => (i === idx ? text : m));
      saveCustomMessages("discovery", next);
      return next;
    });
  }, []);

  const deleteDiscovery = useCallback((idx: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDiscovery((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      saveCustomMessages("discovery", next);
      return next;
    });
  }, []);

  const addDiscovery = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDiscovery((prev) => {
      const next = [...prev, ""];
      saveCustomMessages("discovery", next);
      return next;
    });
  }, []);

  const resetDiscovery = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await clearCustomMessages("discovery");
    setDiscovery(DEFAULT_DISCOVERY);
  }, []);

  const updateDetail = useCallback((idx: number, text: string) => {
    setDetail((prev) => {
      const next = prev.map((m, i) => (i === idx ? text : m));
      saveCustomMessages("detail", next);
      return next;
    });
  }, []);

  const deleteDetail = useCallback((idx: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDetail((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      saveCustomMessages("detail", next);
      return next;
    });
  }, []);

  const addDetail = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDetail((prev) => {
      const next = [...prev, ""];
      saveCustomMessages("detail", next);
      return next;
    });
  }, []);

  const resetDetail = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await clearCustomMessages("detail");
    setDetail(DEFAULT_DETAIL);
  }, []);

  if (!loaded) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Loading Messages
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            Shown while the AI is thinking
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <MessageSection
          title="Discover Nearby"
          subtitle="Shown while scanning for places around you"
          messages={discovery}
          onUpdate={updateDiscovery}
          onDelete={deleteDiscovery}
          onAdd={addDiscovery}
          onReset={resetDiscovery}
          colors={colors}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MessageSection
          title="Place Detail"
          subtitle="Shown while loading a specific place's story"
          messages={detail}
          onUpdate={updateDetail}
          onDelete={deleteDetail}
          onAdd={addDetail}
          onReset={resetDetail}
          colors={colors}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scroll: { flex: 1 },
  content: {
    padding: 16,
    gap: 24,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  sectionTitleGroup: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
    gap: 8,
  },
  messageInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    paddingTop: 0,
  },
  deleteBtn: {
    paddingTop: 2,
    paddingLeft: 4,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 12,
  },
  addBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
