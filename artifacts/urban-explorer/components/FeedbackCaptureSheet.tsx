import { Feather } from "@expo/vector-icons";
import { AudioModule, RecordingPresets, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  // Mirror recording state in a ref so abort paths (close, unmount) can stop
  // the mic without depending on possibly-stale React state.
  const isRecordingRef = useRef(false);
  isRecordingRef.current = recorderState.isRecording;

  // Force-stop the recorder without touching React state — used by abort paths
  // (modal dismissal, component unmount) where setting state is unsafe.
  const abortRecording = React.useCallback(async () => {
    if (!isRecordingRef.current) return;
    try {
      await recorder.stop();
    } catch {
      // best effort — we just want the mic off
    }
    recordStartRef.current = null;
  }, [recorder]);

  useEffect(() => {
    if (!visible) {
      // Modal hidden: kill the mic if we were still recording, then reset form.
      void abortRecording();
      setNote("");
      setSeverity("bug");
      setAudioUri(null);
      setAudioDurationMs(null);
      setRecordError(null);
      setSaving(false);
    }
  }, [visible, abortRecording]);

  // Last-resort safety net: if the sheet ever unmounts while recording (app
  // backgrounded, navigation, hot reload), make sure the mic is released.
  useEffect(() => {
    return () => {
      void abortRecording();
    };
  }, [abortRecording]);

  const startRecord = async () => {
    setRecordError(null);
    try {
      if (Platform.OS !== "web") {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setRecordError("Microphone permission denied");
          return;
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

  // Returns the freshly-recorded clip's uri/duration so callers can use them
  // immediately without waiting for React state to settle.
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
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
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
      // If user hits Save while still recording, finalize the clip first and
      // use the returned values — React state may not have flushed yet.
      let finalUri = audioUri;
      let finalDuration = audioDurationMs;
      if (recorderState.isRecording) {
        const result = await stopRecord();
        if (result.uri) {
          finalUri = result.uri;
          finalDuration = result.durationMs;
        }
      }

      if (!note.trim() && !finalUri) {
        setRecordError("Add a note or voice memo first");
        setSaving(false);
        return;
      }

      await feedback.saveReport({
        severity,
        note: note.trim(),
        audioUri: finalUri,
        audioDurationMs: finalDuration,
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onSaved?.();
      onClose();
    } catch (e: any) {
      setRecordError(e?.message || "Could not save");
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.text }]}>Capture</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

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
                    <Text style={[styles.severityEmoji]}>{meta.emoji}</Text>
                    <Text
                      style={[
                        styles.severityLabel,
                        { color: active ? "#fff" : colors.text },
                      ]}
                    >
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              placeholder="What happened? (or just hit record)"
              placeholderTextColor={colors.mutedForeground}
              multiline
              value={note}
              onChangeText={setNote}
              autoFocus={false}
            />

            <View style={styles.audioRow}>
              {recorderState.isRecording ? (
                <Pressable
                  onPress={stopRecord}
                  style={[styles.recordBtn, { backgroundColor: "#dc2626" }]}
                >
                  <Feather name="square" size={18} color="#fff" />
                  <Text style={styles.recordBtnText}>Stop recording</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={startRecord}
                  style={[
                    styles.recordBtn,
                    { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                  ]}
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
              <Text style={styles.errorText}>{recordError}</Text>
            ) : null}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[
                styles.saveBtn,
                { backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 },
              ]}
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
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#aaa",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
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
    maxHeight: 140,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  audioRow: { gap: 6, marginBottom: 12 },
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
  errorText: { color: "#dc2626", fontSize: 13, marginBottom: 8, textAlign: "center" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
