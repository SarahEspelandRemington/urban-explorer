/**
 * Automated LPC record -> Streetlit claim extraction. Offline/non-production,
 * experimental — see ../README.md.
 *
 * Unlike PAB (pabInterpreter.ts + pabClaimExtractor.ts), there is no separate
 * "interpreter" stage here. PAB needed one because its ingestion mechanism is
 * HTML: raw markup had to be turned into plain text and scanned with regexes
 * to DETECT whether specific evidence signals (a citation, a named
 * collection, a dated architect record...) were even present at all. LPC's
 * ingestion mechanism is a structured Socrata API: every field arrives
 * already typed and named. Classification and claim extraction collapse
 * into one direct step here — this is a genuine, source-mechanism-driven
 * simplification, not a shortcut: the "detect signals in raw text" stage
 * simply has nothing to do when the source itself hands you clean fields.
 *
 * Every field used here comes from the dataset's own official data
 * dictionary (LPC_Historic_Buildings_Data_Dictionary.xlsx). Per the task
 * brief: use the LPC fields that actually exist, do not manufacture
 * narrative claims from metadata. Architectural style/material fields
 * (Style_*, Mat_*) are deliberately NOT turned into claims — bare style/
 * material metadata without a dated identity/architect/use context is
 * exactly the kind of generic-metadata Streetlit should avoid surfacing on
 * its own, and PAB's own extractor does not manufacture a "style" claim
 * type either (no such ClaimType exists in the shared taxonomy).
 *
 * Fields the dataset does NOT contain, contrary to what "an LPC dataset"
 * might suggest: there is no per-building or per-record LP designation
 * number, and no explicit designation-DATE field. Individual designation
 * numbers/dates live at the historic-district/individual-landmark action
 * level, in a separate LPC dataset this task did not wire up. This
 * per-building table's own "identity" signal is limited to
 * LM_Orig/LM_New/Build_Nme/Hist_Dist name strings plus the address — there
 * is no discrete, dated "register-status" event to extract the way PAB's
 * Historic Registrations and Surveys date entry provides one.
 */
import type { Claim, Source } from "../types";
import type { LpcRetrievalRecord } from "./lpcAdapter";

const NOT_DETERMINED_RE = /^not determined$/i;

/**
 * LPC's own data dictionary documents "Not determined" as the no-value
 * sentinel for several fields. Live data (confirmed against the real
 * Socrata rows, not the dictionary alone) shows a SECOND, undocumented
 * no-value sentinel in wide use across narrative fields: the literal string
 * "0" (e.g. Alt_Date_1, Alt_Arch_1/2, LM_Orig/LM_New, Notes, Build_Nme,
 * Use_Other all use "0" when the designation report has nothing to say).
 * Both must be filtered — treating "0" as real content would manufacture
 * garbage claim text (e.g. "alteration dated 0", AKA "0").
 */
function isRealValue(v: string | undefined): v is string {
  if (!v) return false;
  const trimmed = v.trim();
  return (
    trimmed.length > 0 && trimmed !== "0" && !NOT_DETERMINED_RE.test(trimmed)
  );
}

function fieldStr(
  raw: Record<string, unknown>,
  field: string | undefined,
): string | undefined {
  if (!field) return undefined;
  const v = raw[field];
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return isRealValue(s) ? s : undefined;
}

/**
 * Date_Combo is LPC's own structured construction/building-date field
 * (paired 1:1 with Arch_Build in the designation-report schema — this
 * dataset has no separate designation-date field, see the file header).
 * Live values observed are "YYYY - YYYY" ranges (e.g. "1924 - 1926") or a
 * single year; this extracts every 4-digit year present and treats the
 * first as the range start and the last (if more than one) as the end.
 * `precise: true` reflects that this is LPC's own structured field, not
 * narrative "circa" prose.
 */
function parseDateCombo(dateCombo: string): Claim["dateRange"] | undefined {
  const years = dateCombo.match(/\b(1[5-9]\d{2}|20\d{2})\b/g);
  if (!years || years.length === 0) return undefined;
  return {
    start: `${years[0]}-01-01`,
    end: years.length > 1 ? `${years[years.length - 1]}-01-01` : undefined,
    precise: true,
  };
}

export type LpcRecordClassification =
  | "claim-bearing"
  | "lead-only"
  | "no-usable-evidence";

export interface LpcSignals {
  archBuild?: string;
  ownDevel?: string;
  altDate1?: string;
  altArch1?: string;
  altDate2?: string;
  altArch2?: string;
  useOrig?: string;
  useOther?: string;
  buildType?: string;
  lmOrig?: string;
  lmNew?: string;
  histDist?: string;
  dateCombo?: string;
  circa?: boolean;
  notes?: string;
}

export interface LpcInterpretedRecord {
  lpcRowId: string;
  classification: LpcRecordClassification;
  signals: LpcSignals;
  identityLabel: string;
}

const MIN_NOTES_LENGTH = 30;

function detectSignals(
  fields: LpcAdapterFieldMapLike,
  raw: Record<string, unknown>,
): LpcSignals {
  return {
    archBuild: fieldStr(raw, fields.archBuild),
    ownDevel: fieldStr(raw, fields.ownDevel),
    altDate1: fieldStr(raw, fields.altDate1),
    altArch1: fieldStr(raw, fields.altArch1),
    altDate2: fieldStr(raw, fields.altDate2),
    altArch2: fieldStr(raw, fields.altArch2),
    useOrig: fieldStr(raw, fields.useOrig),
    useOther: fieldStr(raw, fields.useOther),
    buildType: fieldStr(raw, fields.buildType),
    lmOrig: fieldStr(raw, fields.lmOrig),
    lmNew: fieldStr(raw, fields.lmNew),
    histDist: fieldStr(raw, fields.histDist),
    dateCombo: fieldStr(raw, fields.dateCombo),
    circa: fieldStr(raw, fields.circa) === "1",
    notes: fieldStr(raw, fields.notes),
  };
}

function classify(signals: LpcSignals): LpcRecordClassification {
  const hasClaimSignal = !!(
    signals.archBuild ||
    signals.ownDevel ||
    signals.altDate1 ||
    (signals.useOther && signals.useOther !== signals.useOrig) ||
    (signals.lmNew && signals.lmNew !== signals.lmOrig) ||
    (signals.notes && signals.notes.length >= MIN_NOTES_LENGTH)
  );
  if (hasClaimSignal) return "claim-bearing";
  const hasLeadContent = !!(
    signals.buildType ||
    signals.useOrig ||
    signals.lmOrig ||
    signals.histDist ||
    signals.dateCombo
  );
  return hasLeadContent ? "lead-only" : "no-usable-evidence";
}

/** Subset of LpcFieldMap["fields"] this module needs — kept as a narrow structural type so this file doesn't need to import the full adapter field-alias machinery. */
export interface LpcAdapterFieldMapLike {
  archBuild?: string;
  ownDevel?: string;
  altDate1?: string;
  altArch1?: string;
  altDate2?: string;
  altArch2?: string;
  useOrig?: string;
  useOther?: string;
  buildType?: string;
  lmOrig?: string;
  lmNew?: string;
  histDist?: string;
  dateCombo?: string;
  circa?: string;
  notes?: string;
}

export function interpretLpcRecord(
  record: LpcRetrievalRecord,
  fields: LpcAdapterFieldMapLike,
): LpcInterpretedRecord {
  const signals = detectSignals(fields, record.raw);
  const classification = classify(signals);
  const identityLabel =
    signals.lmOrig ??
    record.buildName ??
    record.address ??
    `LPC row ${record.lpcRowId}`;
  return { lpcRowId: record.lpcRowId, classification, signals, identityLabel };
}

/** One dynamically-generated Source per claim-bearing LPC record, with capabilities derived from which fields actually carried real (non-"Not determined") values. */
export function buildLpcSource(
  record: LpcRetrievalRecord,
  interpreted: LpcInterpretedRecord,
): Source {
  const { signals } = interpreted;
  const capabilities: Source["capabilities"] = [
    {
      claimType: "identity",
      strength: "high",
      notes:
        "LPC's own designation-report-derived building record; LPC is the designating government authority itself, not a secondary compiler.",
    },
  ];
  if (signals.archBuild || signals.altArch1 || signals.altArch2) {
    capabilities.push({
      claimType: "architect",
      strength: "high",
      notes:
        "Architect/builder transcribed directly from the designation report.",
    });
  }
  if (signals.dateCombo) {
    capabilities.push({
      claimType: "construction-date",
      strength: "high",
      notes:
        "Construction/building date (Date_Combo) transcribed directly from the designation report.",
    });
  }
  if (signals.altDate1) {
    capabilities.push({
      claimType: "event",
      strength: "medium",
      notes:
        "LPC's own recorded significant-alteration date from the designation report.",
    });
  }
  if (signals.useOther && signals.useOther !== signals.useOrig) {
    capabilities.push({
      claimType: "use-history",
      strength: "medium",
      notes:
        "Original vs. secondary use both transcribed from the designation report.",
    });
  }
  if (signals.ownDevel) {
    capabilities.push({
      claimType: "relationship",
      strength: "medium",
      notes: "Owner/developer transcribed from the designation report.",
    });
  }
  if (signals.notes && signals.notes.length >= MIN_NOTES_LENGTH) {
    capabilities.push({
      claimType: "event",
      strength: "medium",
      notes:
        "LPC's own free-text Notes field, used for post-designation substantial changes.",
    });
  }

  return {
    id: `lpc-${record.lpcRowId}`,
    title: `NYC Landmarks Preservation Commission — ${interpreted.identityLabel}${record.address ? ` (${record.address})` : ""}`,
    url: record.url,
    sourceClass: "government-preservation-record",
    capabilities,
  };
}

export function extractClaimsFromLpcRecord(
  record: LpcRetrievalRecord,
  interpreted: LpcInterpretedRecord,
): Claim[] {
  if (interpreted.classification !== "claim-bearing") return [];

  const { signals } = interpreted;
  const placeKey = `lpc-record-${record.lpcRowId}`;
  const address = record.address ?? "";
  const sourceIds = [`lpc-${record.lpcRowId}`];
  const claims: Claim[] = [];

  if (signals.lmNew && signals.lmNew !== signals.lmOrig) {
    claims.push({
      id: `lpc-${record.lpcRowId}-identity-aka`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: `AKA: ${signals.lmNew}`,
      claimType: "identity",
      claimText: `The NYC Landmarks Preservation Commission's own record for ${address || interpreted.identityLabel} lists an alternate/former name: "${signals.lmNew}."`,
      relatedEntities: [signals.lmNew],
      extractionMethod: "direct-source-text",
    });
  }

  if (signals.archBuild) {
    claims.push({
      id: `lpc-${record.lpcRowId}-architect`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: `Arch_Build: ${signals.archBuild}`,
      claimType: "architect",
      claimText: `The NYC Landmarks Preservation Commission's designation report names ${signals.archBuild} as architect/builder for ${address || interpreted.identityLabel}.`,
      relatedEntities: [signals.archBuild],
      extractionMethod: "direct-source-text",
    });
  }

  if (signals.dateCombo) {
    claims.push({
      id: `lpc-${record.lpcRowId}-construction-date`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: `Date_Combo: ${signals.dateCombo}`,
      claimType: "construction-date",
      claimText: `The NYC Landmarks Preservation Commission's designation report gives a construction/building date for ${address || interpreted.identityLabel} of ${signals.dateCombo}${signals.archBuild ? ` (architect/builder: ${signals.archBuild})` : ""}.`,
      dateRange: parseDateCombo(signals.dateCombo),
      extractionMethod: "direct-source-text",
    });
  }

  if (signals.altDate1) {
    const namedEntities = [signals.altArch1].filter((v): v is string => !!v);
    claims.push({
      id: `lpc-${record.lpcRowId}-alteration-1`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: `Alt_Date_1: ${signals.altDate1}${signals.altArch1 ? ` (Alt_Arch_1: ${signals.altArch1})` : ""}`,
      claimType: "event",
      claimText: `The NYC Landmarks Preservation Commission's designation report records a significant alteration at ${address || interpreted.identityLabel}, dated ${signals.altDate1}${signals.altArch1 ? `, with architect ${signals.altArch1}` : ""}.`,
      relatedEntities: namedEntities.length ? namedEntities : undefined,
      extractionMethod: "direct-source-text",
    });
    if (signals.altArch1) {
      claims.push({
        id: `lpc-${record.lpcRowId}-alteration-1-architect`,
        placeKey,
        address,
        proposedIdentityType: "unresolved",
        sourceIds,
        supportingSpan: `Alt_Arch_1: ${signals.altArch1} (${signals.altDate1})`,
        claimType: "architect",
        claimText: `The NYC Landmarks Preservation Commission's designation report names ${signals.altArch1} as architect for a significant alteration at ${address || interpreted.identityLabel}, dated ${signals.altDate1}.`,
        relatedEntities: [signals.altArch1],
        extractionMethod: "direct-source-text",
      });
    }
  }

  if (signals.altDate2) {
    const namedEntities = [signals.altArch2].filter((v): v is string => !!v);
    claims.push({
      id: `lpc-${record.lpcRowId}-alteration-2`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: `Alt_Date_2: ${signals.altDate2}${signals.altArch2 ? ` (Alt_Arch_2: ${signals.altArch2})` : ""}`,
      claimType: "event",
      claimText: `The NYC Landmarks Preservation Commission's designation report records a further significant alteration at ${address || interpreted.identityLabel}, dated ${signals.altDate2}${signals.altArch2 ? `, with architect ${signals.altArch2}` : ""}.`,
      relatedEntities: namedEntities.length ? namedEntities : undefined,
      extractionMethod: "direct-source-text",
    });
  }

  if (signals.useOther && signals.useOther !== signals.useOrig) {
    claims.push({
      id: `lpc-${record.lpcRowId}-use-history`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: `Use_Orig: ${signals.useOrig ?? "(unspecified)"}; Use_Other: ${signals.useOther}`,
      claimType: "use-history",
      claimText: `The NYC Landmarks Preservation Commission's designation report records that ${address || interpreted.identityLabel} changed use from ${signals.useOrig ?? "its original use"} to ${signals.useOther}.`,
      extractionMethod: "direct-source-text",
    });
  }

  if (signals.ownDevel) {
    claims.push({
      id: `lpc-${record.lpcRowId}-owner`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: `Own_Devel: ${signals.ownDevel}`,
      claimType: "relationship",
      claimText: `The NYC Landmarks Preservation Commission's designation report names the original owner/developer of ${address || interpreted.identityLabel} as ${signals.ownDevel}.`,
      relatedEntities: [signals.ownDevel],
      extractionMethod: "direct-source-text",
    });
  }

  if (signals.notes && signals.notes.length >= MIN_NOTES_LENGTH) {
    claims.push({
      id: `lpc-${record.lpcRowId}-notes`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: signals.notes,
      claimType: "event",
      claimText: `The NYC Landmarks Preservation Commission's own Notes field for ${address || interpreted.identityLabel} records: "${signals.notes}"`,
      extractionMethod: "direct-source-text",
    });
  }

  return claims;
}
