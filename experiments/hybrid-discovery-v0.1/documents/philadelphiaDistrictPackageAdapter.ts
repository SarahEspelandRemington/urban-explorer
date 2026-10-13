/**
 * Philadelphia district-package adapter v1 (Step 5 — district calibration).
 *
 * Builds a multi-resource `DocumentEvidencePacket` from the RAW
 * `pdftotext -layout` text of one specific, real document shape: a
 * Philadelphia Historical Commission district-nomination inventory using the
 * modern per-parcel field-survey layout (proven against the Southeast Spruce
 * Hill Historic District nomination only — the Step 5 district calibration
 * subject). This is a DIFFERENT real district-package dialect from the
 * narrative block-inventory dialect observed in the Old City nomination
 * (checked, logged, and skipped at the district-entry gate during this same
 * calibration search — see the candidate-check log); no adapter is built for
 * that dialect here because no accepted package requires it (Step 5 section
 * 6: "implement only the minimum district-specific normalization needed").
 *
 * Settled adapter boundary (same boundary as philadelphiaFormNominationAdapter.ts,
 * do not exceed in this file):
 * - MAY: segment source text into page-aware, scope-classified blocks;
 *   detect frozen, deterministic structural cues; preserve verbatim
 *   headings/field labels/page provenance; report source-native scope;
 *   report stated authorship; record ambiguity.
 * - MUST NOT: decide evidence trustworthiness, capability strengths, or
 *   interest; form claims; tune grounding; resolve source conflicts; form
 *   narration/angles; manually clean/repair text; evaluate whether prose is
 *   interesting/surprising/Streetlit-worthy.
 *
 * Frozen rules (confirmed against the real Southeast Spruce Hill extraction):
 *
 * 1. PAGE SPLIT: identical convention to philadelphiaFormNominationAdapter.ts
 *    — raw text is split on `\f`; a single trailing empty chunk (after the
 *    last page) is dropped; the 1-based index of each remaining chunk IS the
 *    physical page number.
 *
 * 2. RESOURCE-ENTRY PAGE DETECTION: a page is a resource-entry page iff its
 *    first non-blank trimmed line matches `/^Address\s{2,}\S/` — this is the
 *    per-parcel survey form's own field-1 label, immediately followed by the
 *    stated address. Confirmed against the full real extraction: exactly
 *    574 of 611 real content pages match, with zero false positives (the
 *    pattern never matches on any of the other 37 narrative pages) — see
 *    `enumeratePhiladelphiaFrame.test.ts` / the Step 5 candidate-check log
 *    for the exact counts. `confirmed: true` on
 *    `SPRUCE_HILL_DIALECT_DISTRICT_PACKAGE_FORM_IDENTITY_MARKER` records this
 *    same regex as the Gate 3 form-identity cue for this dialect.
 *
 * 3. RESOURCE IDENTITY / sourceNativeId: a resource-entry page's own stated
 *    "Registry Number" field value (matched via `/Registry Number\s+(\S+)/`
 *    against the page's trimmed lines) becomes that resource's
 *    `sourceNativeId` — confirmed present on every one of the 574 detected
 *    resource-entry pages (574 "Registry Number" occurrences exactly, one
 *    per detected Address-led page, zero orphans either direction).
 *    `resourceLabel` is the stated address itself, verbatim (the only field
 *    this adapter treats as authoritative identity — no story-bearing field
 *    such as "Property Name"/"Building Name" is read or used).
 *
 * 4. NARRATIVE SCOPE / HEADING CARRY-FORWARD: for a non-Address-led page,
 *    this adapter reuses the SAME frozen numbered-section-heading rule
 *    already proven on the individual-resource-nomination form
 *    (`/^(\d{1,2})\.\s+[A-Z]/` from philadelphiaFormNominationAdapter.ts) —
 *    not a document-specific invention. If any line on the page matches,
 *    that line becomes the active section heading (document-wide state,
 *    carried forward across subsequent pages exactly as in the individual
 *    adapter) and the page is scoped `"district-narrative"` (never
 *    `"document-level"`: a multi-resource district package's own narrative
 *    content describes the district, never one single property). A later
 *    page with no heading match, encountered AFTER some heading has already
 *    been seen, continues to carry forward that same `"district-narrative"`
 *    scope.
 *
 * 5. UNDETERMINABLE FALLBACK: a non-Address-led page with no heading match AND
 *    no heading ever yet seen in the document falls back to `"undeterminable"`
 *    scope, fails closed — never guessed into `"district-narrative"`. Not
 *    observed in the real Southeast Spruce Hill extraction itself (every one
 *    of its 611 real content pages resolved to either resource-entry or
 *    district-narrative — see the candidate-check log), but this fallback
 *    branch is exercised and asserted via a constructed fixture in
 *    `philadelphiaDistrictPackageAdapter.test.ts`, since the generic rule
 *    must fail closed even though this particular real document never
 *    happens to trigger it.
 *
 * 6. BLOCK GRANULARITY: one block per page (not per-paragraph, unlike the
 *    individual-form adapter) — the minimum district-specific normalization
 *    needed to demonstrate cardinality/resourceRef/scope structure, per Step
 *    5 section 6. A page's non-blank lines are reflowed (trimmed, joined
 *    with a single space) into `text`; `rawText` preserves the original
 *    lines joined with `\n`, unmodified, for audit.
 *
 * 7. AUTHORSHIP: "unknown" for every block. Checked directly against the
 *    real extraction for "Prepared by"/"Nominator"/"Consultant"/"Submitted
 *    by"-style attribution text: the only match found is a blank template
 *    checkbox field ("Nominator      is         is not       the property
 *    owner.") with no name filled in — not a real attribution statement.
 *    Authorship fails closed uniformly, same as the individual-form adapter.
 *
 * 8. STATED STATUS: not detected by this adapter. The individual-form's
 *    "X Designated"/"X Rejected" checkbox cue was not observed anywhere in
 *    the real Southeast Spruce Hill extraction (a district package records
 *    designation at the package level, e.g. via `publicationDate`, not a
 *    per-parcel checkbox) — `statedStatus` is left undefined, not guessed.
 *
 * Offline/non-production, experimental.
 */
import type { AcquisitionRecord } from "./acquisitionMetadata";
import type {
  AssignmentEvidenceBasis,
  DocumentBlock,
  DocumentEvidencePacket,
  DocumentResource,
  DocumentScopeState,
} from "./documentEvidencePacket";

const ADDRESS_FIELD_RE = /^Address\s{2,}(\S.*)$/;
const REGISTRY_NUMBER_RE = /Registry Number\s+(\S+)/;
/** Same frozen rule as philadelphiaFormNominationAdapter.ts's HEADING_LINE_RE — reused, not reinvented. */
const HEADING_LINE_RE = /^(\d{1,2})\.\s+[A-Z]/;

function splitIntoPages(rawText: string): string[] {
  const parts = rawText.split("\f");
  if (parts.length > 0 && parts[parts.length - 1]!.trim() === "") {
    parts.pop();
  }
  return parts;
}

interface ClassifiedPage {
  page: number;
  rawLines: string[];
  scope: DocumentScopeState;
  resourceAddress?: string;
  resourceSourceNativeId?: string;
  sourceNativeHeading?: string;
  assignmentEvidence: AssignmentEvidenceBasis[];
}

function classifyPages(pages: string[]): ClassifiedPage[] {
  const classified: ClassifiedPage[] = [];
  let currentHeading: string | undefined;

  pages.forEach((pageText, pageIdx) => {
    const pageNumber = pageIdx + 1;
    const rawLines = pageText.split("\n");
    const trimmedNonBlank = rawLines
      .map((l) => l.trim())
      .filter((l) => l !== "");
    if (trimmedNonBlank.length === 0) {
      // Genuinely empty page (no extractable content) — nothing to represent.
      return;
    }

    const firstLine = trimmedNonBlank[0]!;
    const addressMatch = firstLine.match(ADDRESS_FIELD_RE);
    if (addressMatch) {
      const address = addressMatch[1]!.trim();
      const registryLine = trimmedNonBlank.find((l) =>
        REGISTRY_NUMBER_RE.test(l),
      );
      const registryMatch = registryLine?.match(REGISTRY_NUMBER_RE);
      classified.push({
        page: pageNumber,
        rawLines,
        scope: "resource-entry",
        resourceAddress: address,
        resourceSourceNativeId: registryMatch?.[1],
        assignmentEvidence: [
          {
            assigns: "scope",
            structuralCueType: "address-field-label-line",
            verbatimText: firstLine,
            page: pageNumber,
          },
          {
            assigns: "resourceRef",
            structuralCueType: "address-field-label-line",
            verbatimText: firstLine,
            page: pageNumber,
          },
        ],
      });
      return;
    }

    const headingLine = trimmedNonBlank.find((l) => HEADING_LINE_RE.test(l));
    if (headingLine) {
      currentHeading = headingLine;
      classified.push({
        page: pageNumber,
        rawLines,
        scope: "district-narrative",
        sourceNativeHeading: currentHeading,
        assignmentEvidence: [
          {
            assigns: "scope",
            structuralCueType: "numbered-section-heading",
            verbatimText: headingLine,
            page: pageNumber,
          },
        ],
      });
      return;
    }

    if (currentHeading !== undefined) {
      classified.push({
        page: pageNumber,
        rawLines,
        scope: "district-narrative",
        sourceNativeHeading: currentHeading,
        assignmentEvidence: [
          {
            assigns: "scope",
            structuralCueType: "heading-carry-forward",
            page: pageNumber,
          },
        ],
      });
      return;
    }

    classified.push({
      page: pageNumber,
      rawLines,
      scope: "undeterminable",
      assignmentEvidence: [
        {
          assigns: "scope",
          structuralCueType: "no-address-no-heading-fallback",
          page: pageNumber,
        },
      ],
    });
  });

  return classified;
}

function reflow(rawLines: string[]): string {
  return rawLines
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join(" ");
}

export interface PhiladelphiaDistrictPackageAdapterInput {
  packetId: string;
  documentTitle: string;
  documentId?: string;
  documentUrl?: string;
  jurisdiction: string;
  rootProvenanceId: string;
  acquisition: AcquisitionRecord;
  rawExtractedText: string;
}

export function buildPhiladelphiaDistrictPackagePacket(
  input: PhiladelphiaDistrictPackageAdapterInput,
): DocumentEvidencePacket {
  const pages = splitIntoPages(input.rawExtractedText);
  const classifiedPages = classifyPages(pages);
  const ambiguityFlags: string[] = [];

  const resources: DocumentResource[] = [];
  const resourceIdByAddress = new Map<string, string>();

  const blocks: DocumentBlock[] = classifiedPages.map((cp, idx) => {
    let resourceRef: string | undefined;
    if (cp.scope === "resource-entry" && cp.resourceAddress) {
      let resourceId = resourceIdByAddress.get(cp.resourceAddress);
      if (!resourceId) {
        resourceId = `${input.packetId}-resource-${resources.length + 1}`;
        resourceIdByAddress.set(cp.resourceAddress, resourceId);
        resources.push({
          resourceId,
          resourceLabel: cp.resourceAddress,
          sourceNativeId: cp.resourceSourceNativeId,
          locationEvidence: { address: cp.resourceAddress },
        });
      }
      resourceRef = resourceId;
    }

    const assignmentEvidence = [...cp.assignmentEvidence];
    assignmentEvidence.push({
      assigns: "authorshipRole",
      structuralCueType: "no-attribution-found",
      page: cp.page,
    });

    return {
      blockId: `${input.packetId}-block-${idx}`,
      page: cp.page,
      resourceRef,
      scope: cp.scope,
      authorshipRole: "unknown",
      sourceNativeHeading: cp.sourceNativeHeading,
      text: reflow(cp.rawLines),
      rawText: cp.rawLines.join("\n"),
      acquisition: input.acquisition,
      assignmentEvidence,
    };
  });

  if (classifiedPages.some((cp) => cp.scope === "undeterminable")) {
    ambiguityFlags.push(
      "One or more pages had neither an Address field-label line nor any numbered-section heading (and no heading had yet been seen) — scoped undeterminable, fails closed.",
    );
  }

  return {
    schemaVersion: 1,
    packetId: input.packetId,
    documentTitle: input.documentTitle,
    documentId: input.documentId,
    documentUrl: input.documentUrl,
    jurisdiction: input.jurisdiction,
    cardinality: "multi-resource",
    resources,
    blocks,
    rootProvenanceId: input.rootProvenanceId,
    ambiguityFlags: ambiguityFlags.length > 0 ? ambiguityFlags : undefined,
  };
}
