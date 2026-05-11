import "@/lib/coldStart"; // first import → records bundleStart timestamp
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { getApiToken } from "@/lib/apiToken";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { wrap as sentryWrap } from "@/lib/sentry";
import { markStartupPhase } from "@/lib/coldStart";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DevBuildBanner } from "@/components/DevBuildBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HeadingBanner } from "@/components/HeadingBanner";
import { DiscoveryProvider } from "@/contexts/DiscoveryContext";
import { HeadingProvider } from "@/contexts/HeadingContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { UserRatingsProvider } from "@/contexts/UserRatingsContext";
import { WalkModeProvider } from "@/contexts/WalkModeContext";

// Prefer EXPO_PUBLIC_API_URL (production) when present, fall back to the dev
// workspace URL. This lets the phone keep working against the published API
// even when the dev workspace is asleep.
setBaseUrl(
  process.env.EXPO_PUBLIC_API_URL ||
    `https://${process.env.EXPO_PUBLIC_DOMAIN}`,
);
setAuthTokenGetter(getApiToken);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    // Post-login bounce: an authenticated user landing on the login screen
    // (e.g. after a successful token exchange) is sent to the default tab.
    // Unauthenticated users are *not* force-redirected to /login here — the
    // app intentionally renders its tabs for browse-without-login. If you
    // want hard-enforced auth, gate the tabs themselves on `isAuthenticated`
    // rather than re-introducing a redirect here.
    const onLoginScreen = segments[0] === "login";
    if (isAuthenticated && onLoginScreen) {
      router.replace("/(tabs)/walk");
    }
  }, [isAuthenticated, isLoading, segments, router]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen
        name="login"
        options={{ headerShown: false, animation: "fade" }}
      />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="place-detail" options={{ headerShown: false }} />
      <Stack.Screen
        name="walk-mode"
        options={{
          headerShown: false,
          gestureEnabled: false,
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="walk-plan"
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="investigate"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="settings-messages"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
    </Stack>
  );
}

function RootLayout() {
  // Fonts are loaded asynchronously but no longer block the splash screen.
  // We render the app shell immediately with system-font fallbacks and let
  // the custom Inter weights swap in when they finish. This removes the
  // single biggest contributor to "splash visible" time on cold start —
  // historically 600-1200 ms on mid-tier Android.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      markStartupPhase("fontsLoaded");
    }
  }, [fontsLoaded, fontError]);

  // Hide the splash on first frame of the React tree, not when fonts finish.
  useEffect(() => {
    markStartupPhase("providersMounted");
    SplashScreen.hideAsync()
      .catch(() => {})
      .finally(() => markStartupPhase("splashHidden"));
  }, []);

  // First-interactive-frame marker. Pinned at the root so it always fires on
  // cold launch regardless of which tab the router lands on (the default is
  // Walk, but a deep link or post-login bounce can land elsewhere). Chained
  // rAF→rAF lets us land *after* the first paint instead of during the
  // commit. The recorder is one-shot, so re-mounts on warm reloads / route
  // changes are no-ops.
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        markStartupPhase("firstInteractiveFrame");
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <LocaleProvider>
              <UserRatingsProvider>
                <DiscoveryProvider>
                  <WalkModeProvider>
                    <HeadingProvider>
                      <GestureHandlerRootView style={{ flex: 1 }}>
                        <KeyboardProvider>
                          <RootLayoutNav />
                          <HeadingBanner />
                          <DevBuildBanner />
                        </KeyboardProvider>
                      </GestureHandlerRootView>
                    </HeadingProvider>
                  </WalkModeProvider>
                </DiscoveryProvider>
              </UserRatingsProvider>
            </LocaleProvider>
          </QueryClientProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default sentryWrap(RootLayout);
