import { describe, expect, it } from "vitest";
import type { CuratedEntry } from "../curatedLocalHistory";
import {
  extractGatedFromReportJson,
  extractProjectableEntry,
  type GatedEntriesLike,
  insertOrReplaceEntry,
  runPromotion,
  serializeCuratedEntryToTs,
  validateCuratedEntryFields,
} from "./promoteGeneratedSubjectCore";

const FIXTURE_ENTRY: CuratedEntry = {
  source: {
    title: "Fixture Source Title",
    url: "https://example.com/fixture",
    sourceType: "local public-history narrative source",
    usageNote: "Fixture usage note.",
    publicationDate: "2021-01-01T00:00:00Z",
  },
  evidence: {
    subjectId: "way/999999999",
    text: "Fixture evidence text.",
    claimScope: "Fixture claim scope.",
    verificationStatus: "approved",
    verificationConfidence: "high",
    curatedTrust: "medium",
    lastVerifiedDate: "2026-10-02",
    admissionMethod: "automated",
    hasStoryBearingClaim: true,
  },
};

const EXPECTED_ENTRY_TEXT =
  '"way/999999999": { source: { title: "Fixture Source Title", url: "https://example.com/fixture", sourceType: "local public-history narrative source", usageNote: "Fixture usage note.", publicationDate: "2021-01-01T00:00:00Z" }, evidence: { subjectId: "way/999999999", text: "Fixture evidence text.", claimScope: "Fixture claim scope.", verificationStatus: "approved", verificationConfidence: "high", curatedTrust: "medium", lastVerifiedDate: "2026-10-02", admissionMethod: "automated", hasStoryBearingClaim: true } },';

function gatedWith(subjectId: string, entry: CuratedEntry): GatedEntriesLike {
  return {
    entries: { [subjectId]: entry },
    worthinessBySubject: {
      [subjectId]: {
        projectableForDiscovery: true,
        worthinessReasons: ["fixture: contains a story-bearing claim type."],
      },
    },
  };
}

const FIXTURE_REGISTRY_SOURCE = `/** fixture registry file */
import type { CuratedEntry } from "./types-not-real";

export const CURATED_LOCAL_HISTORY: Record<string, CuratedEntry> = {};

export const GENERATED_LOCAL_HISTORY: Record<string, CuratedEntry> = {
  "way/111111111": {
    source: {
      title: "Existing Source \\"with quotes\\"",
      sourceType: "test",
      usageNote: "Existing usage note with a brace-like } character inside a string.",
    },
    evidence: {
      subjectId: "way/111111111",
      text: "Existing text.",
      claimScope: "Existing scope.",
      verificationStatus: "approved",
      verificationConfidence: "high",
      curatedTrust: "high",
      lastVerifiedDate: "2026-01-01",
      admissionMethod: "automated",
    },
  },
};
`;

describe("serializeCuratedEntryToTs", () => {
  it("produces the exact expected CuratedEntry shape for a fixture entry", () => {
    expect(serializeCuratedEntryToTs("way/999999999", FIXTURE_ENTRY)).toBe(
      EXPECTED_ENTRY_TEXT,
    );
  });

  it("is deterministic for the same artifact", () => {
    const a = serializeCuratedEntryToTs("way/999999999", FIXTURE_ENTRY);
    const b = serializeCuratedEntryToTs("way/999999999", FIXTURE_ENTRY);
    expect(a).toBe(b);
  });

  it("never emits explicitDiscoveryTier, even if present on the input entry", () => {
    const withTier: CuratedEntry = {
      ...FIXTURE_ENTRY,
      evidence: { ...FIXTURE_ENTRY.evidence, explicitDiscoveryTier: 1 },
    };
    const text = serializeCuratedEntryToTs("way/999999999", withTier);
    expect(text).not.toContain("explicitDiscoveryTier");
  });

  it("omits optional fields that are undefined rather than emitting them", () => {
    const minimal: CuratedEntry = {
      source: {
        title: "Minimal Source",
        sourceType: "test",
        usageNote: "Minimal usage note.",
      },
      evidence: {
        subjectId: "way/222222222",
        text: "Minimal text.",
        claimScope: "Minimal scope.",
        verificationStatus: "approved",
        verificationConfidence: "high",
        curatedTrust: "high",
        lastVerifiedDate: "2026-01-01",
      },
    };
    const text = serializeCuratedEntryToTs("way/222222222", minimal);
    expect(text).not.toContain("url:");
    expect(text).not.toContain("publicationDate:");
    expect(text).not.toContain("admissionMethod:");
    expect(text).not.toContain("hasStoryBearingClaim:");
    expect(text).not.toContain("wikipediaSupportingSpans:");
  });

  it("emits wikipediaSupportingSpans when present and non-empty", () => {
    const withSpans: CuratedEntry = {
      ...FIXTURE_ENTRY,
      evidence: {
        ...FIXTURE_ENTRY.evidence,
        wikipediaSupportingSpans: [
          "Exact Wikipedia sentence one.",
          "Exact Wikipedia sentence two.",
        ],
      },
    };
    const text = serializeCuratedEntryToTs("way/999999999", withSpans);
    expect(text).toContain(
      'wikipediaSupportingSpans: ["Exact Wikipedia sentence one.","Exact Wikipedia sentence two."]',
    );
  });

  it("omits wikipediaSupportingSpans when absent, and existing fixtures without it remain unaffected", () => {
    const text = serializeCuratedEntryToTs("way/999999999", FIXTURE_ENTRY);
    expect(text).not.toContain("wikipediaSupportingSpans:");
    expect(text).toBe(EXPECTED_ENTRY_TEXT);
  });

  it("omits wikipediaSupportingSpans when present but empty", () => {
    const emptySpans: CuratedEntry = {
      ...FIXTURE_ENTRY,
      evidence: { ...FIXTURE_ENTRY.evidence, wikipediaSupportingSpans: [] },
    };
    const text = serializeCuratedEntryToTs("way/999999999", emptySpans);
    expect(text).not.toContain("wikipediaSupportingSpans:");
  });
});

describe("extractProjectableEntry", () => {
  it("returns the entry when present in gated.entries", () => {
    const gated = gatedWith("way/999999999", FIXTURE_ENTRY);
    const result = extractProjectableEntry(gated, "way/999999999");
    expect(result).toEqual({ ok: true, entry: FIXTURE_ENTRY });
  });

  it("refuses with a worthiness-specific reason when rejected for worthiness", () => {
    const gated: GatedEntriesLike = {
      entries: {},
      worthinessBySubject: {
        "way/333333333": {
          projectableForDiscovery: false,
          worthinessReasons: ["Limited to identity/register metadata."],
        },
      },
    };
    const result = extractProjectableEntry(gated, "way/333333333");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(
        "did not pass the discovery-worthiness gate",
      );
      expect(result.reason).toContain("Limited to identity/register metadata.");
    }
  });

  it("refuses with a not-found reason when the subject never reached the gate", () => {
    const gated: GatedEntriesLike = { entries: {}, worthinessBySubject: {} };
    const result = extractProjectableEntry(gated, "way/404404404");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("no generated entry found");
    }
  });
});

describe("validateCuratedEntryFields", () => {
  it("returns no missing fields for a complete entry", () => {
    expect(validateCuratedEntryFields(FIXTURE_ENTRY, "way/999999999")).toEqual(
      [],
    );
  });

  it("flags each missing required field", () => {
    const broken: CuratedEntry = {
      source: { title: "", sourceType: "test", usageNote: "note" },
      evidence: {
        subjectId: "way/555555555",
        text: "",
        claimScope: "scope",
        verificationStatus: "approved",
        verificationConfidence: "high",
        curatedTrust: "high",
        lastVerifiedDate: "2026-01-01",
      },
    };
    const missing = validateCuratedEntryFields(broken, "way/555555555");
    expect(missing).toContain("source.title");
    expect(missing).toContain("evidence.text");
  });

  it("flags a subjectId mismatch", () => {
    const missing = validateCuratedEntryFields(FIXTURE_ENTRY, "way/000000000");
    expect(missing.some((m) => m.includes("subjectId mismatch"))).toBe(true);
  });

  it("flags a non-approved verificationStatus", () => {
    const pending: CuratedEntry = {
      ...FIXTURE_ENTRY,
      evidence: { ...FIXTURE_ENTRY.evidence, verificationStatus: "pending" },
    };
    const missing = validateCuratedEntryFields(pending, "way/999999999");
    expect(missing.some((m) => m.includes('must be "approved"'))).toBe(true);
  });
});

describe("insertOrReplaceEntry", () => {
  it("inserts a new entry while leaving the existing entry byte-for-byte unchanged", () => {
    const newEntryText = serializeCuratedEntryToTs(
      "way/999999999",
      FIXTURE_ENTRY,
    );
    const result = insertOrReplaceEntry(
      FIXTURE_REGISTRY_SOURCE,
      "way/999999999",
      newEntryText,
      { replace: false },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updatedSource).toContain(newEntryText);
      // The pre-existing entry's exact source text is untouched.
      expect(result.updatedSource).toContain(
        '"way/111111111": {\n    source: {\n      title: "Existing Source \\"with quotes\\"",',
      );
      expect(result.updatedSource).toContain(
        "a brace-like } character inside a string.",
      );
    }
  });

  it("refuses duplicate insertion when subjectId already exists and replace is false", () => {
    const duplicateText = serializeCuratedEntryToTs(
      "way/111111111",
      FIXTURE_ENTRY,
    );
    const result = insertOrReplaceEntry(
      FIXTURE_REGISTRY_SOURCE,
      "way/111111111",
      duplicateText,
      { replace: false },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("already exists");
      expect(result.reason).toContain("--replace");
    }
  });

  it("replaces only the target entry when replace is true, leaving other text unchanged", () => {
    const replacementText = serializeCuratedEntryToTs("way/111111111", {
      ...FIXTURE_ENTRY,
      evidence: { ...FIXTURE_ENTRY.evidence, subjectId: "way/111111111" },
    });
    const result = insertOrReplaceEntry(
      FIXTURE_REGISTRY_SOURCE,
      "way/111111111",
      replacementText,
      { replace: true },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updatedSource).not.toContain("Existing text.");
      expect(result.updatedSource).toContain("Fixture evidence text.");
      // Unrelated file content (imports, CURATED_LOCAL_HISTORY) untouched.
      expect(result.updatedSource).toContain(
        "export const CURATED_LOCAL_HISTORY: Record<string, CuratedEntry> = {};",
      );
      expect(result.updatedSource).toContain(
        'import type { CuratedEntry } from "./types-not-real";',
      );
    }
  });

  it("refuses when the registry source has no GENERATED_LOCAL_HISTORY object literal", () => {
    const result = insertOrReplaceEntry(
      "export const SOMETHING_ELSE = {};\n",
      "way/1",
      'way/1": {},',
      { replace: false },
    );
    expect(result.ok).toBe(false);
  });
});

describe("runPromotion", () => {
  it("dry-run outcome never requires or touches registrySourceText", () => {
    const gated = gatedWith("way/999999999", FIXTURE_ENTRY);
    const result = runPromotion({
      subjectId: "way/999999999",
      gated,
      write: false,
      replace: false,
    });
    expect(result.outcome).toBe("dry-run");
    if (result.outcome === "dry-run") {
      expect(result.entryText).toBe(EXPECTED_ENTRY_TEXT);
    }
  });

  it("write mode inserts exactly one new entry", () => {
    const gated = gatedWith("way/999999999", FIXTURE_ENTRY);
    const result = runPromotion({
      subjectId: "way/999999999",
      gated,
      write: true,
      replace: false,
      registrySourceText: FIXTURE_REGISTRY_SOURCE,
    });
    expect(result.outcome).toBe("written");
    if (result.outcome === "written") {
      expect(result.updatedSource).toContain('"way/999999999"');
      expect(result.updatedSource).toContain('"way/111111111"');
    }
  });

  it("refuses duplicate subjectId in write mode without --replace", () => {
    const entryForExisting: CuratedEntry = {
      ...FIXTURE_ENTRY,
      evidence: { ...FIXTURE_ENTRY.evidence, subjectId: "way/111111111" },
    };
    const gated = gatedWith("way/111111111", entryForExisting);
    const result = runPromotion({
      subjectId: "way/111111111",
      gated,
      write: true,
      replace: false,
      registrySourceText: FIXTURE_REGISTRY_SOURCE,
    });
    expect(result.outcome).toBe("refused");
    if (result.outcome === "refused") {
      expect(result.reason).toContain("already exists");
    }
  });

  it("--replace replaces only the target entry, leaving unrelated entries unchanged", () => {
    const entryForExisting: CuratedEntry = {
      ...FIXTURE_ENTRY,
      evidence: { ...FIXTURE_ENTRY.evidence, subjectId: "way/111111111" },
    };
    const gated = gatedWith("way/111111111", entryForExisting);
    const result = runPromotion({
      subjectId: "way/111111111",
      gated,
      write: true,
      replace: true,
      registrySourceText: FIXTURE_REGISTRY_SOURCE,
    });
    expect(result.outcome).toBe("written");
    if (result.outcome === "written") {
      expect(result.updatedSource).not.toContain("Existing text.");
      expect(result.updatedSource).toContain("Fixture evidence text.");
    }
  });

  it("refuses a missing/non-projectable subject", () => {
    const gated: GatedEntriesLike = { entries: {}, worthinessBySubject: {} };
    const result = runPromotion({
      subjectId: "way/404404404",
      gated,
      write: false,
      replace: false,
    });
    expect(result.outcome).toBe("refused");
    if (result.outcome === "refused") {
      expect(result.reason).toContain("no generated entry found");
    }
  });

  it("refuses when write is true but registrySourceText is not supplied", () => {
    const gated = gatedWith("way/999999999", FIXTURE_ENTRY);
    const result = runPromotion({
      subjectId: "way/999999999",
      gated,
      write: true,
      replace: false,
    });
    expect(result.outcome).toBe("refused");
  });

  it("is deterministic: identical inputs produce identical output", () => {
    const gated = gatedWith("way/999999999", FIXTURE_ENTRY);
    const first = runPromotion({
      subjectId: "way/999999999",
      gated,
      write: true,
      replace: false,
      registrySourceText: FIXTURE_REGISTRY_SOURCE,
    });
    const second = runPromotion({
      subjectId: "way/999999999",
      gated,
      write: true,
      replace: false,
      registrySourceText: FIXTURE_REGISTRY_SOURCE,
    });
    expect(first).toEqual(second);
  });
});

describe("extractGatedFromReportJson", () => {
  it("accepts a bare gated-shaped object", () => {
    const gated = gatedWith("way/999999999", FIXTURE_ENTRY);
    expect(extractGatedFromReportJson(gated)).toEqual(gated);
  });

  it("accepts a report object with a nested gated key", () => {
    const gated = gatedWith("way/999999999", FIXTURE_ENTRY);
    expect(extractGatedFromReportJson({ someOtherField: 1, gated })).toEqual(
      gated,
    );
  });

  it("returns undefined for an unrecognized shape", () => {
    expect(extractGatedFromReportJson({ foo: "bar" })).toBeUndefined();
    expect(extractGatedFromReportJson(null)).toBeUndefined();
    expect(extractGatedFromReportJson("not an object")).toBeUndefined();
  });
});
