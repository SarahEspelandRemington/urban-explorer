module.exports = {
  expo: {
    name: "Streetlit",
    slug: "streetlit",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/branding/streetlit-app-icon-production-2026-08.png",
    scheme: "streetlit",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/branding/streetlit-splash-prototype-2026-08.png",
      dark: {
        image: "./assets/branding/streetlit-splash-prototype-2026-08.png",
        backgroundColor: "#F3D3B9",
      },
      resizeMode: "contain",
      backgroundColor: "#F3D3B9",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.streetlit.app",
      infoPlist: {
        UIBackgroundModes: ["location", "audio"],
      },
    },
    android: {
      package: "com.streetlit.app",
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "WAKE_LOCK",
      ],
    },
    web: {
      favicon: "./assets/branding/streetlit-app-icon-1024.png",
    },
    plugins: [
      "expo-dev-client",
      [
        "@sentry/react-native/expo",
        {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
        },
      ],
      [
        "expo-router",
        {
          origin: "https://replit.com/",
        },
      ],
      "expo-font",
      "expo-web-browser",
      [
        "expo-audio",
        {
          microphonePermission: false,
          recordAudioAndroid: false,
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Allow Streetlit to use your location to find and narrate nearby places.",
          locationAlwaysAndWhenInUsePermission:
            "Allow Streetlit to keep narrating nearby places while your phone is in your pocket or the screen is locked.",
          locationAlwaysPermission:
            "Allow Streetlit to keep narrating nearby places while your phone is in your pocket or the screen is locked.",
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      // Timestamp of the last time this config was evaluated — i.e. the
      // last `expo start` / `expo prebuild` / `eas build` invocation. Used
      // by BuildInfoFooter as a best-effort "build date" since Expo does
      // not otherwise record one for non-OTA builds.
      buildDate: new Date().toISOString(),
      eas: {
        projectId: "929f545a-f8cc-4426-9856-d54face42a22",
      },
    },
  },
};
