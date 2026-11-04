import { afterEach, describe, expect, it, vi } from "vitest";

const insertValuesMock = vi.fn();
const onConflictDoUpdateMock = vi.fn();
const selectWhereMock = vi.fn();

vi.mock("@workspace/db", () => ({
  pool: {},
  apiCache: {
    namespace: "namespace",
    cacheKey: "cacheKey",
    expiresAt: "expiresAt",
  },
  db: {
    insert: vi.fn(() => ({
      values: (...args: unknown[]) => {
        insertValuesMock(...args);
        return { onConflictDoUpdate: onConflictDoUpdateMock };
      },
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: (...args: unknown[]) => selectWhereMock(...args),
      })),
    })),
  },
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({ openai: {} }));
vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  textToSpeech: vi.fn(),
}));

import {
  osmLastGoodKey,
  reAnchorStalePlaces,
  selectQualifyingOsmLastGood,
  upsertOsmLastGood,
  findQualifyingOsmLastGood,
} from "../routes/explore/index";

// A 125 m grid step in degrees, same approximation the module itself uses —
// used here only to construct test fixtures at known real-world distances,
// not re-implementing the module's own rounding.
const METERS_PER_DEGREE = 111320;
const CENTER_LAT = 40.758;
const CENTER_LNG = -73.985;

function offsetLat(meters: number): number {
  return CENTER_LAT + meters / METERS_PER_DEGREE;
}

function makePlace(osmId: string, lat: number, lon: number) {
  return { name: osmId, lat, lon, type: "place", tags: {}, osmId };
}

function makeRecord(
  overrides: Partial<{
    places: ReturnType<typeof makePlace>[];
    centerLat: number;
    centerLng: number;
    radius: number;
    fetchedAt: number;
  }> = {},
) {
  return {
    places: [] as ReturnType<typeof makePlace>[],
    centerLat: CENTER_LAT,
    centerLng: CENTER_LNG,
    radius: 300,
    fetchedAt: Date.now(),
    ...overrides,
  };
}

describe("osmLastGoodKey", () => {
  it("produces the same key for near-identical coordinates (same grid cell)", () => {
    const k1 = osmLastGoodKey(CENTER_LAT, CENTER_LNG, 300);
    const k2 = osmLastGoodKey(CENTER_LAT + 0.0000001, CENTER_LNG, 300);
    expect(k1).toBe(k2);
  });

  it("produces a different key for coordinates well outside the grid cell", () => {
    const k1 = osmLastGoodKey(CENTER_LAT, CENTER_LNG, 300);
    const k2 = osmLastGoodKey(offsetLat(1500), CENTER_LNG, 300);
    expect(k1).not.toBe(k2);
  });

  it("buckets the radius by rounding up to the nearest 50m", () => {
    expect(osmLastGoodKey(0, 0, 300)).toContain(":r300");
    expect(osmLastGoodKey(0, 0, 301)).toContain(":r350");
    expect(osmLastGoodKey(0, 0, 250)).toContain(":r250");
  });
});

describe("reAnchorStalePlaces", () => {
  it("keeps places within the current requested radius of the current center", () => {
    const near = makePlace("node/near", CENTER_LAT, CENTER_LNG);
    const far = makePlace("node/far", offsetLat(1000), CENTER_LNG);
    const result = reAnchorStalePlaces(
      [near, far],
      CENTER_LAT,
      CENTER_LNG,
      300,
    );
    expect(result.map((p) => p.osmId)).toEqual(["node/near"]);
  });

  it("recomputes distance from the CURRENT center, not any stored center", () => {
    // A place stored as "near" relative to some other center is correctly
    // dropped once re-anchored to a current center it is actually far from.
    const place = makePlace("node/x", offsetLat(50), CENTER_LNG);
    const closeToOriginal = reAnchorStalePlaces(
      [place],
      CENTER_LAT,
      CENTER_LNG,
      300,
    );
    const farFromNewCenter = reAnchorStalePlaces(
      [place],
      offsetLat(5000),
      CENTER_LNG,
      300,
    );
    expect(closeToOriginal).toHaveLength(1);
    expect(farFromNewCenter).toHaveLength(0);
  });
});

describe("selectQualifyingOsmLastGood", () => {
  it("returns null when there are no candidates", () => {
    expect(
      selectQualifyingOsmLastGood([], CENTER_LAT, CENTER_LNG, 300),
    ).toBeNull();
  });

  it("qualifies a stored entry within 150m of the current center", () => {
    const now = Date.now();
    const record = makeRecord({ centerLat: offsetLat(100), fetchedAt: now });
    const result = selectQualifyingOsmLastGood(
      [record],
      CENTER_LAT,
      CENTER_LNG,
      300,
      now,
    );
    expect(result).not.toBeNull();
  });

  it("excludes a stored entry beyond 150m of the current center", () => {
    const now = Date.now();
    const record = makeRecord({ centerLat: offsetLat(200), fetchedAt: now });
    const result = selectQualifyingOsmLastGood(
      [record],
      CENTER_LAT,
      CENTER_LNG,
      300,
      now,
    );
    expect(result).toBeNull();
  });

  it("qualifies when the stored radius is >= the requested radius", () => {
    const now = Date.now();
    const record = makeRecord({ radius: 500, fetchedAt: now });
    const result = selectQualifyingOsmLastGood(
      [record],
      CENTER_LAT,
      CENTER_LNG,
      300,
      now,
    );
    expect(result).not.toBeNull();
  });

  it("excludes when the stored radius is < the requested radius", () => {
    const now = Date.now();
    const record = makeRecord({ radius: 200, fetchedAt: now });
    const result = selectQualifyingOsmLastGood(
      [record],
      CENTER_LAT,
      CENTER_LNG,
      300,
      now,
    );
    expect(result).toBeNull();
  });

  it("serves a 71-hour-old entry", () => {
    const now = Date.now();
    const record = makeRecord({ fetchedAt: now - 71 * 60 * 60 * 1000 });
    const result = selectQualifyingOsmLastGood(
      [record],
      CENTER_LAT,
      CENTER_LNG,
      300,
      now,
    );
    expect(result).not.toBeNull();
  });

  it("does not serve a 73-hour-old entry", () => {
    const now = Date.now();
    const record = makeRecord({ fetchedAt: now - 73 * 60 * 60 * 1000 });
    const result = selectQualifyingOsmLastGood(
      [record],
      CENTER_LAT,
      CENTER_LNG,
      300,
      now,
    );
    expect(result).toBeNull();
  });

  it("chooses the nearest qualifying stored center", () => {
    const now = Date.now();
    const near = makeRecord({ centerLat: offsetLat(50), fetchedAt: now });
    const far = makeRecord({ centerLat: offsetLat(140), fetchedAt: now });
    const result = selectQualifyingOsmLastGood(
      [far, near],
      CENTER_LAT,
      CENTER_LNG,
      300,
      now,
    );
    expect(result!.distanceMeters).toBeLessThan(60);
  });

  it("tie-breaks equal-distance candidates by the most recent fetchedAt", () => {
    const now = Date.now();
    const older = makeRecord({
      fetchedAt: now - 1000,
      places: [makePlace("node/older", CENTER_LAT, CENTER_LNG)],
    });
    const newer = makeRecord({
      fetchedAt: now,
      places: [makePlace("node/newer", CENTER_LAT, CENTER_LNG)],
    });
    const result = selectQualifyingOsmLastGood(
      [older, newer],
      CENTER_LAT,
      CENTER_LNG,
      300,
      now,
    );
    expect(result!.places[0]!.osmId).toBe("node/newer");
  });
});

describe("upsertOsmLastGood (persistent store write)", () => {
  afterEach(() => {
    insertValuesMock.mockClear();
    onConflictDoUpdateMock.mockClear();
  });

  it("upserts the osm-last-good namespace with the raw place array and request center/radius", async () => {
    onConflictDoUpdateMock.mockResolvedValue(undefined);
    const places = [makePlace("node/1", CENTER_LAT, CENTER_LNG)];

    await upsertOsmLastGood(CENTER_LAT, CENTER_LNG, 300, places);

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    const valuesArg = insertValuesMock.mock.calls[0]![0] as {
      namespace: string;
      cacheKey: string;
      data: {
        places: unknown;
        centerLat: number;
        centerLng: number;
        radius: number;
        fetchedAt: number;
      };
    };
    expect(valuesArg.namespace).toBe("osm-last-good");
    expect(valuesArg.data.places).toEqual(places);
    expect(valuesArg.data.centerLat).toBe(CENTER_LAT);
    expect(valuesArg.data.centerLng).toBe(CENTER_LNG);
    expect(valuesArg.data.radius).toBe(300);
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the underlying write fails (swallowed, matching persistCacheEntry)", async () => {
    onConflictDoUpdateMock.mockRejectedValueOnce(new Error("db down"));
    await expect(
      upsertOsmLastGood(CENTER_LAT, CENTER_LNG, 300, []),
    ).resolves.toBeUndefined();
  });
});

describe("findQualifyingOsmLastGood (persistent store read)", () => {
  afterEach(() => {
    selectWhereMock.mockClear();
  });

  it("queries the osm-last-good namespace and returns the nearest qualifying stored result", async () => {
    const now = Date.now();
    const stored = makeRecord({ centerLat: offsetLat(50), fetchedAt: now });
    selectWhereMock.mockResolvedValueOnce([{ data: stored }]);

    const result = await findQualifyingOsmLastGood(CENTER_LAT, CENTER_LNG, 300);

    expect(result).not.toBeNull();
    expect(result!.radius).toBe(300);
  });

  it("returns null when no stored rows qualify", async () => {
    selectWhereMock.mockResolvedValueOnce([]);
    const result = await findQualifyingOsmLastGood(CENTER_LAT, CENTER_LNG, 300);
    expect(result).toBeNull();
  });

  it("returns null (not throw) when the underlying query fails", async () => {
    selectWhereMock.mockRejectedValueOnce(new Error("db down"));
    const result = await findQualifyingOsmLastGood(CENTER_LAT, CENTER_LNG, 300);
    expect(result).toBeNull();
  });
});
