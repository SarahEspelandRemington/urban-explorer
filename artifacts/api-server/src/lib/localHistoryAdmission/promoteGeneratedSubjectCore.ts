/**
 * Pure helper functions for promoteGeneratedSubject.ts (the offline
 * reviewed-subject promotion CLI).
 *
 * This module deliberately contains no file I/O, no network calls, and no
 * extraction/grounding/admission/projection logic of its own — it only
 * reads an already-produced `DiscoveryWorthinessGateResult` (the real
 * output of the existing pipeline: artifact.ts -> projector.ts ->
 * worthiness.ts) and turns one subject's already-complete `CuratedEntry`
 * into TypeScript source text, or inserts/replaces that text inside an
 * existing GENERATED_LOCAL_HISTORY object literal.
 *
 * Core rule this module exists to enforce structurally: AUTO-ADMIT /
 * projectable / worthy means "ready for human review", never "ship to
 * production". Nothing in this module writes to disk, commits, or decides
 * that a subject should go live — see promoteGeneratedSubject.ts for the
 * CLI wrapper and the explicit --write/--replace gates.
 */
import * as ts from "typescript";
import type {
  CuratedEntry,
  CuratedEvidence,
  CuratedSource,
} from "../curatedLocalHistory";
import type { DiscoveryWorthinessGateResult } from "./worthiness";

/** Minimal shape this module actually needs from a gate result, so test
 *  fixtures don't have to construct a full DiscoveryWorthinessGateResult. */
export type GatedEntriesLike = Pick<
  DiscoveryWorthinessGateResult,
  "entries" | "worthinessBySubject"
>;

export type ExtractionResult =
  | { ok: true; entry: CuratedEntry }
  | { ok: false; reason: string };

/**
 * Looks up subjectId in an already-produced gate result. Returns the exact
 * CuratedEntry the pipeline produced (ok: true), or a human-readable refusal
 * reason distinguishing "never reached the gate at all" from "reached the
 * gate and was rejected for insufficient discovery worthiness" (ok: false).
 */
export function extractProjectableEntry(
  gated: GatedEntriesLike,
  subjectId: string,
): ExtractionResult {
  const entry = gated.entries?.[subjectId];
  if (entry) return { ok: true, entry };

  const worthiness = gated.worthinessBySubject?.[subjectId];
  if (worthiness && !worthiness.projectableForDiscovery) {
    return {
      ok: false,
      reason: `subject "${subjectId}" did not pass the discovery-worthiness gate: ${worthiness.worthinessReasons.join(" ")}`,
    };
  }

  return {
    ok: false,
    reason: `no generated entry found for subject "${subjectId}" in the provided report (not grounded, not admitted, or no claim references this subjectId).`,
  };
}

const REQUIRED_SOURCE_FIELDS: (keyof CuratedSource)[] = [
  "title",
  "sourceType",
  "usageNote",
];
const REQUIRED_EVIDENCE_FIELDS: (keyof CuratedEvidence)[] = [
  "subjectId",
  "text",
  "claimScope",
  "verificationStatus",
  "verificationConfidence",
  "curatedTrust",
  "lastVerifiedDate",
];

/**
 * Defensive field-presence check over an already-produced CuratedEntry.
 * This is a safety net, not a re-implementation of admission logic — the
 * real pipeline (projector.ts) should always produce every required field,
 * but this module reads arbitrary JSON off disk (a --report file), so it
 * cannot assume that invariant holds. Returns an empty array when valid.
 */
export function validateCuratedEntryFields(
  entry: CuratedEntry,
  expectedSubjectId: string,
): string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_SOURCE_FIELDS) {
    const value = entry.source[field];
    if (value === undefined || value === null || value === "") {
      missing.push(`source.${field}`);
    }
  }
  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    const value = entry.evidence[field];
    if (value === undefined || value === null || value === "") {
      missing.push(`evidence.${field}`);
    }
  }
  if (
    entry.evidence.subjectId &&
    entry.evidence.subjectId !== expectedSubjectId
  ) {
    missing.push(
      `evidence.subjectId mismatch (expected "${expectedSubjectId}", got "${entry.evidence.subjectId}")`,
    );
  }
  if (
    entry.evidence.verificationStatus !== undefined &&
    entry.evidence.verificationStatus !== "approved"
  ) {
    missing.push(
      `evidence.verificationStatus must be "approved" (got "${entry.evidence.verificationStatus}")`,
    );
  }
  return missing;
}

function field(key: string, value: string | undefined): string | undefined {
  return value === undefined ? undefined : `${key}: ${JSON.stringify(value)}`;
}

function serializeSource(source: CuratedSource): string {
  const parts = [
    field("title", source.title),
    field("url", source.url),
    field("sourceType", source.sourceType),
    field("usageNote", source.usageNote),
    field("publicationDate", source.publicationDate),
  ].filter((p): p is string => p !== undefined);
  return `{ ${parts.join(", ")} }`;
}

function serializeEvidence(evidence: CuratedEvidence): string {
  const parts = [
    field("subjectId", evidence.subjectId),
    field("text", evidence.text),
    field("claimScope", evidence.claimScope),
    field("verificationStatus", evidence.verificationStatus),
    field("verificationConfidence", evidence.verificationConfidence),
    field("curatedTrust", evidence.curatedTrust),
    field("lastVerifiedDate", evidence.lastVerifiedDate),
    // explicitDiscoveryTier is deliberately NEVER emitted here. It is an
    // editorial-only field the mechanical pipeline never sets (see
    // projector.ts's own doc comment) — this tool must not promote it to
    // production even if some future upstream artifact carried a stray
    // value for it.
    field("admissionMethod", evidence.admissionMethod),
    evidence.hasStoryBearingClaim !== undefined
      ? `hasStoryBearingClaim: ${evidence.hasStoryBearingClaim}`
      : undefined,
  ].filter((p): p is string => p !== undefined);
  return `{ ${parts.join(", ")} }`;
}

/**
 * Serializes one subjectId -> CuratedEntry pair to a TypeScript object
 * property, including its trailing comma (so it can be dropped directly
 * into an object literal). Deterministic: identical input always produces
 * identical output. Field order is fixed, matching CuratedSource/
 * CuratedEvidence's own declared field order. Quoting uses JSON.stringify,
 * which always produces syntactically valid double-quoted JS/TS string
 * literals regardless of content; Prettier (run separately, by the CLI) is
 * responsible for the project's preferred quote-style reformatting.
 */
export function serializeCuratedEntryToTs(
  subjectId: string,
  entry: CuratedEntry,
): string {
  return `${JSON.stringify(subjectId)}: { source: ${serializeSource(entry.source)}, evidence: ${serializeEvidence(entry.evidence)} },`;
}

export type InsertResult =
  | { ok: true; updatedSource: string }
  | { ok: false; reason: string };

/**
 * Locates the `export const GENERATED_LOCAL_HISTORY = { ... }` object
 * literal in registry source text and either inserts a new property or
 * replaces an existing one, using the TypeScript compiler API (not regex)
 * so that unrelated entries — including ones containing braces/quotes
 * inside string literals — are never misparsed. Every other property's own
 * text is left byte-for-byte untouched; a --replace swap only rewrites the
 * exact span of the matched property (never any preceding comment, which is
 * left for a human to review/update).
 */
export function insertOrReplaceEntry(
  sourceText: string,
  subjectId: string,
  entryText: string,
  options: { replace: boolean },
): InsertResult {
  const sourceFile = ts.createSourceFile(
    "curatedLocalHistory.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  let targetObjectLiteral: ts.ObjectLiteralExpression | undefined;
  ts.forEachChild(sourceFile, (node) => {
    if (targetObjectLiteral || !ts.isVariableStatement(node)) return;
    const decl = node.declarationList.declarations.find(
      (d) =>
        ts.isIdentifier(d.name) && d.name.text === "GENERATED_LOCAL_HISTORY",
    );
    if (decl?.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
      targetObjectLiteral = decl.initializer;
    }
  });

  if (!targetObjectLiteral) {
    return {
      ok: false,
      reason:
        "could not locate a GENERATED_LOCAL_HISTORY object literal in the registry source",
    };
  }

  let existingProperty: ts.PropertyAssignment | undefined;
  for (const prop of targetObjectLiteral.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name;
    const keyText = ts.isStringLiteral(name)
      ? name.text
      : ts.isIdentifier(name)
        ? name.text
        : undefined;
    if (keyText === subjectId) {
      existingProperty = prop;
      break;
    }
  }

  if (existingProperty) {
    if (!options.replace) {
      return {
        ok: false,
        reason: `subjectId "${subjectId}" already exists in GENERATED_LOCAL_HISTORY — pass --replace to replace it`,
      };
    }
    const start = existingProperty.getStart(sourceFile);
    const end = existingProperty.getEnd();
    const replacementBody = entryText.replace(/,\s*$/, "");
    const updatedSource =
      sourceText.slice(0, start) + replacementBody + sourceText.slice(end);
    return { ok: true, updatedSource };
  }

  // Insert as a new final property, directly before the object literal's
  // own closing brace — every existing property's text is left untouched.
  const closingBracePos = targetObjectLiteral.getEnd() - 1;
  const updatedSource =
    sourceText.slice(0, closingBracePos) +
    `  ${entryText}\n` +
    sourceText.slice(closingBracePos);
  return { ok: true, updatedSource };
}

export interface RunPromotionOptions {
  subjectId: string;
  gated: GatedEntriesLike;
  write: boolean;
  replace: boolean;
  /** Current registry source text. Required only when write is true; a
   *  dry run never reads or needs it. */
  registrySourceText?: string;
}

export type RunPromotionResult =
  | { outcome: "dry-run"; entryText: string }
  | { outcome: "written"; entryText: string; updatedSource: string }
  | { outcome: "refused"; reason: string };

/**
 * Pure orchestration of the promotion decision — performs zero I/O itself.
 * The CLI (promoteGeneratedSubject.ts) is solely responsible for reading
 * the report/registry files, calling this, and — only on `outcome:
 * "written"` — formatting and persisting `updatedSource`, after which it
 * must stop. This function never commits, pushes, or writes a file.
 */
export function runPromotion(options: RunPromotionOptions): RunPromotionResult {
  const extraction = extractProjectableEntry(options.gated, options.subjectId);
  if (!extraction.ok) return { outcome: "refused", reason: extraction.reason };

  const missing = validateCuratedEntryFields(
    extraction.entry,
    options.subjectId,
  );
  if (missing.length > 0) {
    return {
      outcome: "refused",
      reason: `missing or invalid required production field(s): ${missing.join(", ")}`,
    };
  }

  const entryText = serializeCuratedEntryToTs(
    options.subjectId,
    extraction.entry,
  );

  if (!options.write) {
    return { outcome: "dry-run", entryText };
  }

  if (options.registrySourceText === undefined) {
    return {
      outcome: "refused",
      reason: "registrySourceText is required when write is true",
    };
  }

  const result = insertOrReplaceEntry(
    options.registrySourceText,
    options.subjectId,
    entryText,
    { replace: options.replace },
  );
  if (!result.ok) return { outcome: "refused", reason: result.reason };

  return { outcome: "written", entryText, updatedSource: result.updatedSource };
}

/**
 * Accepts either a bare DiscoveryWorthinessGateResult-shaped JSON value, or
 * a report object with a top-level "gated" key of that shape (the
 * convention already used by generateJacksonHeightsArtifact.ts's
 * report-*.json output). Returns undefined for anything else. Pure,
 * operates on already-parsed JSON — no file I/O.
 */
export function extractGatedFromReportJson(
  reportJson: unknown,
): GatedEntriesLike | undefined {
  if (isGatedEntriesLike(reportJson)) return reportJson;
  if (
    reportJson &&
    typeof reportJson === "object" &&
    "gated" in reportJson &&
    isGatedEntriesLike((reportJson as { gated: unknown }).gated)
  ) {
    return (reportJson as { gated: GatedEntriesLike }).gated;
  }
  return undefined;
}

function isGatedEntriesLike(value: unknown): value is GatedEntriesLike {
  return (
    !!value &&
    typeof value === "object" &&
    "entries" in value &&
    "worthinessBySubject" in value
  );
}
