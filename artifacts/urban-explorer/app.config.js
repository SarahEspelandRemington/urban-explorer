module.exports = {
  expo: {
    name: "Urban Explorer",
    slug: "urban-explorer",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "urban-explorer",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "contain",
      backgroundColor: "#faf8f5",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.urbanexplorer.app",
      infoPlist: {
        NSMicrophoneUsageDescription:
          "Record voice memos to capture issues during a walk.",
        UIBackgroundModes: ["location", "audio"],
      },
    },
    android: {
      package: "com.urbanexplorer.app",
      permissions: [
        "RECORD_AUDIO",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "WAKE_LOCK",
      ],
    },
    web: {
      favicon: "./assets/images/icon.png",
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
          microphonePermission:
            "Record voice memos to capture issues during a walk.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Allow Urban Explorer to use your location to narrate nearby places.",
          locationAlwaysAndWhenInUsePermission:
            "Allow Urban Explorer to keep narrating nearby places while your phone is in your pocket or the screen is locked.",
          locationAlwaysPermission:
            "Allow Urban Explorer to keep narrating nearby places while your phone is in your pocket or the screen is locked.",
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
      eas: {
        projectId: "9b30343d-86e4-4227-9d0c-01b5a4376780",
      },
    },
  },
};
