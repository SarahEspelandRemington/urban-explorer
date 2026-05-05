import type { ErrorEvent } from "@sentry/react-native";
import { beforeSend, isPiiKey, scrubObject } from "../lib/sentry";

// ─── isPiiKey ────────────────────────────────────────────────────────────────

describe("isPiiKey", () => {
  describe("pattern matches", () => {
    const piiKeys = [
      "lat",
      "latitude",
      "lon",
      "longitude",
      "lng",
      "coord",
      "coordinates",
      "location",
      "place",
      "address",
      "destination",
      "origin",
      "route",
      "street",
      "city",
      "geo",
      "name",
      "summary",
      "narration",
      "altitude",
      "heading",
      "speed",
      "streetName",
      "cityBlock",
      "currentPlace",
      "userLocation",
    ];

    test.each(piiKeys)('"%s" is treated as a PII key', (key) => {
      expect(isPiiKey(key)).toBe(true);
    });
  });

  describe("Id suffix exemptions", () => {
    const safeIdKeys = [
      "placeId",
      "currentPlaceId",
      "locationId",
      "destinationId",
      "narrationId",
      "cityId",
      "routeId",
    ];

    test.each(safeIdKeys)('"%s" is NOT treated as PII (Id suffix)', (key) => {
      expect(isPiiKey(key)).toBe(false);
    });
  });

  describe("Count suffix exemptions", () => {
    const safeCountKeys = [
      "placeCount",
      "narrationCount",
      "locationCount",
      "routeCount",
      "cityCount",
    ];

    test.each(safeCountKeys)(
      '"%s" is NOT treated as PII (Count suffix)',
      (key) => {
        expect(isPiiKey(key)).toBe(false);
      },
    );
  });

  describe("case-insensitivity", () => {
    test('"Lat" is PII', () => expect(isPiiKey("Lat")).toBe(true));
    test('"LAT" is PII', () => expect(isPiiKey("LAT")).toBe(true));
    test('"Name" is PII', () => expect(isPiiKey("Name")).toBe(true));
    test('"SUMMARY" is PII', () => expect(isPiiKey("SUMMARY")).toBe(true));
    test('"GEO" is PII', () => expect(isPiiKey("GEO")).toBe(true));
  });

  describe("safe keys", () => {
    const safeKeys = [
      "kind",
      "isWalking",
      "status",
      "error",
      "timestamp",
      "duration",
      "level",
      "message",
      "componentStack",
    ];

    test.each(safeKeys)('"%s" is not PII', (key) => {
      expect(isPiiKey(key)).toBe(false);
    });
  });
});

// ─── scrubObject ─────────────────────────────────────────────────────────────

describe("scrubObject", () => {
  test("removes PII keys from a flat object", () => {
    const result = scrubObject({
      kind: "audio",
      name: "Some Place",
      lat: 51.5,
      lon: -0.1,
    });
    expect(result).toEqual({ kind: "audio" });
    expect(result).not.toHaveProperty("name");
    expect(result).not.toHaveProperty("lat");
    expect(result).not.toHaveProperty("lon");
  });

  test("preserves all keys in a safe object", () => {
    const input = { kind: "text", isWalking: true, placeCount: 3 };
    expect(scrubObject(input)).toEqual(input);
  });

  test("recursively scrubs nested objects", () => {
    const result = scrubObject({
      walk: {
        status: "active",
        location: { lat: 51.5, lon: -0.1 },
      },
    });
    expect(result).toEqual({ walk: { status: "active" } });
  });

  test("preserves Id-suffixed keys that contain pattern words", () => {
    const input = { placeId: "abc123", narrationId: "n99", kind: "audio" };
    expect(scrubObject(input)).toEqual(input);
  });

  test("preserves Count-suffixed keys that contain pattern words", () => {
    const input = { placeCount: 5, narrationCount: 2 };
    expect(scrubObject(input)).toEqual(input);
  });

  test("passes arrays through without recursing into them", () => {
    const input = { tags: ["a", "b"], kind: "audio" };
    const result = scrubObject(input);
    expect(result).toEqual(input);
  });

  test("handles null values without throwing", () => {
    const input = { kind: "audio", extra: null };
    expect(scrubObject(input as Record<string, unknown>)).toEqual(input);
  });

  test("returns empty object when all keys are PII", () => {
    const result = scrubObject({ lat: 1, lon: 2, name: "X" });
    expect(result).toEqual({});
  });
});

// ─── beforeSend integration ───────────────────────────────────────────────────
//
// These tests feed synthetic Sentry events directly through the exported
// `beforeSend` handler and assert that all PII fields are absent from the
// returned event. ErrorEvent.type is `undefined` per the Sentry type definition
// (error events are the default and carry no explicit type discriminant).

function makeEvent(fields: Omit<ErrorEvent, "type">): ErrorEvent {
  return fields as ErrorEvent;
}

describe("beforeSend integration", () => {
  test("drops non-walk breadcrumbs and keeps walk breadcrumbs", () => {
    const event = makeEvent({
      breadcrumbs: [
        { category: "console", message: "hello", data: {} },
        { category: "navigation", message: "went somewhere" },
        {
          category: "walk",
          message: "place visited",
          data: { placeId: "abc" },
        },
      ],
    });
    const result = beforeSend(event);
    expect(result.breadcrumbs).toHaveLength(1);
    expect(result.breadcrumbs![0].category).toBe("walk");
  });

  test("scrubs PII fields from walk breadcrumb data", () => {
    const event = makeEvent({
      breadcrumbs: [
        {
          category: "walk",
          message: "narration fetched",
          data: {
            placeId: "xyz",
            kind: "audio",
            name: "Secret Café",
            lat: 51.5,
            lon: -0.1,
          },
        },
      ],
    });
    const result = beforeSend(event);
    const data = result.breadcrumbs![0].data!;
    expect(data).not.toHaveProperty("name");
    expect(data).not.toHaveProperty("lat");
    expect(data).not.toHaveProperty("lon");
    expect(data).toHaveProperty("placeId", "xyz");
    expect(data).toHaveProperty("kind", "audio");
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
      ],
    });
    const result = beforeSend(event);
    const data = result.breadcrumbs![0].data!;
    expect(data).toHaveProperty("placeId", "start");
    const waypoints = data["waypoints"] as Record<string, unknown>[];
    expect(waypoints).toHaveLength(2);
    expect(waypoints[0]).not.toHaveProperty("lat");
    expect(waypoints[0]).not.toHaveProperty("lon");
    expect(waypoints[0]).toHaveProperty("placeId", "x");
    expect(waypoints[0]).toHaveProperty("kind", "audio");
    expect(waypoints[1]).not.toHaveProperty("lat");
    expect(waypoints[1]).not.toHaveProperty("lon");
    expect(waypoints[1]).toHaveProperty("placeId", "y");
    expect(waypoints[1]).toHaveProperty("kind", "text");
  });

  test("scrubs PII patterns from walk breadcrumb message strings", () => {
    const event = makeEvent({
      breadcrumbs: [
        {
          category: "walk",
          message: 'narration: "The old coffee house on main street"',
          data: { placeId: "abc" },
        },
      ],
    });
    const result = beforeSend(event);
    expect(result.breadcrumbs![0].message).not.toContain(
      "The old coffee house",
    );
    expect(result.breadcrumbs![0].message).toContain("[redacted]");
  });

  test("sets breadcrumbs to undefined when the list is empty", () => {
    const event = makeEvent({ breadcrumbs: [] });
    const result = beforeSend(event);
    expect(result.breadcrumbs).toBeUndefined();
  });

  test("clears event.request", () => {
    const event = makeEvent({
      request: { url: "https://example.com/api/places/123" },
    });
    const result = beforeSend(event);
    expect(result.request).toBeUndefined();
  });

  test("clears event.user", () => {
    const event = makeEvent({
      user: { id: "user-999", email: "test@example.com" },
    });
    const result = beforeSend(event);
    expect(result.user).toBeUndefined();
  });

  test("scrubs PII patterns from event.message string", () => {
    const event = makeEvent({
      message: 'Failed at name: "Central Park", lat: 40.7',
    });
    const result = beforeSend(event);
    expect(result.message).not.toContain("Central Park");
    expect(result.message).toContain("[redacted]");
  });

  test("scrubs PII keys from event.extra", () => {
    const event = makeEvent({
      extra: {
        status: "failed",
        name: "Central Park",
        location: { lat: 40.7, lon: -74.0 },
      },
    });
    const result = beforeSend(event);
    expect(result.extra).toHaveProperty("status", "failed");
    expect(result.extra).not.toHaveProperty("name");
    expect(result.extra).not.toHaveProperty("location");
  });

  test("scrubs PII keys from event.contexts, preserving safe context keys", () => {
    const event = makeEvent({
      contexts: {
        walk: {
          isWalking: true,
          currentPlaceId: "p42",
          placeCount: 7,
        },
        leak: {
          placeName: "Hidden Garden",
          lat: 48.8,
        },
      } as ErrorEvent["contexts"],
    });
    const result = beforeSend(event);
    const walk = (result.contexts as Record<string, unknown>)![
      "walk"
    ] as Record<string, unknown>;
    expect(walk).toHaveProperty("isWalking", true);
    expect(walk).toHaveProperty("currentPlaceId", "p42");
    expect(walk).toHaveProperty("placeCount", 7);

    const leak = (result.contexts as Record<string, unknown>)![
      "leak"
    ] as Record<string, unknown>;
    expect(leak).not.toHaveProperty("placeName");
    expect(leak).not.toHaveProperty("lat");
  });

  test("returns the same event object after scrubbing", () => {
    const event = makeEvent({ message: "Something went wrong" });
    const result = beforeSend(event);
    expect(result).toBeDefined();
    expect(result).toBe(event);
  });
});
