import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { useLoginFlow } from "@/lib/loginFlow";
import { useT } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";
import { StreetlitLogo } from "@/components/StreetlitLogo";
import { AUTH_ENABLED } from "@/constants/features";

export default function LoginScreen() {
  if (!AUTH_ENABLED) {
    return <Redirect href="/(tabs)" />;
  }
  return <LoginScreenContent />;
}

function LoginScreenContent() {
  const { refreshUser, isLoading: isAuthLoading } = useAuth();
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();

  const { login, isExchangingToken, isDiscovering } = useLoginFlow(refreshUser);
  const busy = isAuthLoading || isExchangingToken;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={styles.content}>
        <StreetlitLogo variant="vertical" width={160} style={styles.logo} />

        <Text style={[styles.title, { color: colors.foreground }]}>
          {t.login.title}
        </Text>

        <Text style={[styles.tagline, { color: colors.foreground }]}>
          {t.login.tagline}
        </Text>

        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {t.login.subtitle}
        </Text>
      </View>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}
      >
        <Pressable
          onPress={login}
          disabled={busy || isDiscovering}
          style={({ pressed }) => [
            styles.loginButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed || busy || isDiscovering ? 0.75 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t.login.cta}
          accessibilityState={{ disabled: busy || isDiscovering }}
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text
              style={[
                styles.loginButtonText,
                { color: colors.primaryForeground },
              ]}
            >
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
    gap: 16,
  },
  logo: {
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  tagline: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    letterSpacing: -0.2,
    marginTop: -4,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
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
