/**
 * Step 4 (preregistration + candidate-frame enumeration) — pure, structural
 * parsing and stratification of the Philadelphia Register of Historic
 * Places inventory. Does NOT read nomination-document narrative content,
 * does NOT call the extractor/admission/worthiness pipeline, and does NOT
 * draw the final six-subject pilot sample. See
 * `PILOT_PREREGISTRATION.md` for the frozen design this module implements.
 *
 * TERMINOLOGY (corrected 2026-10-12 per RC review): the pools this module
 * produces are a CANDIDATE FRAME / CANDIDATE UNIVERSE, not a confirmed
 * adapter-eligible document frame. A candidate only becomes structurally
 * eligible once it is checked, in seeded order, under the frozen Gate
 * 1/2/3 (+ district-entry, + package-dedup) structural-check rules defined
 * below — none of which have been RUN against any real candidate in this
 * module. "individualCandidatePool" / "districtPackageCandidatePool" are
 * therefore pre-check candidate pools, not post-check eligible sets. The
 * district-package pool in particular represents CANDIDATES for
 * district-package resource entries, not confirmed district resource
 * entries — confirming a match requires the district-entry check (see
 * `checkDistrictPackageEntryMatch` below), which requires a real acquired
 * district-package document and is therefore never run here.
 *
 * SOURCE DOCUMENT: "Philadelphia Register of Historic Places (OPA-compliant
 * Addresses)" — Philadelphia Historical Commission, retrieved from
 * https://www.phila.gov/media/20260219103746/PRHP-without-units-2-19-2026.pdf
 * (phila.gov inventory page: https://www.phila.gov/documents/philadelphia-register-of-historic-places/),
 * "As of February 19, 2026". Converted to text via the already-frozen
 * `pdftotext -layout` tool (see `PDF_ACQUISITION_FREEZE.md`) — same tool,
 * same flag, applied here to a structural index document rather than a
 * nomination narrative. Retrieved and extracted 2026-10-11.
 *
 * WHY THIS SOURCE, AND THE BLOCKER IT LEAVES OPEN: no bulk, authoritative
 * Philadelphia source was found that links an individual register resource
 * to its nomination-document URL. Checked and ruled out: the CARTO SQL API
 * tables `historic_sites_philreg` / `historicdistricts_local` (no document
 * field, no resource name field on the sites table); the ArcGIS Online web
 * map "Philadelphia Register of Historic Places, Properties and Historic
 * Districts" (item `c9ce32a9d61242429ac0b4530a8846e6`) and the
 * phila.gov-linked Experience Builder app (item
 * `7e77e2ece09c4bbbb3a7c7954a3071ce`) — both resolve to the same two
 * FeatureServer layers as the CARTO tables, confirmed by inspecting each
 * layer's field list directly; no document-link field exists on either.
 * The Philadelphia Historical Commission's own page states nomination
 * documents must be requested directly (preservation@phila.gov), not that
 * they are bulk-published with a queryable index. CONCLUSION: this
 * inventory PDF is the best available *structural* index (it exposes
 * designation dates, district membership, historic name, and construction
 * date — enough to define the frame and its two strata) but it cannot
 * answer "is this resource's document born-digital / a PHC individual
 * nomination form / district-package narrative / a scan?" in bulk.
 * Format/adapter-applicability eligibility is therefore NOT computed here
 * as a bulk statistic — it is deferred to a per-candidate, logged,
 * structural check at acquisition time (see `PILOT_PREREGISTRATION.md`
 * section "Skip/redraw rules" and "Scan handling"), which is explicitly
 * what this step's own instructions allow for exactly this situation.
 */
import type { DocumentResource } from "./documentEvidencePacket";

export interface InventoryRecord {
  /** Street address exactly as printed in the inventory (not normalized). */
  address: string;
  /** True if an individual (Desig Date1/Desig Date2) designation date is present. */
  hasIndividualDesignation: boolean;
  /** True if a district (District Date1/District Date2) designation date is present. */
  hasDistrictDesignation: boolean;
  /** Best-effort district name (first district column only, if present). */
  districtName: string;
  /** Best-effort historic name, if present. */
  historicName: string;
  /** Best-effort construction-date year, if present. */
  constructionDate: string | undefined;
  /** Raw, untouched source line — kept for audit/debugging. */
  raw: string;
}

export interface ParseAnomaly {
  raw: string;
  reason: "no-address-match" | "no-date-token";
}

export interface ParseResult {
  records: InventoryRecord[];
  anomalies: ParseAnomaly[];
  /** Number of page segments found with no recognizable header row (filtered out, not an error — the trailing empty segment after the file's final form-feed is expected). */
  pagesWithoutHeader: number;
  /** Total page segments actually parsed (had a recognizable header row). */
  pagesParsed: number;
}

const DATE_TOKEN_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const TRAILING_YEAR_RE = /(?:^|\s)(\d{4})\s*$/;
const ADDRESS_PREFIX_RE = /^(\S.*?)\s{2,}/;
const HEADER_LINE_RE = /^Address\s+Desig Date1/;
const FOOTER_LINE_RE = /Page \d+ of \d+/;

/**
 * Parses the raw `pdftotext -layout` text of the PRHP inventory into
 * structured records. Pure function — no filesystem access, no network.
 *
 * Page boundaries are detected via the PDF form-feed character (`\f`),
 * which `pdftotext` inserts between pages. Each page re-prints its own
 * column header; this function re-derives column boundaries fresh per page
 * (observed to vary slightly page to page) rather than assuming a single
 * global layout. Only the `District1` header offset is actually load-bearing
 * for classification (used to split date tokens into "individual-zone" vs
 * "district-zone"); the Address field is extracted independently via a
 * leading-run-of-non-whitespace-then-2+-space-gap rule, which is robust to
 * the column-width drift observed in minor free-text columns.
 */
export function parseInventoryText(rawText: string): ParseResult {
  const pageSegments = rawText.split("\f").filter((p) => p.trim() !== "");
  const records: InventoryRecord[] = [];
  const anomalies: ParseAnomaly[] = [];
  let pagesWithoutHeader = 0;
  let pagesParsed = 0;

  for (const page of pageSegments) {
    const lines = page.split("\n");
    const headerIdx = lines.findIndex((l) => HEADER_LINE_RE.test(l));
    if (headerIdx === -1) {
      pagesWithoutHeader++;
      continue;
    }
    pagesParsed++;
    const district1Offset = lines[headerIdx].indexOf("District1");

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const raw = lines[i];
      if (/^\s*$/.test(raw)) continue;
      if (FOOTER_LINE_RE.test(raw)) continue;

      const addressMatch = raw.match(ADDRESS_PREFIX_RE);
      if (!addressMatch) {
        anomalies.push({ raw, reason: "no-address-match" });
        continue;
      }
      const address = addressMatch[1].trim();
      const afterAddress = addressMatch[0].length;

      const dateTokens: { start: number; end: number }[] = [];
      const re = new RegExp(DATE_TOKEN_RE);
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        dateTokens.push({ start: m.index, end: m.index + m[0].length });
      }
      if (dateTokens.length === 0) {
        anomalies.push({ raw, reason: "no-date-token" });
        continue;
      }

      const individualTokens = dateTokens.filter(
        (t) => t.start < district1Offset,
      );
      const districtTokens = dateTokens.filter(
        (t) => t.start >= district1Offset,
      );
      const lastToken = dateTokens[dateTokens.length - 1];
      const tail = raw.slice(lastToken.end);
      const trailingMatch = tail.match(TRAILING_YEAR_RE);
      const constructionDate = trailingMatch ? trailingMatch[1] : undefined;
      const historicName = (
        trailingMatch ? tail.slice(0, trailingMatch.index) : tail
      ).trim();

      let districtName = "";
      if (districtTokens.length > 0) {
        const startBound = individualTokens.length
          ? individualTokens[individualTokens.length - 1].end
          : afterAddress;
        districtName = raw.slice(startBound, districtTokens[0].start).trim();
      }

      records.push({
        address,
        hasIndividualDesignation: individualTokens.length > 0,
        hasDistrictDesignation: districtTokens.length > 0,
        districtName,
        historicName,
        constructionDate,
        raw,
      });
    }
  }

  return { records, anomalies, pagesWithoutHeader, pagesParsed };
}

export type Stratum = "individual" | "district-package";

/**
 * Frozen structural stratum rule (see `PILOT_PREREGISTRATION.md` section
 * "Strata"): a resource with its own individual designation date is
 * classified "individual" regardless of whether it is *also* swept into a
 * later-designated district (the "both" case — this resource still has its
 * own individual nomination document, which is the adapter-relevant one).
 * A resource is "district-package" if and only if it has a district
 * designation date and no individual designation date — for these, no
 * separate individual nomination document exists; the only possible source
 * document is the shared district nomination package. Membership in this
 * stratum makes a record a CANDIDATE for a district-package resource
 * entry — it does not confirm the district package actually contains a
 * matching source-native entry (see `checkDistrictPackageEntryMatch`).
 */
export function classifyStratum(record: InventoryRecord): Stratum {
  return record.hasIndividualDesignation ? "individual" : "district-package";
}

export interface ExclusionEntry {
  address: string;
}

export interface CandidateFrameResult {
  totalRecordsInspected: number;
  anomalyCount: number;
  anomalies: ParseAnomaly[];
  pagesParsed: number;
  pagesWithoutHeader: number;
  individualCandidatePoolSizePreExclusion: number;
  districtPackageCandidatePoolSizePreExclusion: number;
  bothDesignationCount: number;
  /** Candidates for individual-stratum structural checks — not yet checked. */
  individualCandidatePool: InventoryRecord[];
  /** Candidates for district-package resource-entry structural checks — not
   * yet checked; does NOT confirm any of these actually has a matching
   * entry in a real district-package document (see
   * `checkDistrictPackageEntryMatch`). */
  districtPackageCandidatePool: InventoryRecord[];
  excludedRecords: InventoryRecord[];
}

/**
 * Builds the candidate frame: parses the raw inventory text, classifies
 * every record into a stratum, and removes any record matching the
 * (address-keyed) exclusion list. Does not draw a sample, does not run any
 * structural check (Gate 1/2/3, district-entry, package-dedup — see
 * below), and does not inspect document format — see module doc comment.
 * The two pools this returns are CANDIDATE pools, not confirmed-eligible
 * sets.
 */
export function buildCandidateFrame(
  rawText: string,
  exclusions: ExclusionEntry[],
): CandidateFrameResult {
  const parsed = parseInventoryText(rawText);
  const excludedAddresses = new Set(exclusions.map((e) => e.address));

  const individualCandidatePool: InventoryRecord[] = [];
  const districtPackageCandidatePool: InventoryRecord[] = [];
  const excludedRecords: InventoryRecord[] = [];
  let bothDesignationCount = 0;

  for (const record of parsed.records) {
    if (record.hasIndividualDesignation && record.hasDistrictDesignation) {
      bothDesignationCount++;
    }
    if (excludedAddresses.has(record.address)) {
      excludedRecords.push(record);
      continue;
    }
    if (classifyStratum(record) === "individual") {
      individualCandidatePool.push(record);
    } else {
      districtPackageCandidatePool.push(record);
    }
  }

  return {
    totalRecordsInspected: parsed.records.length,
    anomalyCount: parsed.anomalies.length,
    anomalies: parsed.anomalies,
    pagesParsed: parsed.pagesParsed,
    pagesWithoutHeader: parsed.pagesWithoutHeader,
    individualCandidatePoolSizePreExclusion:
      individualCandidatePool.length +
      excludedRecords.filter((r) => classifyStratum(r) === "individual").length,
    districtPackageCandidatePoolSizePreExclusion:
      districtPackageCandidatePool.length +
      excludedRecords.filter((r) => classifyStratum(r) === "district-package")
        .length,
    bothDesignationCount,
    individualCandidatePool,
    districtPackageCandidatePool,
    excludedRecords,
  };
}

/**
 * Frozen pilot seed (see `PILOT_PREREGISTRATION.md` section "Seeded draw
 * design"): the Step 3/3A checkpoint commit SHA. Not used to draw the final
 * six in this task — draw execution is explicitly out of scope here.
 */
export const PILOT_SEED = "18bba6ebc1042323109b7dc312f6066497702753";

/**
 * Deterministic 32-bit string hash (FNV-1a) used only to turn the frozen
 * seed string into a numeric seed for `mulberry32`. Not cryptographic —
 * does not need to be; it only needs to be stable and well-distributed.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Standard mulberry32 PRNG — deterministic, dependency-free, seeded by a 32-bit int. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic seeded Fisher-Yates shuffle. Given the same `seed` and the
 * same input *values* (compared via the stable input ordering the caller
 * establishes before calling this — see below), always returns the same
 * permutation. Does not mutate the input array.
 *
 * Frozen stable input ordering (see `PILOT_PREREGISTRATION.md`): callers
 * must sort candidates by `address` (plain string ascending comparison)
 * before calling this function, so that the draw does not depend on
 * incidental PDF/text-extraction row order.
 */
export function seededShuffleOrder<T>(items: readonly T[], seed: string): T[] {
  const rng = mulberry32(fnv1a(seed));
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Stable input ordering for the draw: ascending plain-string address
 * comparison. Exposed as its own function so the draw's ordering step is
 * independently testable from the shuffle step.
 */
export function stableSortByAddress<T extends { address: string }>(
  items: readonly T[],
): T[] {
  return items
    .slice()
    .sort((a, b) =>
      a.address < b.address ? -1 : a.address > b.address ? 1 : 0,
    );
}

// ---------------------------------------------------------------------------
// Structural-check gates (frozen design, NOT run against any real candidate
// in this module — see `PILOT_PREREGISTRATION.md` section "Structural-check
// order" for the full specification these functions implement). A candidate
// becomes structurally eligible only when it passes every gate applicable to
// its stratum, walked in the seeded order from `seededShuffleOrder`.
// ---------------------------------------------------------------------------

/**
 * Every valid, mechanically-determined structural skip reason. No other
 * string may ever be used as a skip reason — in particular, never a
 * narrative/editorial reason (scanned PDF, weak story, sparse claims,
 * unknown authorship, grounding difficulty, poor extraction yield, boring
 * result) and never "headings parsed successfully" / "adapter produced
 * usable blocks" / "claim extraction worked" as a stand-in for format
 * applicability (difficult parsing is not the same thing as wrong document
 * format).
 */
export type StructuralSkipReason =
  | "on-exclusion-list"
  | "unfetchable-missing-file"
  | "wrong-document-type-adapter-inapplicable"
  | "duplicate-representation"
  | "district-entry-not-found"
  | "package-already-represented";

/** Gate 1 — file retrieval. */
export type Gate1Result =
  | { outcome: "continue" }
  | { outcome: "skip"; reason: "unfetchable-missing-file" };

/**
 * Gate 1: if the qualifying source document cannot be fetched at all, the
 * candidate is structurally skipped. `fetched` is the caller's own
 * mechanical fetch-attempt result (e.g. an HTTP 200 vs. a network/404
 * failure) — this function makes no fetch attempt itself.
 */
export function checkFileRetrievalGate(fetched: boolean): Gate1Result {
  return fetched
    ? { outcome: "continue" }
    : { outcome: "skip", reason: "unfetchable-missing-file" };
}

/** Gate 2 — text-layer presence. Not a skip condition either way. */
export type TextLayerClassification = "has-text-layer" | "scan-only";

/**
 * Gate 2: mechanically classifies whether the extracted text contains a
 * usable text layer at all — a pure-image (scanned) PDF produces
 * effectively empty `pdftotext -layout` output, so the mechanical test is
 * "any non-whitespace character present at all" (structural, not semantic;
 * never an OCR attempt). A `"scan-only"` result does NOT skip the
 * candidate — it remains eligible for sample selection; if selected into
 * the final six it stops at acquisition and counts as an acquisition loss
 * (see `PILOT_PREREGISTRATION.md` section "Scan handling"). Scan-only
 * status must never be converted into an adapter-format skip.
 */
export function classifyTextLayer(
  extractedText: string,
): TextLayerClassification {
  return extractedText.replace(/\s/g, "").length === 0
    ? "scan-only"
    : "has-text-layer";
}

/**
 * Gate 3 — adapter-form applicability. A frozen, mechanical, source-native
 * form-identity marker, confirmed by direct inspection of a real document
 * of that family (never a guess). `confirmed: false` means the marker has
 * NOT yet been observed in any real document of that family and must not
 * be used as a pass/fail test until it is confirmed against a real
 * acquired document and the confirmation is logged.
 *
 * Two structural-cue types are supported (extended Step 5 — district
 * calibration — to accommodate a real, generic finding, not a
 * one-document special case: the real-world "district-package nomination"
 * family turned out to have more than one genuinely distinct structural
 * dialect, each independently confirmed against its own real acquired
 * document. See `DISTRICT_PACKAGE_FORM_IDENTITY_MARKER` below):
 * - "exact-line-match": one exact verbatim line this form family is known
 *   to contain (unchanged from Step 4 — used by
 *   `INDIVIDUAL_FORM_IDENTITY_MARKER`, which has exactly one confirmed
 *   dialect).
 * - "repeating-pattern-match": a regex this form family is known to match
 *   REPEATEDLY (at least `minOccurrences` times) among the document's
 *   trimmed lines — for a form family whose structural signature is a
 *   repeating element (e.g. a per-entry heading or per-page field label)
 *   rather than one single fixed line. `minOccurrences` must be set well
 *   below the real confirmed occurrence count observed for that dialect
 *   (never set to exactly the observed count), so the check still reads
 *   as "this structural pattern repeats," not "this exact real document."
 */
export type FormIdentityMarker =
  | {
      formFamily:
        | "philadelphia-individual-resource-nomination"
        | "philadelphia-district-package-nomination";
      structuralCueType: "exact-line-match";
      verbatimMarkerText: string;
      confirmed: boolean;
      /** Which real structural variant of `formFamily` this marker was confirmed against, when the family has more than one. */
      dialectLabel?: string;
    }
  | {
      formFamily:
        | "philadelphia-individual-resource-nomination"
        | "philadelphia-district-package-nomination";
      structuralCueType: "repeating-pattern-match";
      pattern: RegExp;
      minOccurrences: number;
      patternDescription: string;
      confirmed: boolean;
      dialectLabel?: string;
    };

/**
 * Frozen individual-stratum form-identity marker. CONFIRMED: this exact
 * line is present verbatim in the real 2301 Fairmount Avenue extraction
 * (see `philadelphiaFormNominationAdapter.test.ts`'s
 * `REAL_FORM_PAGE_EXCERPT` fixture, taken from the real document) — it is
 * the PHC individual-nomination-form's own field-1 label, unique to this
 * form family.
 */
export const INDIVIDUAL_FORM_IDENTITY_MARKER: FormIdentityMarker = {
  formFamily: "philadelphia-individual-resource-nomination",
  structuralCueType: "exact-line-match",
  verbatimMarkerText:
    "1. ADDRESS OF HISTORIC RESOURCE (must comply with an Office of Property Assessment address)",
  confirmed: true,
};

/**
 * District-package form-identity markers — FROZEN Step 5 (district
 * calibration). Two genuinely distinct real structural dialects were
 * observed while walking the frozen seeded candidate order, each
 * independently confirmed against its own real acquired document (see the
 * Step 5 candidate-check log for exact counts):
 *
 * - "narrative-block-inventory" dialect (candidate #1, Old City nomination,
 *   https://www.phila.gov/media/20241023081326/Historic-District-Old-City.pdf):
 *   a repeating section-heading pattern "<STREET NAME> – <NUMBER|Unit>
 *   Block" — confirmed 108 occurrences in the real extraction, zero
 *   false-positive matches against the Southeast Spruce Hill extraction.
 *   This candidate was structurally applicable (Gate 3 "applicable") but
 *   was skipped downstream at the district-entry gate
 *   ("district-entry-not-found": the document spells street-type suffixes
 *   in full, e.g. "BREAD STREET", while the PRHP register abbreviates
 *   them, e.g. "BREAD ST" — a genuine, non-workaroundable mismatch under
 *   the frozen no-fuzzy-matching rule).
 * - "per-parcel-field-survey" dialect (candidate #2, Southeast Spruce Hill
 *   nomination,
 *   https://www.phila.gov/media/20241023081326/Historic-District-Southeast-Spruce-Hill.pdf):
 *   a repeating per-page field-label line "Address            <ADDRESS>"
 *   — confirmed 574 occurrences in the real extraction (exactly matching
 *   574 "Registry Number" per-parcel fields), zero false-positive matches
 *   against the Old City extraction. This is the Step 5 accepted district
 *   calibration subject.
 *
 * A candidate is Gate-3-applicable if EITHER confirmed dialect marker
 * matches (see `checkFormIdentityMarker`'s any-of-markers behavior) — this
 * reflects that the "district-package nomination" family itself genuinely
 * has multiple real structural dialects, not that any one specific
 * document gets special-cased.
 */
export const OLD_CITY_NARRATIVE_BLOCK_INVENTORY_DISTRICT_MARKER: FormIdentityMarker =
  {
    formFamily: "philadelphia-district-package-nomination",
    structuralCueType: "repeating-pattern-match",
    pattern: /^[A-Z0-9.'\u2019\s]+[-\u2013]\s*(?:\d+|Unit)\s+Block$/,
    minOccurrences: 10,
    patternDescription:
      'Street-name + dash + block-number/Unit + "Block" repeating section heading.',
    confirmed: true,
    dialectLabel: "narrative-block-inventory",
  };

export const SPRUCE_HILL_PER_PARCEL_FIELD_SURVEY_DISTRICT_MARKER: FormIdentityMarker =
  {
    formFamily: "philadelphia-district-package-nomination",
    structuralCueType: "repeating-pattern-match",
    pattern: /^Address\s{2,}\S/,
    minOccurrences: 10,
    patternDescription:
      'Per-parcel "Address" field-label line beginning each resource-entry page.',
    confirmed: true,
    dialectLabel: "per-parcel-field-survey",
  };

export const DISTRICT_PACKAGE_FORM_IDENTITY_MARKER: readonly FormIdentityMarker[] =
  [
    OLD_CITY_NARRATIVE_BLOCK_INVENTORY_DISTRICT_MARKER,
    SPRUCE_HILL_PER_PARCEL_FIELD_SURVEY_DISTRICT_MARKER,
  ];

export type Gate3Result =
  | { outcome: "applicable"; matchedDialectLabel?: string }
  | { outcome: "skip"; reason: "wrong-document-type-adapter-inapplicable" };

/**
 * Gate 3: runs only for documents with machine-readable text (i.e. only
 * after Gate 2 classifies `"has-text-layer"`). Accepts either a single
 * frozen marker or an array of alternative frozen markers for the same
 * form family (any-of match — applicable iff at least one marker's own
 * structural cue matches), reflecting that a form family may have more
 * than one confirmed real structural dialect. Never a "did parsing work"
 * proxy.
 */
export function checkFormIdentityMarker(
  extractedText: string,
  marker: FormIdentityMarker | readonly FormIdentityMarker[],
): Gate3Result {
  const markers = Array.isArray(marker) ? marker : [marker];
  const lines = extractedText.split("\n").map((l) => l.trim());

  for (const m of markers) {
    if (m.structuralCueType === "exact-line-match") {
      if (lines.includes(m.verbatimMarkerText.trim())) {
        return { outcome: "applicable", matchedDialectLabel: m.dialectLabel };
      }
    } else {
      const occurrences = lines.filter((l) => m.pattern.test(l)).length;
      if (occurrences >= m.minOccurrences) {
        return { outcome: "applicable", matchedDialectLabel: m.dialectLabel };
      }
    }
  }
  return {
    outcome: "skip",
    reason: "wrong-document-type-adapter-inapplicable",
  };
}

/**
 * District-package entry-check candidate shape — intentionally mirrors
 * exactly the fields a real candidate record supplies (address, and an
 * optional source-native ID if one becomes available), so this check can
 * be driven directly by an `InventoryRecord`-derived value without a
 * separate ad hoc shape.
 */
export interface DistrictEntryCandidate {
  address: string;
  sourceNativeId?: string;
}

/**
 * Normalizes an address for exact-match comparison ONLY (trim, uppercase,
 * collapse internal whitespace) — this is string normalization to account
 * for two different source documents' own formatting conventions, never
 * fuzzy/partial/token-overlap matching. Two addresses must still be
 * identical after normalization to count as a match.
 */
function normalizeAddressForExactMatch(address: string): string {
  return address.trim().toUpperCase().replace(/\s+/g, " ");
}

export type DistrictEntryCheckResult =
  | { outcome: "match"; matchedOn: "address" | "sourceNativeId" }
  | { outcome: "skip"; reason: "district-entry-not-found" };

/**
 * District-package entry check (section 3 — "Exact entry check"): confirms
 * the district package's own parsed `DocumentResource[]` (the SAME
 * `DocumentResource` shape the eventual multi-resource adapter produces —
 * see `documentEvidencePacket.ts` — not a separate human eligibility test)
 * contains a source-native entry whose address or source-native ID exactly
 * matches the candidate. Geographic containment, human narrative judgment,
 * and fuzzy story/content matching are never used.
 */
export function checkDistrictPackageEntryMatch(
  candidate: DistrictEntryCandidate,
  packageResources: readonly DocumentResource[],
): DistrictEntryCheckResult {
  const normalizedCandidateAddress = normalizeAddressForExactMatch(
    candidate.address,
  );
  for (const resource of packageResources) {
    if (
      candidate.sourceNativeId !== undefined &&
      resource.sourceNativeId !== undefined &&
      resource.sourceNativeId === candidate.sourceNativeId
    ) {
      return { outcome: "match", matchedOn: "sourceNativeId" };
    }
    const resourceAddress = resource.locationEvidence?.address;
    if (
      resourceAddress !== undefined &&
      normalizeAddressForExactMatch(resourceAddress) ===
        normalizedCandidateAddress
    ) {
      return { outcome: "match", matchedOn: "address" };
    }
  }
  return { outcome: "skip", reason: "district-entry-not-found" };
}

/**
 * One subject per district package (section 4): once one subject from a
 * district package has been accepted, any later candidate from that same
 * package is skipped — the evidence unit is the package, and two subjects
 * from one document would not be independent sample units.
 */
export interface AcceptedPackageRecord {
  /** Stable package identity — e.g. the district package's `documentId`/`documentUrl`. */
  packageIdentity: string;
  acceptedCandidateAddress: string;
}

export type PackageDedupCheckResult =
  | { outcome: "continue" }
  | {
      outcome: "skip";
      reason: "package-already-represented";
      previouslyAcceptedCandidateAddress: string;
    };

export function checkPackageAlreadyRepresented(
  packageIdentity: string,
  acceptedPackages: readonly AcceptedPackageRecord[],
): PackageDedupCheckResult {
  const existing = acceptedPackages.find(
    (p) => p.packageIdentity === packageIdentity,
  );
  return existing
    ? {
        outcome: "skip",
        reason: "package-already-represented",
        previouslyAcceptedCandidateAddress: existing.acceptedCandidateAddress,
      }
    : { outcome: "continue" };
}

/**
 * Candidate cap semantics (section 7): the fixed cap counts candidates
 * CHECKED (every candidate that undergoes a Gate 1/2/3 structural check,
 * regardless of outcome, consumes one slot), never subjects accepted or
 * documents successfully parsed. Frozen value — see
 * `PILOT_PREREGISTRATION.md` section "Candidate cap". Not consumed by this
 * module itself (no real check is run here); exported so the next task's
 * check-runner script imports the single frozen source of truth rather
 * than re-declaring the number.
 */
export const CANDIDATE_CHECK_CAP = 10;
