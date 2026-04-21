import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { authHeaders } from "@/lib/apiToken";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface Suggestion {
  name: string;
  description: string;
  latitude?: number;
  longitude?: number;
}

interface AddressInputProps {
  value: string;
  onChangeText: (next: string) => void;
  onSelectSuggestion?: (suggestion: Suggestion) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  dotColor: string;
  editable?: boolean;
  returnKeyType?: "next" | "search" | "done" | "go";
  rightAdornment?: React.ReactNode;
  testID?: string;
  /** Optional context address to bias suggestions toward the same city/region. */
  nearLocation?: string | null;
}

export function AddressInput({
  value,
  onChangeText,
  onSelectSuggestion,
  onSubmitEditing,
  placeholder,
  dotColor,
  editable = true,
  returnKeyType = "next",
  rightAdornment,
  testID,
  nearLocation,
}: AddressInputProps) {
  const colors = useColors();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSelectedRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
    };
  }, []);

  const fetchSuggestions = async (text: string) => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    const near = (nearLocation ?? "").trim();
    try {
      const headers = await authHeaders();
      const r = await fetch(`${API_BASE}/api/explore/suggest-locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(near ? { query: text, nearLocation: near } : { query: text }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const data: { suggestions?: Suggestion[] } = r.ok ? await r.json() : { suggestions: [] };
      if (controller.signal.aborted) return;
      const list = Array.isArray(data?.suggestions) ? data.suggestions : [];
      setSuggestions(list);
      setIsOpen(list.length > 0);
    } catch {
      if (controller.signal.aborted) return;
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  };

  const handleChangeText = (text: string) => {
    onChangeText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    // Skip refetch if the text matches what we just selected
    if (!trimmed || trimmed.length < 2 || trimmed === lastSelectedRef.current) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(trimmed), 250);
  };

  const handlePickSuggestion = (s: Suggestion) => {
    lastSelectedRef.current = s.name;
    onChangeText(s.name);
    setSuggestions([]);
    setIsOpen(false);
    Keyboard.dismiss();
    onSelectSuggestion?.(s);
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.row,
          {
            borderColor: colors.border,
            backgroundColor: colors.card,
            borderBottomLeftRadius: isOpen ? 0 : 12,
            borderBottomRightRadius: isOpen ? 0 : 12,
          },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <TextInput
          testID={testID}
          style={[styles.input, { color: colors.foreground }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={value}
          onChangeText={handleChangeText}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          editable={editable}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {isLoading && <ActivityIndicator size="small" color={colors.mutedForeground} />}
        {!isLoading && value.length > 0 && (
          <Pressable
            onPress={() => {
              onChangeText("");
              setSuggestions([]);
              setIsOpen(false);
              lastSelectedRef.current = "";
            }}
            hitSlop={8}
            accessibilityLabel={`Clear ${placeholder}`}
          >
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
        {rightAdornment}
      </View>

      {isOpen && suggestions.length > 0 && (
        <ScrollView
          style={[
            styles.suggestionsContainer,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {suggestions.map((s, i) => (
            <Pressable
              key={`${s.name}-${i}`}
              onPress={() => handlePickSuggestion(s)}
              style={({ pressed }) => [
                styles.suggestionItem,
                {
                  backgroundColor: pressed ? colors.muted : "transparent",
                  borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <Feather
                name="map-pin"
                size={14}
                color={colors.primary}
                style={styles.suggestionIcon}
              />
              <View style={styles.suggestionText}>
                <Text
                  style={[styles.suggestionName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {s.name}
                </Text>
                <Text
                  style={[styles.suggestionDesc, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {s.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative", zIndex: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },
  suggestionsContainer: {
    maxHeight: 220,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionIcon: { marginRight: 10, marginTop: 1 },
  suggestionText: { flex: 1 },
  suggestionName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.2,
  },
  suggestionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
});
