/**
 * Tests for sentryWalk.ts — specifically that addWalkBreadcrumb scrubs PII
 * from the data object BEFORE it is passed to Sentry.addBreadcrumb (i.e. at
 * ingestion time, not merely at beforeSend / send time).
 *
 * Each test uses jest.resetModules() + a fresh require() so that the module-
 * level `const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN` is re-evaluated with
 * the env var already set, making addWalkBreadcrumb actually call through
 * instead of returning early.
 */

const FAKE_DSN = "https://test@o123.ingest.sentry.io/456";

describe("addWalkBreadcrumb — PII scrubbed at add-time", () => {
  let addWalkBreadcrumb: (
    message: string,
    data?: Record<string, unknown>,
    level?: string,
  ) => void;
  let mockAddBreadcrumb: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = FAKE_DSN;
    jest.resetModules();
    const Sentry = require("@sentry/react-native");
    mockAddBreadcrumb = Sentry.addBreadcrumb as jest.Mock;
    mockAddBreadcrumb.mockClear();
    ({ addWalkBreadcrumb } = require("../lib/sentryWalk"));
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    jest.resetModules();
  });

  test("strips lat/lon from data before Sentry.addBreadcrumb is called", () => {
    addWalkBreadcrumb("narration fetched", {
      placeId: "abc",
      lat: 51.5,
      lon: -0.1,
      kind: "audio",
    });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0];
    expect(arg.data).toEqual({ placeId: "abc", kind: "audio" });
    expect(arg.data).not.toHaveProperty("lat");
    expect(arg.data).not.toHaveProperty("lon");
  });

  test("strips place name from data before Sentry.addBreadcrumb is called", () => {
    addWalkBreadcrumb("place visited", {
      placeId: "xyz",
      name: "Central Park",
    });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0];
    expect(arg.data).toEqual({ placeId: "xyz" });
    expect(arg.data).not.toHaveProperty("name");
  });

  test("strips narration text from data before Sentry.addBreadcrumb is called", () => {
    addWalkBreadcrumb("narration fetched", {
      placeId: "p1",
      narration: "This historic building was built in 1890.",
      kind: "text",
    });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0];
    expect(arg.data).toEqual({ placeId: "p1", kind: "text" });
    expect(arg.data).not.toHaveProperty("narration");
  });

  test("strips heading/speed/altitude from data before Sentry.addBreadcrumb is called", () => {
    addWalkBreadcrumb("walk started", {
      heading: 270,
      speed: 1.2,
      altitude: 32,
      isWalking: true,
    });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0];
    expect(arg.data).toEqual({ isWalking: true });
    expect(arg.data).not.toHaveProperty("heading");
    expect(arg.data).not.toHaveProperty("speed");
    expect(arg.data).not.toHaveProperty("altitude");
  });

  test("preserves safe-only data unchanged", () => {
    addWalkBreadcrumb("place visited", {
      placeId: "abc",
      kind: "audio",
      narrationCount: 3,
    });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0];
    expect(arg.data).toEqual({ placeId: "abc", kind: "audio", narrationCount: 3 });
  });

  test("omits data key entirely when all fields are PII", () => {
    addWalkBreadcrumb("walk started", { lat: 51.5, lon: -0.1, name: "Place" });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0];
    expect(arg).not.toHaveProperty("data");
  });

  test("passes through when no data is provided", () => {
    addWalkBreadcrumb("walk stopped");

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0];
    expect(arg).not.toHaveProperty("data");
  });

  test("sets category to 'walk' and forwards message and level", () => {
    addWalkBreadcrumb("fetchNearbyPlaces error", { errorType: "TypeError" }, "error");

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0];
    expect(arg.category).toBe("walk");
    expect(arg.message).toBe("fetchNearbyPlaces error");
    expect(arg.level).toBe("error");
  });

  test("does not call Sentry.addBreadcrumb when DSN is absent", () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    jest.resetModules();
    const Sentry2 = require("@sentry/react-native");
    const addBreadcrumb2 = Sentry2.addBreadcrumb as jest.Mock;
    addBreadcrumb2.mockClear();
    const { addWalkBreadcrumb: addBreadcrumbNoSdk } = require("../lib/sentryWalk");

    addBreadcrumbNoSdk("walk started");

    expect(addBreadcrumb2).not.toHaveBeenCalled();
  });
});
