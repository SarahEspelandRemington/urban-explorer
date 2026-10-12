/**
 * Philadelphia preservation-document adapter v1 (implementation step 3).
 *
 * Builds a `DocumentEvidencePacket` from the RAW `pdftotext -layout` text of
 * one specific, real document shape: a Philadelphia Historical Commission
 * Register of Historic Places nomination form (proven against 2301
 * Fairmount Avenue only — see PDF_ACQUISITION_FREEZE.md).
 *
 * Settled adapter boundary (do not exceed in this file):
 * - MAY: acquire text via the frozen pdftotext method; segment source text
 *   into page-aware, heading-scoped, reflowed paragraph blocks; detect one
 *   frozen, deterministic heading-detection rule; preserve verbatim
 *   headings/page provenance/stated status; report source-native scope;
 *   report stated authorship; record ambiguity.
 * - MUST NOT: decide evidence trustworthiness, capability strengths, or
 *   interest; form claims; tune grounding; resolve source conflicts; form
 *   narration/angles; manually clean/repair text; add editorial heuristics
 *   beyond what this one document's structure demonstrably supports.
 *
 * Frozen rules (see also PDF_ACQUISITION_FREEZE.md for acquisition):
 *
 * 1. PAGE SPLIT: raw text is split on the form-feed character (`\f`) that
 *    `pdftotext -layout` emits after every page, including the last — so a
 *    single trailing empty chunk is dropped, and the 1-based index of each
 *    remaining chunk IS the physical page number. Never inferred from
 *    rendered footer page numbers (observed to be absent/unreliable on some
 *    pages, e.g. the first).
 *
 * 2. HEADING DETECTION: a line (after trimming) matches the heading rule
 *    iff it matches `/^(\d{1,2})\.\s+[A-Z]/` — a leading 1-2 digit number,
 *    a period, whitespace, then a capital letter. Verified against the full
 *    real 2301 Fairmount extraction: exactly 13 lines match, all genuine
 *    section headings (form-page labels and their later narrative-section
 *    counterparts) — zero false positives against footnote-marker lines
 *    (which are bare digits with no period, on their own line) or the
 *    lettered `(a)`-`(j)` designation-criteria list. This is a structural
 *    cue, never a semantic read of the heading's wording. A heading, once
 *    detected, remains the active heading context across subsequent pages
 *    until the next heading line is encountered (document-wide state) —
 *    "nearest detected heading" is not reset per page. If no heading has
 *    ever been detected when body content is encountered, that content
 *    falls back to a block with heading undefined ("heading unknown"),
 *    never a guessed heading.
 *
 * 3. PARAGRAPH SPLIT: within the lines following a heading (and before the
 *    next), one or more consecutive blank lines (empty after trim) delimit
 *    paragraphs. A paragraph's lines are also always flushed as a block at
 *    a page boundary, even without a blank line — so a paragraph that
 *    continues across a page becomes two separate blocks, each carrying its
 *    own correct page number, never a single block spanning two pages.
 *
 * 4. REFLOW: a block's raw lines are joined with a single space to produce
 *    `text`. This is a uniform rule applied identically to every line
 *    break, INCLUDING a line that happens to end in a letter immediately
 *    followed by a hyphen (no trailing space) — the hyphen is never
 *    deleted and the two fragments are never guessed into one word; the
 *    adjacent lines are simply joined with the same single space as any
 *    other wrap. `rawText` preserves the original, un-reflowed lines
 *    (joined with `\n`) so the reflow is auditable.
 *
 * 5. HYPHENATION AMBIGUITY: any such letter-hyphen line ending within a
 *    block is recorded via `ambiguityNote`, never silently joined or
 *    silently left unflagged.
 *
 * 6. PAGE-BOUNDARY SENTENCE BREAK: when a block is flushed because of a
 *    page boundary (not a blank line) and its last non-blank line does not
 *    end in sentence-ending punctuation (`.`, `?`, `!`, `:`, `;`), this is
 *    recorded via `ambiguityNote` as a possible sentence broken by the page
 *    boundary — never manually repaired/joined with the next page's text.
 *
 * 7. HEADING -> ROLE: handled entirely by the shared, city-agnostic
 *    headingRoleMapper.ts — this adapter only looks at verbatim heading
 *    text and that shared mapper's output; it never invents a shared role
 *    from Philadelphia vocabulary itself.
 *
 * 8. SCOPE: derived only from the shared heading role, for THIS
 *    single-resource document only (no district labeling, no multi-resource
 *    entry structure observed) — narrative/identifying/boundary content
 *    (identification, property-condition, boundary, narrative-description,
 *    narrative-significance) is "document-level"; administrative/
 *    bibliography content and heading-unknown fallback blocks are
 *    "undeterminable" (deliberately NOT stretched into "document-level",
 *    since they do not narrate the property). Never resource-entry (no
 *    source-native multi-resource entry structure exists in this document).
 *
 * 9. AUTHORSHIP: "unknown" for every block. No "prepared by" statement,
 *    signature block, or cover-page attribution of any kind was found
 *    anywhere in the real extracted text (verified by direct inspection) —
 *    so authorship fails closed uniformly, never inferred from PHC hosting
 *    the document.
 *
 * 10. STATED STATUS: detected only via a literal, observed structural cue —
 *    a line starting with a bare capital "X" immediately followed by
 *    "Designated" or "Rejected" (the PHC form's own checkbox-mark
 *    rendering, confirmed present verbatim in the real extraction). No
 *    `statedDate` is attached: the document does not unambiguously tie one
 *    single date to that specific checkbox row (fails closed, not guessed).
 *
 * Offline/non-production, experimental.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AcquisitionRecord } from "./acquisitionMetadata";
import type {
  AssignmentEvidenceBasis,
  DocumentBlock,
  DocumentEvidencePacket,
  DocumentScopeState,
  StatedStatus,
} from "./documentEvidencePacket";
import { mapHeadingToRole, type HeadingRole } from "./headingRoleMapper";

const HEADING_LINE_RE = /^(\d{1,2})\.\s+[A-Z]/;
const SENTENCE_END_RE = /[.?!:;]\s*$/;
const LINE_END_HYPHEN_RE = /[A-Za-z]-\s*$/;
const CHECKBOX_RE = /^\s*X\s+(Designated|Rejected)\b/;

/**
 * Acquires raw text from a PDF using the frozen pilot method exactly:
 * `pdftotext -layout <pdf> <output>.txt`. No OCR, no other tool/invocation.
 */
export function acquirePdfTextViaPdftotext(pdfPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), "phila-adapter-"));
  const outPath = join(dir, "extracted.txt");
  try {
    execFileSync("pdftotext", ["-layout", pdfPath, outPath]);
    return readFileSync(outPath, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function splitIntoPages(rawText: string): string[] {
  const parts = rawText.split("\f");
  if (parts.length > 0 && parts[parts.length - 1]!.trim() === "") {
    parts.pop();
  }
  return parts;
}

function scopeForHeadingRole(role: HeadingRole): DocumentScopeState {
  switch (role) {
    case "identification":
    case "property-condition":
    case "boundary":
    case "narrative-description":
    case "narrative-significance":
      return "document-level";
    case "bibliography":
    case "administrative":
    case "unknown":
      return "undeterminable";
  }
}

interface PendingBlockLine {
  raw: string;
}

interface SegmentedBlock {
  page: number;
  heading: string | undefined;
  headingPage: number | undefined;
  rawLines: string[];
  flushedAtPageBoundary: boolean;
}

/**
 * Walks every page's lines, tracking the document-wide active heading and
 * emitting one SegmentedBlock per paragraph (frozen rules 2-3 above).
 */
function segmentPages(pages: string[]): SegmentedBlock[] {
  const blocks: SegmentedBlock[] = [];
  let currentHeading: string | undefined;
  let currentHeadingPage: number | undefined;
  let pending: PendingBlockLine[] = [];

  function flush(pageNumber: number, atPageBoundary: boolean) {
    if (pending.length === 0) return;
    blocks.push({
      page: pageNumber,
      heading: currentHeading,
      headingPage: currentHeadingPage,
      rawLines: pending.map((p) => p.raw),
      flushedAtPageBoundary: atPageBoundary,
    });
    pending = [];
  }

  pages.forEach((pageText, pageIdx) => {
    const pageNumber = pageIdx + 1;
    const lines = pageText.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      const headingMatch = trimmed.match(HEADING_LINE_RE);
      if (headingMatch) {
        // A new heading always starts a fresh block context.
        flush(pageNumber, false);
        currentHeading = trimmed;
        currentHeadingPage = pageNumber;
        continue;
      }
      if (trimmed === "") {
        flush(pageNumber, false);
        continue;
      }
      pending.push({ raw: line });
    }
    // Page boundary: flush whatever is pending, marking it as a
    // page-boundary flush (frozen rule 3/6), never carried into the next
    // page's lines as part of the same block.
    flush(pageNumber, true);
  });

  return blocks;
}

function reflow(rawLines: string[]): string {
  return rawLines.map((l) => l.trim()).join(" ");
}

function detectAmbiguity(seg: SegmentedBlock): string | undefined {
  const notes: string[] = [];
  for (let i = 0; i < seg.rawLines.length - 1; i++) {
    if (LINE_END_HYPHEN_RE.test(seg.rawLines[i]!)) {
      notes.push(
        `Line-end hyphenation at "${seg.rawLines[i]!.trim()}" / "${seg.rawLines[i + 1]!.trim()}" — not repaired; hyphen and word break preserved as-is.`,
      );
    }
  }
  if (seg.flushedAtPageBoundary) {
    const lastLine = seg.rawLines[seg.rawLines.length - 1]?.trim() ?? "";
    if (lastLine !== "" && !SENTENCE_END_RE.test(lastLine)) {
      notes.push(
        "Block ends at a page boundary without sentence-ending punctuation; the sentence may continue onto the next page and was not repaired across the page break.",
      );
    }
  }
  return notes.length > 0 ? notes.join(" | ") : undefined;
}

function detectStatedStatus(
  rawText: string,
  pages: string[],
): StatedStatus | undefined {
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const lines = pages[pageIdx]!.split("\n");
    for (const line of lines) {
      const match = line.match(CHECKBOX_RE);
      if (match) {
        return {
          text: match[1]!,
          rawLine: line.trim(),
          page: pageIdx + 1,
          structuralCueType: "checkbox-x-mark",
        };
      }
    }
  }
  return undefined;
}

export interface PhiladelphiaAdapterInput {
  packetId: string;
  documentTitle: string;
  documentId?: string;
  documentUrl?: string;
  jurisdiction: string;
  resourceId: string;
  resourceLabel: string;
  rootProvenanceId: string;
  acquisition: AcquisitionRecord;
  rawExtractedText: string;
}

export function buildPhiladelphiaFormNominationPacket(
  input: PhiladelphiaAdapterInput,
): DocumentEvidencePacket {
  const pages = splitIntoPages(input.rawExtractedText);
  const segments = segmentPages(pages);
  const ambiguityFlags: string[] = [];

  const blocks: DocumentBlock[] = segments.map((seg, idx) => {
    const role = mapHeadingToRole(seg.heading);
    const scope = scopeForHeadingRole(role);
    const ambiguityNote = detectAmbiguity(seg);
    const assignmentEvidence: AssignmentEvidenceBasis[] = [];

    assignmentEvidence.push(
      seg.heading
        ? {
            assigns: "scope",
            structuralCueType: "numbered-section-heading",
            verbatimText: seg.heading,
            page: seg.headingPage,
          }
        : {
            assigns: "scope",
            structuralCueType: "no-heading-page-fallback",
            page: seg.page,
          },
    );
    assignmentEvidence.push({
      assigns: "authorshipRole",
      structuralCueType: "no-attribution-found",
      page: seg.page,
    });

    return {
      blockId: `${input.packetId}-block-${idx}`,
      page: seg.page,
      scope,
      authorshipRole: "unknown",
      sourceNativeHeading: seg.heading,
      text: reflow(seg.rawLines),
      rawText: seg.rawLines.join("\n"),
      acquisition: input.acquisition,
      ambiguityNote,
      assignmentEvidence,
    };
  });

  const statedStatus = detectStatedStatus(input.rawExtractedText, pages);
  if (!statedStatus) {
    ambiguityFlags.push(
      "No stated designation status checkbox cue was found in this extraction.",
    );
  } else if (!statedStatus.statedDate) {
    ambiguityFlags.push(
      "A stated designation status was found, but no single date could be unambiguously tied to it — statedDate left undefined rather than guessed.",
    );
  }

  return {
    schemaVersion: 1,
    packetId: input.packetId,
    documentTitle: input.documentTitle,
    documentId: input.documentId,
    documentUrl: input.documentUrl,
    jurisdiction: input.jurisdiction,
    statedStatus,
    cardinality: "single-resource",
    resources: [
      { resourceId: input.resourceId, resourceLabel: input.resourceLabel },
    ],
    blocks,
    rootProvenanceId: input.rootProvenanceId,
    ambiguityFlags: ambiguityFlags.length > 0 ? ambiguityFlags : undefined,
  };
}
