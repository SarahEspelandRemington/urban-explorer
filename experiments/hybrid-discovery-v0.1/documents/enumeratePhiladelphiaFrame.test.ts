/**
 * Tests for the Step 4 structural frame parser/stratifier/seeded-draw
 * primitives. Uses small synthetic fixtures mirroring the real
 * `pdftotext -layout` PRHP inventory structure (title line, column header,
 * data rows, blank lines, "Page N of M" footer, form-feed page breaks) —
 * never the real 14,533-row file, and never any nomination narrative.
 */
import { describe, expect, it } from "vitest";
import type { DocumentResource } from "./documentEvidencePacket";
import {
  buildCandidateFrame,
  classifyStratum,
  checkDistrictPackageEntryMatch,
  checkFileRetrievalGate,
  checkFormIdentityMarker,
  checkPackageAlreadyRepresented,
  classifyTextLayer,
  CANDIDATE_CHECK_CAP,
  DISTRICT_PACKAGE_FORM_IDENTITY_MARKER,
  INDIVIDUAL_FORM_IDENTITY_MARKER,
  parseInventoryText,
  PILOT_SEED,
  seededShuffleOrder,
  stableSortByAddress,
  type AcceptedPackageRecord,
  type InventoryRecord,
} from "./enumeratePhiladelphiaFrame";
import { PILOT_EXCLUSIONS } from "./PILOT_EXCLUSIONS";
import { DISTRICT_CALIBRATION_CANDIDATE_LOG } from "./districtCalibrationCandidateLog";

function page(
  headerSpacing: {
    desig1: number;
    desig2: number;
    district1: number;
    districtDate1: number;
    district2: number;
    districtDate2: number;
    historicName: number;
    date: number;
  },
  rows: string[],
  pageNum: number,
): string {
  const header =
    "Address" +
    " ".repeat(headerSpacing.desig1 - "Address".length) +
    "Desig Date1" +
    " ".repeat(
      headerSpacing.desig2 - (headerSpacing.desig1 + "Desig Date1".length),
    ) +
    "Desig Date2" +
    " ".repeat(
      headerSpacing.district1 - (headerSpacing.desig2 + "Desig Date2".length),
    ) +
    "District1" +
    " ".repeat(
      headerSpacing.districtDate1 -
        (headerSpacing.district1 + "District1".length),
    ) +
    "District Date1" +
    " ".repeat(
      headerSpacing.district2 -
        (headerSpacing.districtDate1 + "District Date1".length),
    ) +
    "District2" +
    " ".repeat(
      headerSpacing.districtDate2 -
        (headerSpacing.district2 + "District2".length),
    ) +
    "District Date2" +
    " ".repeat(
      headerSpacing.historicName -
        (headerSpacing.districtDate2 + "District Date2".length),
    ) +
    "Historic Name" +
    " ".repeat(
      headerSpacing.date -
        (headerSpacing.historicName + "Historic Name".length),
    ) +
    "Date";

  return [
    "Philadelphia Historical Commission   Philadelphia Register of Historic Places (OPA-compliant Addresses)   As of Testing",
    "",
    header,
    ...rows,
    "",
    "",
    `                         Page ${pageNum} of 2`,
  ].join("\n");
}

const SPACING = {
  desig1: 28,
  desig2: 40,
  district1: 52,
  districtDate1: 77,
  district2: 92,
  districtDate2: 113,
  historicName: 128,
  date: 186,
};

function padTo(text: string, col: number): string {
  return text.length >= col ? text + " " : text + " ".repeat(col - text.length);
}

function buildRow(fields: {
  address: string;
  desigDate1?: string;
  district1?: string;
  districtDate1?: string;
  historicName?: string;
  date?: string;
}): string {
  let row = padTo(fields.address, SPACING.desig1);
  row = padTo(row + (fields.desigDate1 ?? ""), SPACING.district1);
  row = padTo(row + (fields.district1 ?? ""), SPACING.districtDate1);
  row = padTo(row + (fields.districtDate1 ?? ""), SPACING.historicName);
  row =
    row +
    (fields.historicName ?? "") +
    (fields.date ? "   " + fields.date : "");
  return row;
}

describe("parseInventoryText", () => {
  it("parses an individual-only record (desig date, no district)", () => {
    const row = buildRow({
      address: "2301 FAIRMOUNT AVE",
      desigDate1: "10/14/2022",
      historicName: "Rothacker-Orth Brewery and Lager Beer Saloon",
      date: "1845",
    });
    const page1 = page(SPACING, [row], 1);
    const result = parseInventoryText(page1 + "\f" + page(SPACING, [], 2));

    expect(result.anomalies).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.address).toBe("2301 FAIRMOUNT AVE");
    expect(rec.hasIndividualDesignation).toBe(true);
    expect(rec.hasDistrictDesignation).toBe(false);
    expect(rec.historicName).toBe(
      "Rothacker-Orth Brewery and Lager Beer Saloon",
    );
    expect(rec.constructionDate).toBe("1845");
  });

  it("parses a district-only record and does not swallow the district name into the address", () => {
    const row = buildRow({
      address: "5501 GERMANTOWN AVE",
      district1: "Germantown Urban Village",
      districtDate1: "2/9/2024",
      historicName: "Soldiers' Monument",
      date: "1883",
    });
    const result = parseInventoryText(page(SPACING, [row], 1));

    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.address).toBe("5501 GERMANTOWN AVE");
    expect(rec.hasIndividualDesignation).toBe(false);
    expect(rec.hasDistrictDesignation).toBe(true);
    expect(rec.districtName).toBe("Germantown Urban Village");
  });

  it("parses the both-designation overlap case (individual date and district date together)", () => {
    const row = buildRow({
      address: "1314 ADDISON ST",
      desigDate1: "3/28/1961",
      district1: "Washington Square West",
      districtDate1: "9/13/2024",
      date: "1850",
    });
    const result = parseInventoryText(page(SPACING, [row], 1));

    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.hasIndividualDesignation).toBe(true);
    expect(rec.hasDistrictDesignation).toBe(true);
    expect(rec.districtName).toBe("Washington Square West");
    expect(classifyStratum(rec)).toBe("individual");
  });

  it("classifies a district-only record as the district-package stratum (renamed from district-only)", () => {
    const row = buildRow({
      address: "601 ADDISON ST",
      district1: "Society Hill",
      districtDate1: "3/10/1999",
    });
    const result = parseInventoryText(page(SPACING, [row], 1));
    expect(classifyStratum(result.records[0])).toBe("district-package");
  });

  it("parses a record with no historic name and no construction date", () => {
    const row = buildRow({
      address: "601 ADDISON ST",
      district1: "Society Hill",
      districtDate1: "3/10/1999",
    });
    const result = parseInventoryText(page(SPACING, [row], 1));
    expect(result.records).toHaveLength(1);
    expect(result.records[0].historicName).toBe("");
    expect(result.records[0].constructionDate).toBeUndefined();
  });

  it("handles multiple pages split by a form-feed, each with its own header spacing", () => {
    const row1 = buildRow({ address: "1 TEST ST", desigDate1: "1/1/2000" });
    const narrowSpacing = {
      desig1: 26,
      desig2: 38,
      district1: 50,
      districtDate1: 72,
      district2: 87,
      districtDate2: 104,
      historicName: 119,
      date: 160,
    };
    const row2 = buildRow({ address: "2 TEST ST", desigDate1: "2/2/2000" });
    const combined =
      page(SPACING, [row1], 1) + "\f" + page(narrowSpacing, [row2], 2);

    const result = parseInventoryText(combined);
    expect(result.anomalies).toHaveLength(0);
    expect(result.pagesParsed).toBe(2);
    expect(result.records.map((r) => r.address)).toEqual([
      "1 TEST ST",
      "2 TEST ST",
    ]);
  });

  it("records an anomaly for a row with no date token instead of silently dropping or misparsing it", () => {
    const badRow =
      "999 BROKEN ST                                       No Date Here At All";
    const result = parseInventoryText(page(SPACING, [badRow], 1));
    expect(result.records).toHaveLength(0);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].reason).toBe("no-date-token");
  });

  it("ignores blank lines and the page footer line", () => {
    const row = buildRow({ address: "1 TEST ST", desigDate1: "1/1/2000" });
    const result = parseInventoryText(page(SPACING, [row], 1));
    expect(result.records).toHaveLength(1);
  });

  it("filters out a trailing empty page segment (no header) without counting it as an error", () => {
    const row = buildRow({ address: "1 TEST ST", desigDate1: "1/1/2000" });
    const result = parseInventoryText(
      page(SPACING, [row], 1) + "\f" + "   \n\n  ",
    );
    expect(result.pagesWithoutHeader).toBe(0);
    expect(result.records).toHaveLength(1);
  });
});

describe("buildCandidateFrame", () => {
  const indivRow = buildRow({
    address: "2301 FAIRMOUNT AVE",
    desigDate1: "10/14/2022",
    date: "1845",
  });
  const districtRow = buildRow({
    address: "517 ADDISON ST",
    district1: "Society Hill",
    districtDate1: "3/10/1999",
  });
  const excludedRow = buildRow({
    address: "999 EXCLUDED ST",
    desigDate1: "1/1/1990",
  });
  const rawText = page(SPACING, [indivRow, districtRow, excludedRow], 1);

  it("splits records into individual/district-package candidate pools and removes exclusions from both", () => {
    const frame = buildCandidateFrame(rawText, [
      { address: "999 EXCLUDED ST" },
    ]);

    expect(frame.totalRecordsInspected).toBe(3);
    expect(frame.individualCandidatePool.map((r) => r.address)).toEqual([
      "2301 FAIRMOUNT AVE",
    ]);
    expect(frame.districtPackageCandidatePool.map((r) => r.address)).toEqual([
      "517 ADDISON ST",
    ]);
    expect(frame.excludedRecords.map((r) => r.address)).toEqual([
      "999 EXCLUDED ST",
    ]);
  });

  it("does not drop a non-excluded record from either pool", () => {
    const frame = buildCandidateFrame(rawText, []);
    expect(frame.individualCandidatePool).toHaveLength(2);
    expect(frame.districtPackageCandidatePool).toHaveLength(1);
    expect(frame.excludedRecords).toHaveLength(0);
  });
});

describe("structural-check gates (design verification only — never run against a real candidate)", () => {
  it("Gate 1: continues when fetched, skips unfetchable-missing-file when not", () => {
    expect(checkFileRetrievalGate(true)).toEqual({ outcome: "continue" });
    expect(checkFileRetrievalGate(false)).toEqual({
      outcome: "skip",
      reason: "unfetchable-missing-file",
    });
  });

  it("Gate 2: classifies empty/whitespace-only extraction as scan-only, never as a skip", () => {
    expect(classifyTextLayer("")).toBe("scan-only");
    expect(classifyTextLayer("   \n\n  ")).toBe("scan-only");
    expect(classifyTextLayer("1. ADDRESS OF HISTORIC RESOURCE")).toBe(
      "has-text-layer",
    );
  });

  it("Gate 3: the frozen individual-form marker matches the real confirmed verbatim line", () => {
    const realExcerpt =
      "1. ADDRESS OF HISTORIC RESOURCE (must comply with an Office of Property Assessment address)\n       Street address:__________";
    expect(
      checkFormIdentityMarker(realExcerpt, INDIVIDUAL_FORM_IDENTITY_MARKER),
    ).toEqual({ outcome: "applicable" });
  });

  it("Gate 3: an unrelated document format is skipped as wrong-document-type-adapter-inapplicable", () => {
    const unrelatedText =
      "Some Other City's Permit Application Form\nField: value";
    expect(
      checkFormIdentityMarker(unrelatedText, INDIVIDUAL_FORM_IDENTITY_MARKER),
    ).toEqual({
      outcome: "skip",
      reason: "wrong-document-type-adapter-inapplicable",
    });
  });

  it("Gate 3: difficult-to-parse-but-same-form text still matches on the exact marker line (parsing difficulty is not format mismatch)", () => {
    const messyButRealForm =
      "garbled header junk\n1. ADDRESS OF HISTORIC RESOURCE (must comply with an Office of Property Assessment address)\nmore garbled text";
    expect(
      checkFormIdentityMarker(
        messyButRealForm,
        INDIVIDUAL_FORM_IDENTITY_MARKER,
      ),
    ).toEqual({ outcome: "applicable" });
  });

  it("Gate 3 (Step 5 — district calibration): recognizes the narrative-block-inventory dialect via its repeating section-heading pattern (synthetic fixture, ≥10 occurrences, mirroring the real Old City nomination's confirmed structure)", () => {
    const headingLines = [
      "N. AMERICAN STREET – Unit Block",
      "N. AMERICAN STREET – 300 Block",
      "APPLETREE STREET - Unit Block",
      "ARCH STREET - 100 Block",
      "ARCH STREET - 200 Block",
      "BREAD STREET – Unit Block",
      "CHERRY STREET - Unit Block",
      "CHURCH STREET - Unit Block",
      "ELFRETH'S ALLEY - Unit Block",
      "FRONT STREET - 100 Block",
      "FRONT STREET - 200 Block",
    ];
    const fixture = headingLines
      .map((h) => `${h}\nSome synthetic entry text.`)
      .join("\n");
    expect(
      checkFormIdentityMarker(fixture, DISTRICT_PACKAGE_FORM_IDENTITY_MARKER),
    ).toEqual({
      outcome: "applicable",
      matchedDialectLabel: "narrative-block-inventory",
    });
  });

  it("Gate 3 (Step 5 — district calibration): recognizes the per-parcel-field-survey dialect via its repeating Address field-label line (synthetic fixture, ≥10 occurrences, mirroring the real Southeast Spruce Hill nomination's confirmed structure)", () => {
    const addressLines = Array.from(
      { length: 11 },
      (_, i) => `Address            ${100 + i} TEST ST`,
    );
    const fixture = addressLines
      .map(
        (a) =>
          `${a}\nRegistry Number       TEST-${100 + addressLines.indexOf(a)}`,
      )
      .join("\n");
    expect(
      checkFormIdentityMarker(fixture, DISTRICT_PACKAGE_FORM_IDENTITY_MARKER),
    ).toEqual({
      outcome: "applicable",
      matchedDialectLabel: "per-parcel-field-survey",
    });
  });

  it("Gate 3 (Step 5 — district calibration): a document matching neither confirmed district dialect is skipped as wrong-document-type-adapter-inapplicable", () => {
    const unrelatedText =
      "Some Other City's Permit Application Form\nField: value";
    expect(
      checkFormIdentityMarker(
        unrelatedText,
        DISTRICT_PACKAGE_FORM_IDENTITY_MARKER,
      ),
    ).toEqual({
      outcome: "skip",
      reason: "wrong-document-type-adapter-inapplicable",
    });
  });

  it("Gate 3 (Step 5 — district calibration): a sparse/incidental match below minOccurrences is NOT treated as format confirmation", () => {
    const sparseFixture =
      "Address            100 TEST ST\nRegistry Number TEST-1\n\nSome unrelated narrative document with just one incidental Address-looking line.";
    expect(
      checkFormIdentityMarker(
        sparseFixture,
        DISTRICT_PACKAGE_FORM_IDENTITY_MARKER,
      ),
    ).toEqual({
      outcome: "skip",
      reason: "wrong-document-type-adapter-inapplicable",
    });
  });

  it("Gate 3 (Step 5 — district calibration): the individual-form marker still matches its own real document and still rejects both district dialects (no cross-family regression)", () => {
    const realExcerpt =
      "1. ADDRESS OF HISTORIC RESOURCE (must comply with an Office of Property Assessment address)\n       Street address:__________";
    expect(
      checkFormIdentityMarker(realExcerpt, INDIVIDUAL_FORM_IDENTITY_MARKER),
    ).toEqual({ outcome: "applicable" });
    expect(
      checkFormIdentityMarker(
        realExcerpt,
        DISTRICT_PACKAGE_FORM_IDENTITY_MARKER,
      ),
    ).toEqual({
      outcome: "skip",
      reason: "wrong-document-type-adapter-inapplicable",
    });
  });

  it("district-entry check: matches on exact (normalized) address", () => {
    const packageResources: DocumentResource[] = [
      {
        resourceId: "r1",
        resourceLabel: "Some House",
        locationEvidence: { address: "  1801 spring garden st  " },
      },
    ];
    expect(
      checkDistrictPackageEntryMatch(
        { address: "1801 SPRING GARDEN ST" },
        packageResources,
      ),
    ).toEqual({ outcome: "match", matchedOn: "address" });
  });

  it("district-entry check: matches on exact source-native ID even if address text differs", () => {
    const packageResources: DocumentResource[] = [
      {
        resourceId: "r1",
        resourceLabel: "Some House",
        sourceNativeId: "MAP-REG-42",
        locationEvidence: { address: "DIFFERENT TEXT ENTIRELY" },
      },
    ];
    expect(
      checkDistrictPackageEntryMatch(
        { address: "1801 SPRING GARDEN ST", sourceNativeId: "MAP-REG-42" },
        packageResources,
      ),
    ).toEqual({ outcome: "match", matchedOn: "sourceNativeId" });
  });

  it("district-entry check: skips district-entry-not-found when no resource matches (never geographic/fuzzy fallback)", () => {
    const packageResources: DocumentResource[] = [
      {
        resourceId: "r1",
        resourceLabel: "Unrelated House",
        locationEvidence: { address: "999 UNRELATED ST" },
      },
    ];
    expect(
      checkDistrictPackageEntryMatch(
        { address: "1801 SPRING GARDEN ST" },
        packageResources,
      ),
    ).toEqual({ outcome: "skip", reason: "district-entry-not-found" });
  });

  it("package-dedup check: continues for a package not yet represented", () => {
    const accepted: AcceptedPackageRecord[] = [];
    expect(checkPackageAlreadyRepresented("pkg-a", accepted)).toEqual({
      outcome: "continue",
    });
  });

  it("package-dedup check: skips package-already-represented once a subject from that package was accepted", () => {
    const accepted: AcceptedPackageRecord[] = [
      {
        packageIdentity: "pkg-a",
        acceptedCandidateAddress: "1801 SPRING GARDEN ST",
      },
    ];
    expect(checkPackageAlreadyRepresented("pkg-a", accepted)).toEqual({
      outcome: "skip",
      reason: "package-already-represented",
      previouslyAcceptedCandidateAddress: "1801 SPRING GARDEN ST",
    });
  });
});

describe("stableSortByAddress", () => {
  it("sorts ascending by address string regardless of input order", () => {
    const items: InventoryRecord[] = [
      {
        address: "600 B ST",
        hasIndividualDesignation: true,
        hasDistrictDesignation: false,
        districtName: "",
        historicName: "",
        constructionDate: undefined,
        raw: "",
      },
      {
        address: "100 A ST",
        hasIndividualDesignation: true,
        hasDistrictDesignation: false,
        districtName: "",
        historicName: "",
        constructionDate: undefined,
        raw: "",
      },
      {
        address: "300 C ST",
        hasIndividualDesignation: true,
        hasDistrictDesignation: false,
        districtName: "",
        historicName: "",
        constructionDate: undefined,
        raw: "",
      },
    ];
    const sorted = stableSortByAddress(items);
    expect(sorted.map((r) => r.address)).toEqual([
      "100 A ST",
      "300 C ST",
      "600 B ST",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [{ address: "B" }, { address: "A" }];
    const copy = items.slice();
    stableSortByAddress(items);
    expect(items).toEqual(copy);
  });
});

describe("seededShuffleOrder", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("is deterministic for the same seed and input", () => {
    const first = seededShuffleOrder(items, PILOT_SEED);
    const second = seededShuffleOrder(items, PILOT_SEED);
    expect(first).toEqual(second);
  });

  it("produces a permutation (same elements, same length) rather than dropping/duplicating", () => {
    const shuffled = seededShuffleOrder(items, PILOT_SEED);
    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it("produces a different order for a different seed", () => {
    const withPilotSeed = seededShuffleOrder(items, PILOT_SEED);
    const withOtherSeed = seededShuffleOrder(
      items,
      "a-completely-different-seed",
    );
    expect(withPilotSeed).not.toEqual(withOtherSeed);
  });

  it("does not mutate the input array", () => {
    const copy = items.slice();
    seededShuffleOrder(items, PILOT_SEED);
    expect(items).toEqual(copy);
  });
});

describe("Step 5 — district calibration candidate-check log", () => {
  it("records every checked candidate in frozen seeded order, within the candidate-check cap", () => {
    expect(DISTRICT_CALIBRATION_CANDIDATE_LOG).toHaveLength(2);
    expect(DISTRICT_CALIBRATION_CANDIDATE_LOG.length).toBeLessThanOrEqual(
      CANDIDATE_CHECK_CAP,
    );
    expect(
      DISTRICT_CALIBRATION_CANDIDATE_LOG.map((e) => e.seededOrderPosition),
    ).toEqual([1, 2]);
  });

  it("records the first candidate (144 BREAD ST) as checked and correctly not accepted", () => {
    const entry = DISTRICT_CALIBRATION_CANDIDATE_LOG[0]!;
    expect(entry.candidateAddress).toBe("144 BREAD ST");
    expect(entry.gate3Outcome).toBe("applicable");
    expect(entry.gate4Outcome).toBe("skip");
    expect(entry.skipReason).toBe("district-entry-not-found");
    expect(entry.accepted).toBe(false);
  });

  it("records the second candidate (4004 SPRUCE ST) as the sole accepted calibration subject", () => {
    const entry = DISTRICT_CALIBRATION_CANDIDATE_LOG[1]!;
    expect(entry.candidateAddress).toBe("4004 SPRUCE ST");
    expect(entry.gate3Outcome).toBe("applicable");
    expect(entry.gate4Outcome).toBe("match");
    expect(entry.accepted).toBe(true);
    expect(
      DISTRICT_CALIBRATION_CANDIDATE_LOG.filter((e) => e.accepted),
    ).toHaveLength(1);
  });
});

describe("Step 5 — district calibration exclusion-list entry", () => {
  it("excludes the accepted district calibration subject (4004 SPRUCE ST) from the eventual final six-subject draw", () => {
    const entry = PILOT_EXCLUSIONS.find((e) => e.address === "4004 SPRUCE ST");
    expect(entry).toBeDefined();
    expect(entry?.reasonCode).toBe("district-calibration-subject");
  });
});
