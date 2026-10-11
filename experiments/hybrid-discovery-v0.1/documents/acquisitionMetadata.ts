/**
 * Minimal, experiments-only representation of how a preservation-document
 * block's text was acquired. This is deliberately NOT a generalized PDF
 * ingestion layer — see PDF_ACQUISITION_FREEZE.md for the one frozen,
 * manually-run smoke-test invocation this records.
 *
 * Offline/non-production, experimental. Not wired into any adapter, runtime
 * path, or dependency manifest.
 */

export type AcquisitionMethod = "born-digital" | "pdf-text" | "ocr";

export interface AcquisitionRecord {
  method: AcquisitionMethod;
  /** Free-text tool name, when extraction (not pure born-digital copy/paste) was involved. */
  tool?: string;
  toolVersion?: string;
  /** Exact invocation/flags used, for reproducibility — never a generalized pipeline. */
  invocation?: string;
  /** Free-text quality note — no numeric score invented. */
  qualityNote?: string;
}

/**
 * The exact tool/version/invocation frozen after the 2301 Fairmount Ave
 * acquisition smoke test (readable born-digital PDF, 18 pages, no OCR
 * required). See PDF_ACQUISITION_FREEZE.md for the full smoke-test record.
 * This constant is experiment provenance only — using it does not add a
 * repo dependency; `pdftotext` was installed system-level via Homebrew,
 * outside this repo's dependency tree.
 */
export const FROZEN_BORN_DIGITAL_PDF_ACQUISITION: AcquisitionRecord = {
  method: "pdf-text",
  tool: "pdftotext (Poppler)",
  toolVersion: "26.10.0",
  invocation: "pdftotext -layout <pdf> <output>.txt",
  qualityNote:
    "Frozen for born-digital PDFs after the 2301 Fairmount Ave smoke test: clean extraction, page breaks and headings preserved, names/dates/numbers legible, no OCR required. Does not apply to scanned documents — OCR remains deferred.",
};
