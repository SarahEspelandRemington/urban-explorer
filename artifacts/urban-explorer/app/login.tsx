import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const { login, isLoading } = useAuth();
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: "#2A2A2A",
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: "#3A3A3A" }]}>
          <Feather name="compass" size={40} color="#FFFFFF" />
        </View>

        <Text style={[styles.title, { color: "#FFFFFF" }]}>
          {t.login.title}
        </Text>

        <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.78)" }]}>
          {t.login.subtitle}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <Pressable
          onPress={login}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.loginButton,
            { backgroundColor: colors.primary, opacity: pressed || isLoading ? 0.75 : 1 },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.loginButtonText, { color: colors.primaryForeground }]}>
              {t.login.cta}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 20,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  loginButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loginButtonText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
});
