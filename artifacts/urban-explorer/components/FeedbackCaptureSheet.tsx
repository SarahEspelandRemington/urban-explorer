import { Feather } from "@expo/vector-icons";
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFeedback } from "@/contexts/FeedbackContext";
import { useColors } from "@/hooks/useColors";
import { SEVERITY_META, type Severity } from "@/lib/feedback";

const SEVERITIES: Severity[] = ["bug", "confused", "idea", "worked"];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function FeedbackCaptureSheet({ visible, onClose, onSaved }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const feedback = useFeedback();

  const [severity, setSeverity] = useState<Severity>("bug");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const recordStartRef = useRef<number | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const isRecordingRef = useRef(false);
  isRecordingRef.current = recorderState.isRecording;

  const abortRecording = React.useCallback(async () => {
    if (!isRecordingRef.current) return;
    try { await recorder.stop(); } catch { /* best-effort mic release */ }
    recordStartRef.current = null;
  }, [recorder]);

  useEffect(() => {
    if (!visible) {
      void abortRecording();
      setNote("");
      setSeverity("bug");
      setAudioUri(null);
      setAudioDurationMs(null);
      setRecordError(null);
      setSaving(false);
    }
  }, [visible, abortRecording]);

  useEffect(() => () => { void abortRecording(); }, [abortRecording]);

  const startRecord = async () => {
    setRecordError(null);
    try {
      if (Platform.OS !== "web") {
        // Check current status first — if already granted, skip the prompt.
        // If undecided, request it (shows system dialog). If denied, iOS will
        // never show the dialog again; guide the user to Settings instead.
        const current = await getRecordingPermissionsAsync();
        if (!current.granted) {
          const requested = await requestRecordingPermissionsAsync();
          if (!requested.granted) {
            setRecordError(
              "Microphone access was denied.\nGo to Settings → Privacy → Microphone and enable it for Expo Go.",
            );
            return;
          }
        }
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStartRef.current = Date.now();
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (e: any) {
      setRecordError(e?.message || "Could not start recording");
    }
  };

  const stopRecord = async (): Promise<{ uri: string | null; durationMs: number | null }> => {
    try {
      await recorder.stop();
      const uri = recorder.uri ?? null;
      const durationMs = recordStartRef.current ? Date.now() - recordStartRef.current : null;
      recordStartRef.current = null;
      if (uri) {
        setAudioUri(uri);
        if (durationMs != null) setAudioDurationMs(durationMs);
      }
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return { uri, durationMs };
    } catch (e: any) {
      setRecordError(e?.message || "Could not stop recording");
      return { uri: null, durationMs: null };
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let finalUri = audioUri;
      let finalDuration = audioDurationMs;
      if (recorderState.isRecording) {
        const result = await stopRecord();
        if (result.uri) { finalUri = result.uri; finalDuration = result.durationMs; }
      }

      if (!note.trim() && !finalUri) {
        setRecordError("Add a note or voice memo first");
        setSaving(false);
        return;
      }

      await feedback.saveReport({ severity, note: note.trim(), audioUri: finalUri, audioDurationMs: finalDuration });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.();
      onClose();
    } catch (e: any) {
      setRecordError(e?.message || "Could not save");
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* KeyboardAvoidingView wraps the whole modal so iOS keyboard pushes the
          sheet up cleanly. behavior="padding" adds padding equal to keyboard
          height, keeping the bottom of the sheet above the keyboard. */}
      <KeyboardAvoidingView
        style={styles.kavWrapper}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.background }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* ── Fixed header ── */}
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.text }]}>Capture</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* ── Scrollable form body — chips, note, mic ── */}
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.severityRow}>
                {SEVERITIES.map((s) => {
                  const meta = SEVERITY_META[s];
                  const active = s === severity;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setSeverity(s)}
                      style={[
                        styles.severityChip,
                        {
                          backgroundColor: active ? meta.color : colors.card,
                          borderColor: active ? meta.color : colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.severityEmoji}>{meta.emoji}</Text>
                      <Text style={[styles.severityLabel, { color: active ? "#fff" : colors.text }]}>
                        {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                placeholder="What happened? (or just hit record)"
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={note}
                onChangeText={setNote}
                autoFocus={false}
              />

              <View style={styles.audioRow}>
                {recorderState.isRecording ? (
                  <Pressable onPress={stopRecord} style={[styles.recordBtn, { backgroundColor: "#dc2626" }]}>
                    <Feather name="square" size={18} color="#fff" />
                    <Text style={styles.recordBtnText}>Stop recording</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={startRecord}
                    style={[styles.recordBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                  >
                    <Feather name="mic" size={18} color={colors.text} />
                    <Text style={[styles.recordBtnText, { color: colors.text }]}>
                      {audioUri ? "Re-record voice memo" : "Record voice memo"}
                    </Text>
                  </Pressable>
                )}
                {audioUri && !recorderState.isRecording ? (
                  <Text style={[styles.audioMeta, { color: colors.mutedForeground }]}>
                    ✓ {audioDurationMs ? `${Math.round(audioDurationMs / 1000)}s saved` : "saved"}
                  </Text>
                ) : null}
              </View>

              {recordError ? (
                <View>
                  <Text style={styles.errorText}>{recordError}</Text>
                  {recordError.includes("denied") && Platform.OS === "ios" ? (
                    <Pressable onPress={() => Linking.openSettings()} style={styles.settingsLink}>
                      <Text style={[styles.settingsLinkText, { color: colors.accent }]}>
                        Open Settings →
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            {/* ── Fixed footer — Save button always visible above keyboard ── */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={[styles.saveBtn, { backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="check" size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>Save report</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kavWrapper: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#aaa",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  scrollBody: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 8 },
  severityRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  severityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  severityEmoji: { fontSize: 14 },
  severityLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  audioRow: { gap: 6, marginBottom: 8 },
  recordBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  recordBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#fff" },
  audioMeta: { fontSize: 12, textAlign: "center" },
  errorText: { color: "#dc2626", fontSize: 13, marginBottom: 4, textAlign: "center" },
  settingsLink: { alignItems: "center", paddingVertical: 4 },
  settingsLinkText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
