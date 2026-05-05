import {
  beforeSend,
  beforeAddBreadcrumb,
  isPiiKey,
  scrubObject,
  scrubString,
} from "./sentry";
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

describe("scrubString", () => {
  describe("redacts quoted double-quote values", () => {
    test('name: "Value" → name: [redacted]', () => {
      expect(scrubString('name: "Central Park"')).toBe("name: [redacted]");
    });

    test('place: "Coffee House" → place: [redacted]', () => {
      expect(scrubString('place: "Coffee House"')).toBe("place: [redacted]");
    });

    test('narration: "Long narration text" → narration: [redacted]', () => {
      expect(scrubString('narration: "Long narration text here"')).toBe(
        "narration: [redacted]",
      );
    });
  });

  describe("redacts quoted single-quote values", () => {
    test("name: 'Value' → name: [redacted]", () => {
      expect(scrubString("name: 'Central Park'")).toBe("name: [redacted]");
    });

    test("summary: 'AI description' → summary: [redacted]", () => {
      expect(scrubString("summary: 'AI generated description'")).toBe(
        "summary: [redacted]",
      );
    });
  });

  describe("redacts unquoted values", () => {
    test("name: CentralPark → name: [redacted]", () => {
      expect(scrubString("name: CentralPark")).toBe("name: [redacted]");
    });

    test("lat: 51.5074 → lat: [redacted]", () => {
      expect(scrubString("lat: 51.5074")).toBe("lat: [redacted]");
    });

    test("lon: -0.1278 → lon: [redacted]", () => {
      expect(scrubString("lon: -0.1278")).toBe("lon: [redacted]");
    });

    test("heading: 270 → heading: [redacted]", () => {
      expect(scrubString("heading: 270")).toBe("heading: [redacted]");
    });

    test("speed: 1.4 → speed: [redacted]", () => {
      expect(scrubString("speed: 1.4")).toBe("speed: [redacted]");
    });

    test("name: Central Park → name: [redacted] (multi-word)", () => {
      expect(scrubString("name: Central Park")).toBe("name: [redacted]");
    });

    test("place: Eiffel Tower Paris → place: [redacted] (three-word)", () => {
      expect(scrubString("place: Eiffel Tower Paris")).toBe(
        "place: [redacted]",
      );
    });

    test("name: Central Park, summary: nice — both keys redacted, comma consumed", () => {
      expect(scrubString("name: Central Park, summary: nice")).toBe(
        "name: [redacted] summary: [redacted]",
      );
    });

    test("two adjacent unquoted multi-word PII values are each fully redacted", () => {
      expect(scrubString("name: Central Park lat: 51.5")).toBe(
        "name: [redacted] lat: [redacted]",
      );
    });
  });

  describe("redacts key=value form", () => {
    test('place="Coffee House" → place=[redacted]', () => {
      expect(scrubString('place="Coffee House"')).toBe("place=[redacted]");
    });

    test("lat=51.5074 → lat=[redacted]", () => {
      expect(scrubString("lat=51.5074")).toBe("lat=[redacted]");
    });

    test("name=CentralPark → name=[redacted]", () => {
      expect(scrubString("name=CentralPark")).toBe("name=[redacted]");
    });

    test("address='123 Main St' → address=[redacted]", () => {
      expect(scrubString("address='123 Main St'")).toBe("address=[redacted]");
    });
  });

  describe("redacts multiple PII keys in one string", () => {
    test("lat and lon both redacted (unquoted values consume trailing comma)", () => {
      expect(scrubString("lat: 51.5, lon: -0.1")).toBe(
        "lat: [redacted] lon: [redacted]",
      );
    });

    test("name and summary both redacted", () => {
      expect(scrubString('name: "Park", summary: "Nice place"')).toBe(
        "name: [redacted], summary: [redacted]",
      );
    });

    test("mixed colon and equals forms", () => {
      expect(scrubString('lat: 51.5 place="Park"')).toBe(
        "lat: [redacted] place=[redacted]",
      );
    });
  });

  describe("leaves strings with no PII unchanged", () => {
    test("plain message with no PII keys is unchanged", () => {
      const msg = "Failed to fetch narration audio";
      expect(scrubString(msg)).toBe(msg);
    });

    test("safe key=value pairs are unchanged", () => {
      const msg = "kind: audio, status: ok";
      expect(scrubString(msg)).toBe(msg);
    });

    test("opaque IDs with PII-like suffix (Id) are unchanged", () => {
      const msg = "placeId: abc123";
      expect(scrubString(msg)).toBe(msg);
    });

    test("empty string returns empty string", () => {
      expect(scrubString("")).toBe("");
    });
  });

  describe("case-insensitivity", () => {
    test("NAME: Value → NAME: [redacted]", () => {
      expect(scrubString("NAME: CentralPark")).toBe("NAME: [redacted]");
    });

    test("Lat: 51.5 → Lat: [redacted]", () => {
      expect(scrubString("Lat: 51.5")).toBe("Lat: [redacted]");
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

  test("passes arrays of primitives through unchanged", () => {
    const input = { tags: ["audio", "outdoor"], placeId: "x" };
    const result = scrubObject(input);
    expect(result).toEqual({ tags: ["audio", "outdoor"], placeId: "x" });
  });

  test("scrubs PII keys from plain-object elements inside an array", () => {
    const input = {
      waypoints: [
        { lat: 51.5, lon: -0.1, kind: "audio" },
        { lat: 48.8, lon: 2.3, kind: "text" },
      ],
      placeId: "x",
    };
    const result = scrubObject(input);
    expect(result).toEqual({
      waypoints: [{ kind: "audio" }, { kind: "text" }],
      placeId: "x",
    });
  });

  test("keeps safe keys intact inside array elements", () => {
    const input = {
      items: [
        { placeId: "abc", narrationCount: 2, kind: "audio" },
        { placeId: "def", narrationCount: 1, kind: "text" },
      ],
    };
    expect(scrubObject(input)).toEqual(input);
  });

  test("recurses into nested objects inside array elements", () => {
    const input = {
      stops: [{ meta: { lat: 51.5, kind: "audio" }, placeId: "x" }],
    };
    expect(scrubObject(input)).toEqual({
      stops: [{ meta: { kind: "audio" }, placeId: "x" }],
    });
  });

  test("leaves non-object array elements (strings, numbers, null) unchanged", () => {
    const input = { values: [1, "hello", null, true] };
    expect(scrubObject(input)).toEqual({ values: [1, "hello", null, true] });
  });

  test("leaves non-plain-object array elements (Date, class instances) unchanged", () => {
    const d = new Date("2026-04-25T00:00:00Z");
    const input = { timestamps: [d] };
    const result = scrubObject(input);
    expect((result.timestamps as unknown[])[0]).toBe(d);
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
    const input = {
      placeId: "a",
      narrationCount: 1,
      kind: "text",
      isWalking: false,
    };
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

  describe("event.message redaction", () => {
    test("redacts PII in event.message (colon form)", () => {
      const event = makeEvent({ message: 'name: "Central Park"' });
      const result = beforeSend(event);
      expect(result.message).toBe("name: [redacted]");
    });

    test("redacts PII in event.message (equals form)", () => {
      const event = makeEvent({ message: 'place="Coffee House"' });
      const result = beforeSend(event);
      expect(result.message).toBe("place=[redacted]");
    });

    test("leaves safe event.message unchanged", () => {
      const msg = "walk error: audio not available";
      const event = makeEvent({ message: msg });
      const result = beforeSend(event);
      expect(result.message).toBe(msg);
    });

    test("handles missing event.message gracefully", () => {
      const event = makeEvent({ message: undefined });
      expect(() => beforeSend(event)).not.toThrow();
    });
  });

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
          {
            category: "walk",
            message: "place visited",
            data: { placeId: "abc" },
          },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      expect(result.breadcrumbs).toHaveLength(2);
      expect(
        (result.breadcrumbs as Breadcrumb[]).every(
          (b) => b.category === "walk",
        ),
      ).toBe(true);
    });

    test("retains only walk breadcrumbs when mixed", () => {
      const event = makeEvent({
        breadcrumbs: [
          { category: "xhr", message: "GET /api" },
          { category: "walk", message: "walk started" },
          { category: "console", message: "debug" },
          {
            category: "walk",
            message: "place visited",
            data: { placeId: "x" },
          },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      expect(result.breadcrumbs).toHaveLength(2);
      expect((result.breadcrumbs as Breadcrumb[])[0].message).toBe(
        "walk started",
      );
      expect((result.breadcrumbs as Breadcrumb[])[1].message).toBe(
        "place visited",
      );
    });

    test("redacts PII in walk-category breadcrumb message", () => {
      const event = makeEvent({
        breadcrumbs: [
          { category: "walk", message: 'name: "Central Park"', data: {} },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      const crumbs = result.breadcrumbs as Breadcrumb[];
      expect(crumbs[0].message).toBe("name: [redacted]");
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

    test("breadcrumb without data field is handled gracefully", () => {
      const event = makeEvent({
        breadcrumbs: [
          { category: "walk", message: "walk started" },
        ] as Breadcrumb[],
      });
      expect(() => beforeSend(event)).not.toThrow();
    });

    test("preserves walk breadcrumb data without PII unchanged", () => {
      const event = makeEvent({
        breadcrumbs: [
          {
            category: "walk",
            message: "place visited",
            data: { placeId: "abc", kind: "text" },
          },
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

    test("scrubs PII keys from array of objects inside walk breadcrumb data", () => {
      const event = makeEvent({
        breadcrumbs: [
          {
            category: "walk",
            message: "route recorded",
            data: {
              waypoints: [
                { lat: 51.5, lon: -0.1, placeId: "x", kind: "audio" },
                { lat: 48.8, lon: 2.3, placeId: "y", kind: "text" },
              ],
              placeId: "start",
            },
          },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      const crumbs = result.breadcrumbs as Breadcrumb[];
      expect(crumbs[0].data).toEqual({
        waypoints: [
          { placeId: "x", kind: "audio" },
          { placeId: "y", kind: "text" },
        ],
        placeId: "start",
      });
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
        extra: {
          placeId: "abc",
          narrationCount: 2,
          kind: "audio",
          isWalking: true,
        },
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

    test("scrubs PII keys from array of objects in event.extra", () => {
      const event = makeEvent({
        extra: {
          waypoints: [
            { lat: 51.5, lon: -0.1, kind: "audio" },
            { lat: 48.8, lon: 2.3, kind: "text" },
          ],
          retries: 2,
        },
      });
      const result = beforeSend(event);
      expect(result.extra).toEqual({
        waypoints: [{ kind: "audio" }, { kind: "text" }],
        retries: 2,
      });
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
          leak: { name: "Central Park", placeId: "abc" },
        } as unknown as ErrorEvent["contexts"],
      });
      const result = beforeSend(event);
      expect(result.contexts).toEqual({
        walk: { isWalking: true, currentPlaceId: "abc", placeCount: 3 },
        leak: { placeId: "abc" },
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

    test("scrubs PII keys from array of objects in event.contexts", () => {
      const event = makeEvent({
        contexts: {
          walk: {
            isWalking: true,
            stops: [
              { lat: 51.5, lon: -0.1, placeId: "x", kind: "audio" },
              { lat: 48.8, lon: 2.3, placeId: "y", kind: "text" },
            ],
          },
        } as unknown as ErrorEvent["contexts"],
      });
      const result = beforeSend(event);
      expect(result.contexts).toEqual({
        walk: {
          isWalking: true,
          stops: [
            { placeId: "x", kind: "audio" },
            { placeId: "y", kind: "text" },
          ],
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
        breadcrumbs: [
          { category: "walk", message: "walk started" },
        ] as Breadcrumb[],
      });
      const result = beforeSend(event);
      expect(result).toBe(event);
    });
  });
});

describe("beforeAddBreadcrumb", () => {
  describe("drops non-walk breadcrumbs", () => {
    test("returns null for xhr category", () => {
      const crumb: Breadcrumb = { category: "xhr", message: "GET /api/places" };
      expect(beforeAddBreadcrumb(crumb)).toBeNull();
    });

    test("returns null for console category", () => {
      const crumb: Breadcrumb = {
        category: "console",
        message: "user logged in",
      };
      expect(beforeAddBreadcrumb(crumb)).toBeNull();
    });

    test("returns null for navigation category", () => {
      const crumb: Breadcrumb = {
        category: "navigation",
        message: "route changed",
      };
      expect(beforeAddBreadcrumb(crumb)).toBeNull();
    });

    test("returns null for breadcrumb with no category", () => {
      const crumb: Breadcrumb = { message: "something happened" };
      expect(beforeAddBreadcrumb(crumb)).toBeNull();
    });

    test("returns null for unknown category", () => {
      const crumb: Breadcrumb = { category: "http", message: "request made" };
      expect(beforeAddBreadcrumb(crumb)).toBeNull();
    });
  });

  describe("passes walk breadcrumbs through", () => {
    test("returns breadcrumb unchanged when it has no data field", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "walk started",
        level: "info",
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.category).toBe("walk");
      expect(result!.message).toBe("walk started");
      expect(result!.data).toBeUndefined();
    });

    test("returns breadcrumb unchanged when data is undefined", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "walk stopped",
        data: undefined,
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.data).toBeUndefined();
    });

    test("preserves walk breadcrumb data that contains no PII", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "narration fetched",
        data: { placeId: "abc123", kind: "audio" },
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ placeId: "abc123", kind: "audio" });
    });
  });

  describe("scrubs PII from walk breadcrumb data", () => {
    test("removes top-level PII keys from data", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "narration fetched",
        data: { placeId: "abc", lat: 51.5, lon: -0.1, kind: "audio" },
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ placeId: "abc", kind: "audio" });
    });

    test("removes nested PII keys from data", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "route recorded",
        data: {
          placeId: "start",
          meta: { name: "Central Park", kind: "outdoor" },
        },
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({
        placeId: "start",
        meta: { kind: "outdoor" },
      });
    });

    test("scrubs PII from array-of-objects inside data", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "route recorded",
        data: {
          waypoints: [
            { lat: 51.5, lon: -0.1, placeId: "x", kind: "audio" },
            { lat: 48.8, lon: 2.3, placeId: "y", kind: "text" },
          ],
          placeId: "start",
        },
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({
        waypoints: [
          { placeId: "x", kind: "audio" },
          { placeId: "y", kind: "text" },
        ],
        placeId: "start",
      });
    });
  });

  describe("omits data when scrubbed result is empty", () => {
    test("sets data to undefined when all data keys are PII", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "leak",
        data: { lat: 51.5, lon: -0.1, name: "Central Park", heading: 270 },
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.data).toBeUndefined();
    });

    test("sets data to undefined when only PII key is present", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "leak",
        data: { speed: 1.4 },
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.data).toBeUndefined();
    });
  });

  describe("preserves non-data breadcrumb fields", () => {
    test("preserves message, level, and timestamp alongside scrubbed data", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "place visited",
        level: "info",
        timestamp: 1714003200,
        data: { placeId: "abc", lat: 51.5 },
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.message).toBe("place visited");
      expect(result!.level).toBe("info");
      expect(result!.timestamp).toBe(1714003200);
      expect(result!.data).toEqual({ placeId: "abc" });
    });
  });

  describe("scrubs PII from walk breadcrumb message", () => {
    test('redacts name in message (colon + quoted form) — visited name: "Central Park"', () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: 'visited name: "Central Park"',
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.message).toBe("visited name: [redacted]");
    });

    test('redacts coordinate in message — "lat: 51.5074"', () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "lat: 51.5074",
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.message).toBe("lat: [redacted]");
    });

    test('redacts place in message (equals form) — place="Coffee House"', () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: 'place="Coffee House"',
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.message).toBe("place=[redacted]");
    });

    test("leaves safe message unchanged", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: "walk started",
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.message).toBe("walk started");
    });

    test("handles missing message gracefully", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        data: { placeId: "abc" },
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.message).toBeUndefined();
    });

    test("scrubs both message and data when both contain PII", () => {
      const crumb: Breadcrumb = {
        category: "walk",
        message: 'name: "Central Park"',
        data: { placeId: "abc", lat: 51.5, kind: "audio" },
      };
      const result = beforeAddBreadcrumb(crumb);
      expect(result).not.toBeNull();
      expect(result!.message).toBe("name: [redacted]");
      expect(result!.data).toEqual({ placeId: "abc", kind: "audio" });
    });
  });
});
