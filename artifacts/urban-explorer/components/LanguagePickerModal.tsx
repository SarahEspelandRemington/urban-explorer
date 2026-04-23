import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLocale, useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";

interface LanguagePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

export function LanguagePickerModal({ visible, onClose }: LanguagePickerModalProps) {
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { locale, setLocale, availableLocales, resolved } = useLocale();

  const handleSelect = async (code: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setLocale(code);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {t.languageModal.title}
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {t.languageModal.subtitle}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.closeBtn, { backgroundColor: colors.muted }]}
            >
              <Feather name="x" size={16} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={[styles.preview, { backgroundColor: colors.muted }]}>
            <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>
              {t.languageModal.preview}
            </Text>
            <Text
              style={[styles.previewTitle, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {resolved.notificationTitle}
            </Text>
            <Text
              style={[styles.previewBody, { color: colors.mutedForeground }]}
              numberOfLines={2}
            >
              {resolved.notificationBody}
            </Text>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: 4 }}>
            {availableLocales.map((l) => {
              const active = l.code === locale;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => handleSelect(l.code)}
                  accessibilityRole="button"
                  accessibilityLabel={l.label}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                      {l.label}
                    </Text>
                    <Text
                      style={[styles.rowSample, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {l.notificationTitle}
                    </Text>
                  </View>
                  {active && (
                    <Feather name="check" size={18} color={colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 18 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  previewLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  previewTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  previewBody: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  list: { maxHeight: 360 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowSample: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
