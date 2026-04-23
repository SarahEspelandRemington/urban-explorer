import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

type Subscription = { remove: () => void };

type NowPlayingNativeModule = {
  setNowPlaying(
    title: string,
    artist: string,
    isPaused: boolean,
    artworkUrl: string | null,
  ): Promise<void>;
  setPlaybackState(isPaused: boolean): Promise<void>;
  clear(): Promise<void>;
  addListener(eventName: "onPlay" | "onPause" | "onNext", listener: () => void): Subscription;
};

const native =
  Platform.OS === "ios" || Platform.OS === "android"
    ? (requireOptionalNativeModule("NowPlayingModule") as NowPlayingNativeModule | null)
    : null;

export type RemoteCommand = "play" | "pause" | "next";

const noop = () => Promise.resolve();

export const NowPlaying = {
  isSupported: native != null,

  /**
   * Update the iOS Now Playing widget. `artworkUrl` is the place's photo URL;
   * pass `null` (or omit) to fall back to the app icon on the lock screen.
   */
  setNowPlaying(
    title: string,
    artist: string,
    isPaused = false,
    artworkUrl: string | null = null,
  ): Promise<void> {
    return native ? native.setNowPlaying(title, artist, isPaused, artworkUrl) : noop();
  },

  setPlaybackState(isPaused: boolean): Promise<void> {
    return native ? native.setPlaybackState(isPaused) : noop();
  },

  clear(): Promise<void> {
    return native ? native.clear() : noop();
  },

  addRemoteCommandListener(handler: (cmd: RemoteCommand) => void): () => void {
    if (!native) return () => {};
    const subs: Subscription[] = [
      native.addListener("onPlay", () => handler("play")),
      native.addListener("onPause", () => handler("pause")),
      native.addListener("onNext", () => handler("next")),
    ];
    return () => {
      for (const s of subs) {
        try {
          s.remove();
        } catch {}
      }
    };
  },
};
