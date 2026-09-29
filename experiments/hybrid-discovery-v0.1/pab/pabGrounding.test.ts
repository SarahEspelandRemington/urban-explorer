/**
 * Tests for groundPabRecord's structured OSM element identity
 * (PabGroundingResult.osmElementId) — the fix for the display-name-vs-id
 * substitution bug identified in the production identity pre-wiring audit.
 * Offline/non-production, experimental — see ../README.md.
 *
 * NOTE ON TEST-RUNNER SCOPE: artifacts/api-server/vitest.config.ts has no
 * custom `test.include` root, so `pnpm --filter @workspace/api-server run
 * test` (the CI-scanned path) only scans within artifacts/api-server/. This
 * file lives under experiments/hybrid-discovery-v0.1/ and is NOT picked up
 * by that committed CI test path as currently configured — a known,
 * disclosed limitation, not a silent gap.
 */
import { describe, expect, it } from "vitest";
import { groundPabRecord, type OsmElement } from "./pabGrounding";
import type { PabRetrievalRecord } from "./pabAdapter";
import type { PabInterpretedRecord } from "./pabInterpreter";

function makeRecord(
  overrides: Partial<PabRetrievalRecord> & { pabId: string },
): PabRetrievalRecord {
  return {
    url: `https://example.invalid/${overrides.pabId}`,
    title: "123 Test St",
    addressBlock: ["1900 Spring Garden St"],
    matchedCorridorAddresses: [],
    ...overrides,
  };
}

function makeInterpreted(
  overrides: Partial<PabInterpretedRecord> & { pabId: string },
): PabInterpretedRecord {
  return {
    url: `https://example.invalid/${overrides.pabId}`,
    title: "123 Test St",
    classification: "claim-bearing",
    plainText: "",
    signals: {},
    ...overrides,
  };
}

function makeOsmElement(
  overrides: Partial<OsmElement> & { id: number; type: string },
): OsmElement {
  return {
    lowHouseNumber: 1900,
    highHouseNumber: 1900,
    street: "SPRING GARDEN ST",
    tags: {},
    ...overrides,
  };
}

describe("groundPabRecord — osmElementId structured identity", () => {
  it("current-entity: sets osmElementId to the structured type/id, distinct from the display-name matchedIdentifier", () => {
    const record = makeRecord({
      pabId: "p1",
      addressBlock: ["1900 Spring Garden St"],
    });
    const interpreted = makeInterpreted({
      pabId: "p1",
      plainText: "Building Type:\nBank\n",
    });
    const osmIndex: OsmElement[] = [
      makeOsmElement({
        id: 338306649,
        type: "way",
        tags: { name: "Polonia Federal Savings Bank", amenity: "bank" },
      }),
    ];
    const result = groundPabRecord(record, interpreted, osmIndex);
    expect(result.category).toBe("current-entity");
    expect(result.osmElementId).toBe("way/338306649");
    expect(result.matchedIdentifier).toBe("Polonia Federal Savings Bank");
    expect(result.osmElementId).not.toBe(result.matchedIdentifier);
  });

  it("current-building-former-use: also sets osmElementId to the structured id, not the display name", () => {
    const record = makeRecord({ pabId: "p2" });
    const interpreted = makeInterpreted({
      pabId: "p2",
      plainText: "Building Type:\nChurch\n",
    });
    const osmIndex: OsmElement[] = [
      makeOsmElement({
        id: 42,
        type: "way",
        tags: { name: "Some Lofts", building: "residential" },
      }),
    ];
    const result = groundPabRecord(record, interpreted, osmIndex);
    expect(result.category).toBe("current-building-former-use");
    expect(result.osmElementId).toBe("way/42");
    expect(result.matchedIdentifier).toBe("Some Lofts");
  });

  it("unnamed-current-building: sets osmElementId to the structured id (no display name exists to substitute)", () => {
    const record = makeRecord({ pabId: "p3" });
    const interpreted = makeInterpreted({ pabId: "p3" });
    const osmIndex: OsmElement[] = [
      makeOsmElement({ id: 7, type: "way", tags: { building: "yes" } }),
    ];
    const result = groundPabRecord(record, interpreted, osmIndex);
    expect(result.category).toBe("unnamed-current-building");
    expect(result.osmElementId).toBe("way/7");
  });

  it("former-site: deliberately leaves osmElementId undefined — the matched element is not the production identity for the historic place", () => {
    const record = makeRecord({ pabId: "p4" });
    const interpreted = makeInterpreted({ pabId: "p4" });
    const osmIndex: OsmElement[] = [
      makeOsmElement({
        id: 99,
        type: "node",
        tags: { "demolished:building": "yes" },
      }),
    ];
    const result = groundPabRecord(record, interpreted, osmIndex);
    expect(result.category).toBe("former-site");
    expect(result.osmElementId).toBeUndefined();
    expect(result.matchedIdentifier).toBe("node/99");
  });

  it("unresolved: no OSM match at all — osmElementId undefined", () => {
    const record = makeRecord({ pabId: "p5" });
    const interpreted = makeInterpreted({ pabId: "p5" });
    const result = groundPabRecord(record, interpreted, []);
    expect(result.category).toBe("unresolved");
    expect(result.osmElementId).toBeUndefined();
  });
});
