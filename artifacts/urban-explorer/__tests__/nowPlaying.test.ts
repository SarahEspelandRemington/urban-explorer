/**
 * Cheap JS-side smoke tests for the expo-now-playing wrapper
 * (modules/expo-now-playing/src/index.ts), covering the two cases
 * identified in the A1a implementation brief §8:
 *   - missing-native-module calls degrade to no-ops without throwing;
 *   - remote-command listener registration is safe and remains inert.
 *
 * These exercise the JS wrapper only. NowPlayingModule.swift itself
 * (MPNowPlayingInfoCenter behavior, lock-screen rendering) can only be
 * verified in a real native build — see brief §8/§9.
 */

const mockPlatform = { OS: "ios" as const };
jest.mock("react-native", () => ({ Platform: mockPlatform }));

describe("NowPlaying — native module unavailable", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo", () => ({
      requireOptionalNativeModule: () => null,
    }));
  });

  test("isSupported is false", () => {
    const { NowPlaying } = require("../modules/expo-now-playing/src/index");
    expect(NowPlaying.isSupported).toBe(false);
  });

  test("setNowPlaying, setPlaybackState, and clear resolve without throwing", async () => {
    const { NowPlaying } = require("../modules/expo-now-playing/src/index");
    await expect(
      NowPlaying.setNowPlaying("Title", "Streetlit", false, null),
    ).resolves.toBeUndefined();
    await expect(NowPlaying.setPlaybackState(true)).resolves.toBeUndefined();
    await expect(NowPlaying.clear()).resolves.toBeUndefined();
  });

  test("addRemoteCommandListener returns a safe no-op unsubscribe", () => {
    const { NowPlaying } = require("../modules/expo-now-playing/src/index");
    const handler = jest.fn();
    const unsubscribe = NowPlaying.addRemoteCommandListener(handler);
    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("NowPlaying — remote-command listener registration remains inert", () => {
  const mockAddListener = jest.fn();
  const mockRemove = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockAddListener.mockReset();
    mockRemove.mockReset();
    mockAddListener.mockImplementation(() => ({ remove: mockRemove }));
    jest.doMock("expo", () => ({
      requireOptionalNativeModule: () => ({
        setNowPlaying: jest.fn(async () => {}),
        setPlaybackState: jest.fn(async () => {}),
        clear: jest.fn(async () => {}),
        addListener: mockAddListener,
      }),
    }));
  });

  test("registers all three remote-command events but never invokes the handler on its own", () => {
    const { NowPlaying } = require("../modules/expo-now-playing/src/index");
    const handler = jest.fn();
    NowPlaying.addRemoteCommandListener(handler);

    expect(mockAddListener).toHaveBeenCalledTimes(3);
    const registeredEvents = mockAddListener.mock.calls.map((c) => c[0]);
    expect(registeredEvents.sort()).toEqual(["onNext", "onPause", "onPlay"]);
    expect(handler).not.toHaveBeenCalled();
  });

  test("unsubscribe removes all three subscriptions safely, even if one throws", () => {
    mockRemove
      .mockImplementationOnce(() => {
        throw new Error("native remove failed");
      })
      .mockImplementation(() => {});
    const { NowPlaying } = require("../modules/expo-now-playing/src/index");
    const unsubscribe = NowPlaying.addRemoteCommandListener(jest.fn());

    expect(() => unsubscribe()).not.toThrow();
    expect(mockRemove).toHaveBeenCalledTimes(3);
  });
});
