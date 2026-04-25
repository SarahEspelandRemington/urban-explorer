import { isPiiKey, scrubObject } from "./sentry";

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
