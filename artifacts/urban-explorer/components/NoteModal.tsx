import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface NoteModalProps {
  visible: boolean;
  placeName: string;
  existingNote?: string;
  onSave: (note: string) => void;
  onSkip: () => void;
}

export function NoteModal({ visible, placeName, existingNote, onSave, onSkip }: NoteModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [note, setNote] = useState(existingNote ?? "");

  const hasInteracted = useRef(false);
  const lastExistingNote = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      const existingChanged = lastExistingNote.current !== existingNote;
      lastExistingNote.current = existingNote;
      if (existingChanged || !hasInteracted.current) {
        setNote(existingNote ?? "");
        hasInteracted.current = false;
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, existingNote]);

  const handleSave = () => {
    onSave(note.trim());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onSkip}
    >
      <Pressable style={styles.backdrop} onPress={onSkip} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + "15" }]}>
              <Feather name="bookmark" size={18} color={colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Saved
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                {placeName}
              </Text>
            </View>
            <Pressable
              onPress={onSkip}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Add a personal note (optional)
          </Text>
          <TextInput
            ref={inputRef}
            value={note}
            onChangeText={(text) => {
              hasInteracted.current = true;
              setNote(text);
            }}
            placeholder="e.g. visited on a rainy Tuesday, loved the architecture…"
            placeholderTextColor={colors.mutedForeground + "80"}
            multiline
            maxLength={280}
            style={[
              styles.input,
              {
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.border,
              },
            ]}
            returnKeyType="done"
            blurOnSubmit
          />
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
            {note.length}/280
          </Text>

          <Pressable
            onPress={handleSave}
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Save note"
          >
            <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
              {note.trim() ? "Save note" : "Done"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  keyboardView: {
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 90,
    textAlignVertical: "top",
    lineHeight: 20,
  },
  charCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 6,
    marginBottom: 16,
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
