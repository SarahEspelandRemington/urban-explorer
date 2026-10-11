# PDF Acquisition Freeze — born-digital PDFs

Experiment provenance note only. This is NOT a production dependency
decision, NOT a generalized PDF ingestion layer, and does not change any
repo dependency manifest. It records the exact, reproducible invocation
used for the one smoke test run so far, for the offline preservation-
document pilot under `experiments/hybrid-discovery-v0.1/documents/`.

## Frozen tool/version/invocation (born-digital PDFs only)

- Tool: `pdftotext` (Poppler)
- Version: 26.10.0
- Installation: Homebrew, system-level — outside this repo's dependency tree
- Invocation: `pdftotext -layout <pdf> <output>.txt`

See `acquisitionMetadata.ts`'s `FROZEN_BORN_DIGITAL_PDF_ACQUISITION` constant
for the machine-readable form of this same record.

## Smoke-test result (2301 Fairmount Avenue nomination)

- Document type: born-digital PDF (not scanned)
- Pages: 18
- Outcome: extraction succeeded
- Quality: page breaks and headings preserved; names, dates, and numbers
  legible; no corruption observed in spot-checked passages
- OCR: not required for this document

## Scope of this freeze

Applies only to born-digital PDFs matching the above profile. OCR remains
explicitly deferred — if a future pilot document turns out to be scanned
(no usable text layer), this freeze does not cover it, and that decision is
out of scope for the current pilot step.
