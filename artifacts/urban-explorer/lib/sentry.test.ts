import { isPiiKey, scrubObject, beforeSend } from "./sentry";
import type { ErrorEvent, Breadcrumb } from "@sentry/react-native";

describe("isPiiKey", () => {
  describe("blocks all PII_KEY_PATTERNS", () => {
    const blockedKeys: [string, string][] = [
      ["lat", "lat"],
      ["latitude", "lat (substring)"],
      ["lon", "lon"],
      ["longitude", "lon (substring)"],
      ["lng", "lng"],
      ["coord", "coord"],
      ["coordinates", "coord (substring)"],
      ["location", "location"],
      ["userLocation", "location (substring)"],
      ["place", "place"],
      ["placeName", "place (substring — no *Id/*Count suffix)"],
      ["address", "address"],
      ["fullAddress", "address (substring)"],
      ["destination", "destination"],
      ["origin", "origin"],
      ["route", "route"],
      ["routePath", "route (substring)"],
      ["street", "street"],
      ["streetName", "street (substring)"],
      ["city", "city"],
      ["cityCode", "city (substring — no *Id/*Count suffix)"],
      ["geo", "geo"],
      ["geoHash", "geo (substring)"],
      ["name", "name"],
      ["displayName", "name (substring)"],
      ["summary", "summary"],
      ["placeSummary", "summary (substring)"],
      ["narration", "narration"],
      ["narrationText", "narration (substring — no *Count suffix)"],
      ["altitude", "altitude"],
      ["heading", "heading"],
      ["currentHeading", "heading (substring)"],
      ["speed", "speed"],
      ["currentSpeed", "speed (substring)"],
    ];

    test.each(blockedKeys)('isPiiKey("%s") is true — %s', (key) => {
      expect(isPiiKey(key)).toBe(true);
    });
  });

  describe("allows *Id suffix even when key contains a pattern word", () => {
    const allowedIdKeys: string[] = [
      "placeId",
      "currentPlaceId",
      "locationId",
      "routeId",
      "cityId",
      "addressId",
      "destinationId",
      "narrationId",
      "nameId",
      "geoId",
      "streetId",
    ];

    test.each(allowedIdKeys)('isPiiKey("%s") is false — *Id suffix', (key) => {
      expect(isPiiKey(key)).toBe(false);
    });
  });

  describe("allows *Count suffix even when key contains a pattern word", () => {
    const allowedCountKeys: string[] = [
      "placeCount",
      "narrationCount",
      "locationCount",
      "routeCount",
      "addressCount",
      "nameCount",
    ];

    test.each(allowedCountKeys)(
      'isPiiKey("%s") is false — *Count suffix',
      (key) => {
        expect(isPiiKey(key)).toBe(false);
      },
    );
  });

  describe("allows safe keys that contain no pattern words", () => {
    const safeKeys: string[] = [
      "kind",
      "isWalking",
      "status",
      "error",
      "timestamp",
      "enabled",
      "retries",
      "userId",
      "sessionId",
      "eventId",
    ];

    test.each(safeKeys)('isPiiKey("%s") is false — safe key', (key) => {
      expect(isPiiKey(key)).toBe(false);
    });
  });

  describe("case-insensitivity", () => {
    test('isPiiKey("Latitude") is true', () => {
      expect(isPiiKey("Latitude")).toBe(true);
    });
    test('isPiiKey("LAT") is true', () => {
      expect(isPiiKey("LAT")).toBe(true);
    });
    test('isPiiKey("LOCATION") is true', () => {
      expect(isPiiKey("LOCATION")).toBe(true);
    });
    test('isPiiKey("PlaceId") is false — *Id suffix wins over case', () => {
      expect(isPiiKey("PlaceId")).toBe(false);
    });
  });
});

describe("scrubObject", () => {
  test("removes top-level PII keys", () => {
    const input = { lat: 51.5, lon: -0.1, kind: "audio" };
    const result = scrubObject(input);
    expect(result).toEqual({ kind: "audio" });
  });

  test("keeps all safe top-level keys intact", () => {
    const input = {
      placeId: "abc123",
      narrationCount: 3,
      kind: "audio",
      isWalking: true,
    };
    expect(scrubObject(input)).toEqual(input);
  });

  test("recurses into nested objects", () => {
    const input = {
      walk: {
        placeId: "abc123",
        location: { lat: 51.5, lon: -0.1 },
        isWalking: true,
      },
    };
    const result = scrubObject(input);
    expect(result).toEqual({
      walk: {
        placeId: "abc123",
        isWalking: true,
      },
    });
  });

  test("recurses multiple levels deep", () => {
    const input = {
      outer: {
        middle: {
          inner: {
            lat: 51.5,
            placeId: "x",
            kind: "audio",
          },
        },
      },
    };
    const result = scrubObject(input);
    expect(result).toEqual({
      outer: {
        middle: {
          inner: {
            placeId: "x",
            kind: "audio",
          },
        },
      },
    });
  });

  test("strips PII keys at every depth level simultaneously", () => {
    const input = {
      lat: 51.5,
      meta: {
        name: "Central Park",
        placeCount: 5,
        deep: {
          heading: 270,
          narrationCount: 2,
        },
      },
    };
    expect(scrubObject(input)).toEqual({
      meta: {
        placeCount: 5,
        deep: {
          narrationCount: 2,
        },
      },
    });
  });

  test("passes arrays through without recursing into them", () => {
    const input = { tags: ["audio", "outdoor"], placeId: "x" };
    const result = scrubObject(input);
    expect(result).toEqual({ tags: ["audio", "outdoor"], placeId: "x" });
  });

  test("passes null values through", () => {
    const input = { status: null, placeId: "x" };
    const result = scrubObject(input);
    expect(result).toEqual({ status: null, placeId: "x" });
  });

  test("returns empty object when all keys are PII", () => {
    const input = { lat: 1.0, lon: 2.0, name: "Place", heading: 90 };
    expect(scrubObject(input)).toEqual({});
  });

  test("returns identical object when no keys are PII", () => {
    const input = { placeId: "a", narrationCount: 1, kind: "text", isWalking: false };
    expect(scrubObject(input)).toEqual(input);
  });
});

describe("beforeSend pipeline", () => {
  function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
    return {
      event_id: "test-event-id",
      ...overrides,
    } as ErrorEvent;
  }

  describe("breadcrumb filtering", () => {
    test("drops non-walk breadcrumbs", () => {
      const event = makeEvent({
        breadcrumbs: [
          { category: "xhr", message: "GET /api/places" },
          { category: "console", message: "user logged in" },
          { category: "navigation", message: "route changed" },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      expect(result.breadcrumbs).toBeUndefined();
    });

    test("retains walk breadcrumbs", () => {
      const event = makeEvent({
        breadcrumbs: [
          { category: "walk", message: "walk started" },
          { category: "walk", message: "place visited", data: { placeId: "abc" } },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      expect(result.breadcrumbs).toHaveLength(2);
      expect((result.breadcrumbs as Breadcrumb[]).every((b) => b.category === "walk")).toBe(true);
    });

    test("retains only walk breadcrumbs when mixed", () => {
      const event = makeEvent({
        breadcrumbs: [
          { category: "xhr", message: "GET /api" },
          { category: "walk", message: "walk started" },
          { category: "console", message: "debug" },
          { category: "walk", message: "place visited", data: { placeId: "x" } },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      expect(result.breadcrumbs).toHaveLength(2);
      expect((result.breadcrumbs as Breadcrumb[])[0].message).toBe("walk started");
      expect((result.breadcrumbs as Breadcrumb[])[1].message).toBe("place visited");
    });

    test("scrubs PII from walk breadcrumb data", () => {
      const event = makeEvent({
        breadcrumbs: [
          {
            category: "walk",
            message: "narration fetched",
            data: { placeId: "abc", lat: 51.5, kind: "audio" },
          },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      const crumbs = result.breadcrumbs as Breadcrumb[];
      expect(crumbs[0].data).toEqual({ placeId: "abc", kind: "audio" });
    });

    test("preserves walk breadcrumb data without PII unchanged", () => {
      const event = makeEvent({
        breadcrumbs: [
          { category: "walk", message: "place visited", data: { placeId: "abc", kind: "text" } },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      const crumbs = result.breadcrumbs as Breadcrumb[];
      expect(crumbs[0].data).toEqual({ placeId: "abc", kind: "text" });
    });

    test("preserves walk breadcrumb with no data field", () => {
      const event = makeEvent({
        breadcrumbs: [
          { category: "walk", message: "walk stopped" },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      const crumbs = result.breadcrumbs as Breadcrumb[];
      expect(crumbs[0].data).toBeUndefined();
    });

    test("sets breadcrumbs to undefined when breadcrumbs array is empty", () => {
      const event = makeEvent({ breadcrumbs: [] as Breadcrumb[] });
      const result = beforeSend(event);
      expect(result.breadcrumbs).toBeUndefined();
    });

    test("sets breadcrumbs to undefined when breadcrumbs is absent", () => {
      const event = makeEvent();
      const result = beforeSend(event);
      expect(result.breadcrumbs).toBeUndefined();
    });
  });

  describe("event.user and event.request clearing", () => {
    test("clears event.user", () => {
      const event = makeEvent({
        user: { id: "user-123", email: "test@example.com", username: "tester" },
      });
      const result = beforeSend(event);
      expect(result.user).toBeUndefined();
    });

    test("clears event.request", () => {
      const event = makeEvent({
        request: {
          url: "https://api.example.com/places",
          method: "GET",
          headers: { Authorization: "Bearer token" },
        },
      });
      const result = beforeSend(event);
      expect(result.request).toBeUndefined();
    });

    test("clears both event.user and event.request together", () => {
      const event = makeEvent({
        user: { id: "u1", email: "a@b.com" },
        request: { url: "https://api.example.com/places", method: "POST" },
      });
      const result = beforeSend(event);
      expect(result.user).toBeUndefined();
      expect(result.request).toBeUndefined();
    });

    test("does not fail when user and request are already absent", () => {
      const event = makeEvent();
      const result = beforeSend(event);
      expect(result.user).toBeUndefined();
      expect(result.request).toBeUndefined();
    });
  });

  describe("event.extra scrubbing", () => {
    test("scrubs PII keys from event.extra", () => {
      const event = makeEvent({
        extra: { lat: 51.5, lon: -0.1, retries: 3 },
      });
      const result = beforeSend(event);
      expect(result.extra).toEqual({ retries: 3 });
    });

    test("preserves safe keys in event.extra", () => {
      const event = makeEvent({
        extra: { placeId: "abc", narrationCount: 2, kind: "audio", isWalking: true },
      });
      const result = beforeSend(event);
      expect(result.extra).toEqual({
        placeId: "abc",
        narrationCount: 2,
        kind: "audio",
        isWalking: true,
      });
    });

    test("scrubs nested PII in event.extra", () => {
      const event = makeEvent({
        extra: { meta: { name: "Central Park", placeId: "x", status: "ok" } },
      });
      const result = beforeSend(event);
      expect(result.extra).toEqual({ meta: { placeId: "x", status: "ok" } });
    });

    test("does not modify event when extra is absent", () => {
      const event = makeEvent();
      const result = beforeSend(event);
      expect(result.extra).toBeUndefined();
    });
  });

  describe("event.contexts scrubbing", () => {
    test("scrubs PII keys from event.contexts", () => {
      const event = makeEvent({
        contexts: {
          walk: { isWalking: true, currentPlaceId: "abc", placeCount: 3 },
          location: { lat: 51.5, lon: -0.1 },
        } as unknown as ErrorEvent["contexts"],
      });
      const result = beforeSend(event);
      expect(result.contexts).toEqual({
        walk: { isWalking: true, currentPlaceId: "abc", placeCount: 3 },
      });
    });

    test("preserves safe walk context data intact", () => {
      const event = makeEvent({
        contexts: {
          walk: {
            isWalking: true,
            currentPlaceId: "abc123",
            placeCount: 5,
            narrationCount: 2,
          },
        } as unknown as ErrorEvent["contexts"],
      });
      const result = beforeSend(event);
      expect(result.contexts).toEqual({
        walk: {
          isWalking: true,
          currentPlaceId: "abc123",
          placeCount: 5,
          narrationCount: 2,
        },
      });
    });

    test("does not modify event when contexts is absent", () => {
      const event = makeEvent();
      const result = beforeSend(event);
      expect(result.contexts).toBeUndefined();
    });
  });

  describe("returns the event", () => {
    test("beforeSend always returns the (mutated) event object", () => {
      const event = makeEvent({
        user: { id: "u1" },
        extra: { lat: 51.5, kind: "audio" },
        breadcrumbs: [{ category: "walk", message: "walk started" }] as Breadcrumb[],
      });
      const result = beforeSend(event);
      expect(result).toBe(event);
    });
  });
});
