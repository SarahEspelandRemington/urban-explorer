# Philadelphia Six-Subject Nomination-Document Pilot — Preregistration

Implementation step 4. This document freezes the experiment design before
any six-subject draw, document read, or extraction. It does not change any
production code. Baseline commit for all "pin production/shared module
baseline" language below: `18bba6ebc1042323109b7dc312f6066497702753`.

**CORRECTION (2026-10-12, per RC review):** every pool this document and
`enumeratePhiladelphiaFrame.ts` produce from the PRHP register is a
**candidate frame / candidate universe**, not a confirmed adapter-eligible
document frame. A candidate becomes structurally eligible only once it is
checked, in seeded order, under the frozen structural-check gates in
section 7A below. In particular, the pool previously called the
"district-only pool" is a **district-package candidate pool** — its
members are candidates for a district-package resource entry, not
confirmed district resource entries. None of the structural checks in
section 7A have been run against any real candidate as of this document;
running them is the next task's job. This correction also supersedes the
"eligible frame" naming used by the code and this document prior to
2026-10-12 — the renamed code (`buildCandidateFrame`,
`individualCandidatePool`, `districtPackageCandidatePool`, etc.) is now the
source of truth; references below are updated to match.

## 1. Authoritative candidate-universe source

**Source**: "Philadelphia Register of Historic Places (OPA-compliant
Addresses)", Philadelphia Historical Commission, "As of February 19, 2026".
**Retrieval URL**: https://www.phila.gov/media/20260219103746/PRHP-without-units-2-19-2026.pdf
(linked from https://www.phila.gov/documents/philadelphia-register-of-historic-places/).
**Retrieval timestamp**: 2026-10-11. **Extraction**: `pdftotext -layout`
(the already-frozen tool from `PDF_ACQUISITION_FREEZE.md`, applied here to a
structural index document, not a nomination narrative) → 260 pages / 16,354
text lines. **Pagination/ordering**: the PDF has no query parameters; it is
a single static document, 260 pages, rows ordered alphabetically by street
name then numerically by house number (the document's own fixed order —
not re-sorted by this pilot except where noted in section 4).

**Format exclusions / blocker — reported, not hidden**: no bulk,
authoritative Philadelphia source was found that links an individual
register resource to its nomination-document URL. Checked and ruled out:

- CARTO SQL API tables `historic_sites_philreg` (23,375 rows) and
  `historicdistricts_local` (17 rows) — no document-link field, no resource
  name field on the sites table.
- ArcGIS Online web map "Philadelphia Register of Historic Places,
  Properties and Historic Districts" (item `c9ce32a9d61242429ac0b4530a8846e6`)
  and the phila.gov-linked Experience Builder app (item
  `7e77e2ece09c4bbbb3a7c7954a3071ce`) — both resolve to the same two
  FeatureServer layers as the CARTO tables (`HistoricDistricts_Local`,
  `Historic_sites_PhilReg`, service root
  `https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/`);
  confirmed by inspecting each layer's field list directly — no
  document-link field on either.
- The Philadelphia Historical Commission's own page states nomination
  documents must be requested directly (preservation@phila.gov), not that
  they are bulk-published with a queryable index.

**Consequence**: this inventory PDF is the best available _structural_
index — it exposes designation dates, district membership, historic name,
and construction date, which is enough to define the candidate universe and
its two strata — but it cannot answer "is this resource's document
born-digital / a PHC individual nomination form / a district-package
narrative / a scan?" in bulk. Per this step's own instructions,
format/adapter-applicability is therefore **not** computed as a bulk
statistic here. It is deferred to a per-candidate, logged, structural check
at acquisition time (frozen in section 7A below), applied only to
actually-checked candidates in seeded order — never a universal pre-filter,
since no bulk field exists to drive one, and never a confirmation that the
candidate universe itself is already adapter-eligible.

**Total records inspected**: 14,533 (260 pages, 0 unparseable rows — every
row matched the address-prefix rule and contained at least one designation
date token; see `enumeratePhiladelphiaFrame.ts` for the parser and
`philadelphiaFrameEnumeration.json` for the full run output). This count is
a candidate-universe size, not a count of structurally-checked or
adapter-eligible documents.

## 2. Exclusion list

See `PILOT_EXCLUSIONS.ts` — 12 resources, each with its exact PRHP-printed
address, reason code, reason detail, and source of reason. `2301 FAIRMOUNT
AVE` (the Step 3/3A calibration subject) plus 11 Spring Garden Street
addresses already present in production `curatedLocalHistory.ts` (found by
cross-referencing the PAB/Baldwin-Park-cited addresses in that file against
the parsed PRHP candidate universe). Applied by address-string match in
`buildCandidateFrame()` before any pool/stratum count is reported. This is
itself a structural, mechanical skip (`on-exclusion-list`) — not a
structural-check gate (section 7A), since it requires no document fetch or
inspection.

## 3. Enumeration/parsing boundary

`enumeratePhiladelphiaFrame.ts` only reads the structural index text. It
never calls `extractNarrativeClaims`, the admission/worthiness pipeline, or
angle generation, and it never opens a nomination document. No document was
fetched to check format eligibility or run any structural-check gate in
this task — see section 1's blocker and section 7A; those checks are
deferred to the next task, not performed early via a documented exception.

## 4. Seeded draw design (frozen, NOT executed in this step)

- **Seed**: `18bba6ebc1042323109b7dc312f6066497702753` (the Step 3/3A
  checkpoint commit SHA).
- **Stable input ordering**: candidates within each stratum are first
  sorted ascending by their exact PRHP-printed `address` string (plain
  JS string comparison) — `stableSortByAddress()`. This removes any
  dependency on incidental PDF-extraction row order.
- **Algorithm**: the seed string is hashed to a 32-bit integer via FNV-1a,
  then used to seed `mulberry32`, a small deterministic PRNG. A
  Fisher-Yates shuffle driven by that PRNG produces the draw order —
  `seededShuffleOrder()`. Same seed + same stably-ordered input ⇒ same
  permutation, always (tested — see `enumeratePhiladelphiaFrame.test.ts`).
- Structural checks (section 7A) are applied in that frozen seeded order,
  walking forward through each stratum's candidate pool. **Accepted
  candidates are the first candidates in seeded order that satisfy all
  applicable structural requirements for their stratum** — individual
  candidates must pass Gates 1-3; district-package candidates must
  additionally pass the district-entry check and the package-dedup check
  (section 7A/§4). No story content may be inspected to decide
  eligibility, at any point in this walk. **Not executed in this task.**

## 5. Strata (frozen)

4 individual-resource + 2 district-package resource-entry subjects,
defined structurally from the inventory alone (never geography):

- **Individual stratum**: `hasIndividualDesignation === true` (an
  individual Desig Date1/Desig Date2 designation date is present),
  regardless of whether the resource is _also_ later swept into a
  district. These resources have their own individual nomination
  document, which is the adapter-relevant one.
- **District-package stratum**: `hasDistrictDesignation === true &&
hasIndividualDesignation === false`. No separate individual nomination
  document exists for these; the only possible source document is the
  shared district nomination package. Membership in this stratum is
  CANDIDACY only — see the correction note at the top of this document and
  section 7A's district-entry check. A candidate from this stratum is not
  a confirmed district resource entry until that check passes.

Pool sizes from the real candidate universe (post-exclusion, see section
6): both strata's candidate pools are large enough to support 4 + 2 before
any structural check — **no blocker on raw pool size.** Whether enough
candidates in the district-package pool actually pass the district-entry
check is explicitly unknown until the next task runs it (see section 7A/§5,
"Unfilled district stratum").

## 6. Wikipedia-baseline categories (frozen)

- **A** — no resolvable Wikipedia article for the subject.
- **B** — resolvable article exists, but is not materially useful (stub,
  off-topic disambiguation, or no content overlapping the subject's
  claims).
- **C** — resolvable article with a useful current baseline (real,
  on-topic content).
- **D** — rich Wikipedia content exists but the shared extractor misses
  it (a shared-extractor limitation, not a preservation-source win — see
  the NYC Portability Phase 2 precedent in memory).
- **U** — unresolved; does not count toward the weak/absent slots either
  way.

**Requirement**: at least 3 of the eventual 6 subjects must be A/B.

**Classification timing**: performed only on the primary 6 candidates
_after_ the seeded draw has fixed them, and _before_ any extraction,
checks, or worthiness pass — classification looks only at whether/what a
Wikipedia article resolves to, never at nomination-document content.

**Proposed (not executed) deterministic fill procedure**: if fewer than 3
of the primary 6 are A/B, extend the SAME seeded shuffle order (not a new
seed) one candidate at a time, in the stratum that needs an A/B
replacement, substituting the most recently drawn candidate in that
stratum.

**Candidate cap semantics (corrected 2026-10-12, section 7's "Candidate cap
semantics")**: the single fixed cap below is not "10 additional draws
beyond the primary six" — it governs the **entire candidate-check
process**, both strata, start to finish. **The cap counts candidates
CHECKED (every candidate that undergoes a Gate 1/2/3 structural check,
regardless of outcome, consumes one slot), never subjects accepted and
never documents successfully parsed.** A candidate skipped at Gate 1
(`unfetchable-missing-file`) still consumes a slot; a candidate that passes
all gates and is accepted still consumes exactly one slot (not zero, and
not an extra one for having succeeded).

**Frozen cap value**: `CANDIDATE_CHECK_CAP = 10` (see
`enumeratePhiladelphiaFrame.ts`), frozen before any real structural check
runs. If the cap is exhausted before 3 of the primary 6 are A/B, this is
reported as a blocker, not silently relaxed. If the cap is exhausted before
both district-package slots are filled, see section 7A/§5
("Unfilled district stratum") — the cap is never extended post hoc in
either case.

## 7. Skip/redraw rules (frozen, extended 2026-10-12)

Valid, mechanically-determined skip reasons only:

| Reason code                                | Mechanical test                                                                                                                                                             | Gate                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `on-exclusion-list`                        | Address matches `PILOT_EXCLUSIONS.ts`                                                                                                                                       | pre-gate (section 2)      |
| `unfetchable-missing-file`                 | Document request/download fails outright                                                                                                                                    | Gate 1                    |
| `wrong-document-type-adapter-inapplicable` | The document's extracted text is missing the frozen, exact, mechanical form-identity marker for this form family (section 7A/§2 — NOT "headings parsed"/"claims extracted") | Gate 3                    |
| `duplicate-representation`                 | Same underlying resource already represented by another candidate in the draw                                                                                               | cross-candidate, any time |
| `district-entry-not-found`                 | The district package's own parsed resource list (same shape the eventual adapter produces) has no entry whose address or source-native ID exactly matches the candidate     | district stratum only     |
| `package-already-represented`              | A subject from this same district package has already been accepted into the district stratum                                                                               | district stratum only     |

**Not valid** skip reasons: scanned PDF, weak story, sparse claims, unknown
authorship, grounding difficulty, poor extraction yield, boring result,
"headings parsed successfully", "adapter produced usable blocks", "claim
extraction worked". Difficult parsing is not the same thing as wrong
document format. A scan-only document that is otherwise structurally
eligible stays in the six and counts as an acquisition loss, not a skip (see
section 8). Every skip must be logged with record ID (address), reason
code, and the structural evidence that produced it. For `district-entry-not-found`
and `package-already-represented`, logging additionally includes district
package identity and (for the latter) the previously-accepted candidate.

## 7A. Structural-check order (frozen 2026-10-12)

This order is binding before any real candidate check runs. Structural
checks are applied in the frozen seeded order (section 4), walking forward
through each stratum's candidate pool. No story content may be inspected
to decide eligibility at any gate.

**§1 — Gate 1, file retrieval.** If the qualifying source document cannot
be fetched at all: structural skip `unfetchable-missing-file`.
(`checkFileRetrievalGate` in `enumeratePhiladelphiaFrame.ts`.)

**§2 — Gate 2, text-layer presence.** Mechanical test: does the
`pdftotext -layout` extraction contain any non-whitespace character at
all? If not, classify `scan-only`. **This never skips the candidate** — it
remains eligible for sample selection; if selected into the final six it
stops at acquisition and counts as an acquisition loss (section 8).
Scan-only status must never be converted into an adapter-format exclusion.
(`classifyTextLayer` in `enumeratePhiladelphiaFrame.ts`.)

**§3 — Gate 3, adapter-form applicability.** Runs only for documents
classified `has-text-layer`. Uses exactly one frozen, mechanical,
source-native form-identity marker per form family — an exact verbatim
line, never "headings parsed successfully" / "adapter produced usable
blocks" / "claim extraction worked" as a proxy.

- **Individual-stratum marker (frozen, CONFIRMED)**: the exact line
  `"1. ADDRESS OF HISTORIC RESOURCE (must comply with an Office of
Property Assessment address)"` — confirmed present verbatim in the real
  2301 Fairmount Avenue extraction (`philadelphiaFormNominationAdapter.test.ts`'s
  `REAL_FORM_PAGE_EXCERPT`). `INDIVIDUAL_FORM_IDENTITY_MARKER` in
  `enumeratePhiladelphiaFrame.ts`.
- **District-package-stratum marker: NOT YET FROZEN.** No district-package
  nomination document has been acquired or inspected in this pilot, so no
  literal marker string can honestly be confirmed yet
  (`DISTRICT_PACKAGE_FORM_IDENTITY_MARKER` is `undefined`). This is an
  explicit, logged blocker: the real marker text must be observed and
  confirmed against the first real district-package candidate document the
  next task acquires, logged as its own entry, BEFORE it is applied as a
  pass/fail test to any other district candidate.
- Mismatch → structural skip `wrong-document-type-adapter-inapplicable`.
  (`checkFormIdentityMarker` in `enumeratePhiladelphiaFrame.ts`.)

**§4 — District-package eligibility: exact entry check.** For
district-package candidates only, additionally requires the district
package's own parsed resource list (the exact same `DocumentResource[]`
shape — address/`sourceNativeId` — the eventual multi-resource adapter
produces; see `documentEvidencePacket.ts`) to contain an entry whose
address (normalized: trim/uppercase/collapse-whitespace — not fuzzy) or
`sourceNativeId` exactly matches the candidate. Never geographic
containment alone, human narrative judgment, or fuzzy story/content
matching — this must use the same entry rule the eventual adapter relies
on, not a separate human eligibility test. No match → structural skip
`district-entry-not-found`, logged with candidate, package identity, and
the structural evidence inspected. (`checkDistrictPackageEntryMatch` in
`enumeratePhiladelphiaFrame.ts`.)

**§4b — One subject per district package.** Once one subject from a
district package has been accepted into the district stratum, any later
candidate from that same package is skipped: `package-already-represented`
— the evidence unit is the package, and two subjects from one document
would not be independent sample units. Logged with candidate, package
identity, and the previously-accepted subject from that package.
(`checkPackageAlreadyRepresented` in `enumeratePhiladelphiaFrame.ts`.)

**§5 — Unfilled district stratum.** If `CANDIDATE_CHECK_CAP` (section 6) is
exhausted before both district-package slots are filled: report the
district stratum as unfilled. Do not loosen the exact-entry requirement,
do not substitute individual-resource subjects, do not extend the cap post
hoc. This is itself a pilot finding. **Interpretation limit**: the district
stratum applies only to district packages with explicit source-native
resource entries — a null/unfilled result says nothing about packages
lacking such entry structure.

## 8. Scan handling

No OCR in this pilot. If ≥3 of 6 final subjects are scan-only, the pilot is
labeled **acquisition-dominated**, and this blocks treating any 3/6
pipeline-yield or 2/6 editorial-yield result as source-family performance
evidence — it would instead reflect acquisition-format luck.

**Frame-wide prevalence language — corrected 2026-10-12**: because the
register lacks bulk document-link/format metadata, this pilot can never
report an authoritative frame-wide scan-rate or format-exclusion rate for
the full 14,533-record Philadelphia Register — doing so would require a
document URL per candidate, and section 1 establishes that no such bulk
field exists. The only honest reporting the next task can do is:
**candidate-check observations** — the number of candidates actually
checked (bounded by `CANDIDATE_CHECK_CAP`), the number/percentage scan-only
among checked candidates, and structural skips among checked candidates by
reason. These must be explicitly labeled candidate-check observations, not
frame-wide counts, and must never be extrapolated to the full register.

**In this task specifically**: zero candidates have been checked (no
document was fetched to check format eligibility or run any gate), so
there are zero candidate-check observations to report yet — not a
frame-wide estimate of zero, simply nothing checked. The one document
already acquired for this experiment (2301 Fairmount Avenue) is an
excluded calibration subject, not a candidate-universe member, so it
cannot stand in for even one candidate-check observation. No individual
nomination-document URL was guessed to work around this — phila.gov
nomination-document paths observed so far (e.g.
`/media/20260518102954/2301-Fairmount-Ave-nomination-amended.pdf`) contain
an opaque timestamp with no visible derivation rule, so guessing one for an
unconfirmed address would not be a reliable structural check. Reported
honestly as a gap, not approximated.

## 9. Structural dry-run policy (frozen)

Exactly one dry run is allowed, before the eventual six's real extraction.
It must not call the extractor. Any fix it produces must respond only to a
generic structural failure (not a one-document special case), must be
documented before being applied, and must be followed by rerunning: the
2301 Fairmount calibration diagnostic, the unit test suites, and the
district calibration document's structural check (section 10) — before the
adapter freeze is committed and before the six's extraction begins.

**Three current adapter decisions frozen as-is for the duration of the six**
(may not change based on yield from the six):

1. No trailing-parenthetical heading normalization.
2. Page provenance = physical PDF page ordinal.
3. Unlabeled administrative content folds under the nearest preceding
   heading.

## 10. District calibration (frozen plan, NOT executed in this step)

Before the final six are drawn, one district-package calibration document
(outside the six) will be selected using the same deterministic/seeded
structural rule already frozen for the district stratum in this document —
applied to the district-package candidate pool, same seed, same stable
address-sort ordering, walking forward and applying the SAME structural
gates as section 7A (Gates 1-3, then the exact district-entry check, §4),
taking the first candidate in that shuffled order that actually passes
them — never simply "the first candidate in shuffled order" without the
gates. That selection, the structural-check evidence that qualified it, and
only that (not its narrative content), will be recorded as a calibration
exclusion before the final six are drawn. **Not selected or read in this
task** — selecting it now would require either running the real
candidate-check walk early (out of scope) or hand-picking a subject outside
the frozen procedure (not allowed). This is logged as the one remaining
prerequisite before the final six can be drawn.

## 11. Grounding rules (frozen)

Production normalization/grounding logic is unchanged and will not be
tuned during this pilot. Every OSM query's response and timestamp will be
stored alongside its claim. Human identity verification (confirming the
grounded place is really the nominated building) is required before a
subject counts toward pipeline yield — confirmation only, never manual
repair of a bad match. Shared/production module baseline pinned to commit
`18bba6ebc1042323109b7dc312f6066497702753`; no shared or production module
will be changed during the pilot.

## 12. Wikipedia input pinning (frozen plan)

For each of the eventual six subjects: the resolved article identity, the
resolution path (direct tag vs. Wikidata sitelink fallback, matching the
production mechanism), the revision ID/fingerprint, and the retrieval time
will all be recorded.

## 13. Story-bearing sentence labeling (frozen plan)

Before any extractor output is visible for a given subject's document,
story-bearing source sentences/blocks will be labeled under the existing
editorial model, creating a denominator for "story-bearing content present
but no claim emitted." The labeler must not see extractor output first (no
extractor-informed relabeling). Unit labeled: sentence-or-clause-level
blocks within the already-segmented `DocumentBlock`s. Storage: alongside
the document's evidence packet, as a simple array of block IDs marked
story-bearing. One human pass per subject (two only if the first pass is
ambiguous on a specific block, resolved by discussion, not overridden by
model output).

## 14. Primary pass and reruns (frozen plan)

One primary extraction → admission → angle pass per subject. Reruns are
permitted only for an infrastructure failure (e.g. a crashed process, not a
disappointing result), and must be logged with the reason. No best-of angle
selection. If any subject needs more than one angle-generation run for a
legitimate infrastructure reason, every run is reported, not just the kept
one.

## 15. Trust prior and sensitivity (frozen plan)

Primary trust prior = whatever is currently frozen in
`AUTHORSHIP_TRUST_PRIOR_FREEZE.md`. It will not be changed once the six
begin. One alternate-prior sensitivity analysis is frozen: unknown-authorship
narrative capability = `low` instead of `medium`, all else unchanged — run
only after primary outcomes are recorded, explicitly labeled a sensitivity
analysis, and not counted toward any success threshold. The authorship-prior
sensitivity counter (`assessAuthorshipPriorSensitivity`) will continue to be
reported per subject/claim as in Step 3A.

## 16. Success metrics (frozen)

- **Pipeline yield**: a subject counts only if it has ≥1 AUTO-ADMIT claim,
  passes deterministic grounding, passes human identity verification, and
  passes `evaluateDiscoveryWorthiness`. Primary floor: **≥3/6**. Any
  subject lost at a shared pipeline stage (grounding, worthiness, checks)
  is reported as inconclusive for that stage, distinct from a subject lost
  because the source-native extractor found nothing usable (reported as
  "not viable" for this source family specifically). 3/6 is not a
  population-rate estimate — it is a bounded pilot-sample outcome.
- **Editorial yield**: angle eligibility = deterministic grounding + ≥1
  AUTO-ADMIT claim (no ≥2-claim gate). Floor: **≥2/6** accepted, worthwhile
  perspective shifts, with ≥1 drawn from the weak/absent-Wikipedia (A/B)
  group. "Worthwhile" = Stage 2 acceptance **and** Sarah's independent
  judgment, given _before_ she sees the aggregate counts. Each angle also
  records whether its central claim already existed in the subject's own
  Wikipedia material. Category D (rich Wikipedia content the extractor
  missed) is recorded as a shared-extractor limitation, never credited as
  a preservation-source win.

## 17. Portability tests (deferred — post-six work only, NOT run yet)

Representation portability (NYC, Chicago, Omaha/Nebraska, Nevada) and
parser portability (≥2 jurisdictions on standardized NRHP forms) are both
explicitly deferred past the six-subject pilot. Before either is run, the
unit under test must be explicitly defined (the shared segmenter/role-mapper/
projection core, vs. a dedicated Philadelphia-form adapter) — one
Philadelphia adapter parsing unrelated municipal formats must never be
claimed.

## 18. Reporting commitment

Every draw, every candidate considered, every skip and its reason, all six
subjects, all acquisition outcomes, all stage losses, all reruns, all
primary angle runs will be reported. No post-hoc subject drops, no
post-hoc strata changes.
