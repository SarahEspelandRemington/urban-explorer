import Constants from "expo-constants";

/**
 * True when running inside the Expo Go client (as opposed to a standalone or
 * development build). Used to gate features that require native modules that
 * may not be compatible with Expo Go's bundled runtime (e.g. expo-audio MP3
 * playback, expo-file-system cache writes).
 */
export const IS_EXPO_GO = Constants.appOwnership === "expo";
