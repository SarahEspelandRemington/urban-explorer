# Step 6B — Philadelphia Official-Surface Document-Resolution Preregistration

Experimental, offline, non-production. This document freezes the acquisition
procedure for an 8-candidate experiment that tests ONE narrow question:
**given a Philadelphia Register of Historic Places resource address and its
`idesigdate1` designation date, can the exact nomination/designation document
be deterministically located using only the two declared official
Philadelphia surfaces, with no fuzzy matching, no general web search, and no
human discretionary steps?**

This is explicitly NOT a continuation of the six-subject preservation pilot.
It does not read narrative prose, extract claims, run packet admission,
trust, worthiness, or angle generation, and it does not resume or amend
`PILOT_PREREGISTRATION.md` / Step 6 / Step 6A. Candidate #1 is not run in
this task — this document freezes the procedure only.

---

## 1. Experimental question (acquisition-shape only)

Is the frozen two-surface Philadelphia resolver (PHC Recent Nominations
index + ArcGIS/CARTO `idesigdate1` identity metadata) a **thin adapter**, a
**detective-work/inference-heavy** procedure, or **coverage-limited**, when
used to deterministically resolve individual-resource nomination documents?
See section 11 for the frozen interpretation table.

Explicitly excluded from this question: narrative reading, claim
extraction, packet admission, trust changes, worthiness, angle generation,
OCR, general web search, fuzzy/LLM-assisted acceptance, or continuing the
six-subject pilot.

---

## 2. Sample size and candidate-universe era split (descriptive only)

**Frozen N = 8**, composition: **6 in-window + 2 pre-window** experimental
candidates, where "window" means the candidate's `idesigdate1` year falls
inside the PHC Recent Nominations index's own declared coverage (confirmed
2017–2026 — see section 5A).

### Universe split (computed before any draw; does not alter the 6+2 quota)

Base: `individualCandidatePool` from `philadelphiaFrameEnumeration.json`
(`individualCandidatePoolSize = 5721`, i.e. the 13-address `PILOT_EXCLUSIONS`
already applied), minus the 5 Step 6A addresses (section 3) = **5716**
candidates.

Joined against a bulk CARTO SQL query
(`SELECT DISTINCT loc, idesigdate1 FROM historic_sites_philreg WHERE
idesigdate1 <> ''`, 5512 distinct `(loc, idesigdate1)` rows, one-time shared
surface cost — see section 7) by exact `normalizeAddressForExactMatch`
(trim → uppercase → collapse whitespace), same rule already frozen in
`enumeratePhiladelphiaFrame.ts`:

**Frozen pre-sampling treatment for conflicting designation-year records**
(added on RC review, before any draw): a candidate whose official identity
records (the bulk ArcGIS/CARTO `idesigdate1` join) contain 2+ distinct
usable years for the same normalized address is classified
**`designation-year-conflict`** — excluded from BOTH the in-window and
pre-window draw strata, reported descriptively only, and never reconciled
or resolved to a single chosen year. This is a 4th, mutually exclusive
category alongside in-window/pre-window/unresolvable, not a sub-case of
either.

| Category                      | Count    | Definition                                                                                                                  |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| In-window                     | **28**   | Exactly one usable `idesigdate1` year, 2017–2026                                                                            |
| Pre-window                    | **5228** | Exactly one usable `idesigdate1` year, before 2017                                                                          |
| Designation-year-unresolvable | **432**  | No exact-normalized-address match found against the bulk ArcGIS/CARTO `idesigdate1` data at this bulk-check stage           |
| Designation-year-conflict     | **28**   | 2+ distinct usable `idesigdate1` years recorded for the same normalized address — excluded from both strata, not reconciled |
| **Total**                     | **5716** | Mutually exclusive, sums to the frozen candidate universe                                                                   |

**Verification note (RC review):** the 28 conflict-category records were
NOT a separate, previously-uncounted population — they were already present
inside the originally-reported 36/5248/432 three-bucket split, silently
folded in by an "any usable year wins" rule (8 records folded into the
reported 36 in-window count — true in-window is 36 − 8 = 28; 20 records
folded into the reported 5248 pre-window count — true pre-window is
5248 − 20 = 5228; 0 records folded into the unresolvable count, which is
unaffected at 432). The corrected table above is the mutually exclusive
breakdown; 28 + 5228 + 432 + 28 = 5716, matching the frozen candidate
universe exactly.

Distinct addresses behind the 28 conflict records: 22 (6 addresses each
contribute 2 duplicate `individualCandidatePool` records). Example years
recorded: `2041-55 CORAL ST` → `[2000, 3000]` (the latter an apparent
data-entry error), `2101 W CLARKSON AVE` → `[1956, 2000, 2017]`. This is a
real data-quality property of the `historic_sites_philreg` surface itself,
not a resolver bug. If a `designation-year-conflict` candidate is ever
drawn in a future step, its conflicting years must be reported per-candidate,
never silently resolved by picking one.

The 432 "unresolvable at bulk-check stage" and 28 "conflict" candidates are
**excluded from both draw strata** (they cannot be deterministically
assigned to in-window or pre-window) but remain in the reported universe
count per the instruction to report this split descriptively. Per the
frozen rule: **a pre-window candidate that unexpectedly resolves to a real
document during acquisition is a finding, not an error** — the bulk split
above is a planning input for stratified sampling, not a prediction frozen
into the acceptance logic.

---

## 3. Disjointness: seed, exclusions, pre-shuffle counts

- **Step 6B seed (new, distinct from pilot seed)**:
  `d3ef26497ea6e74cd20a0bb72583f8b2f6e8c288` (the Step 6A checkpoint commit
  SHA — current HEAD at freeze time, same seed-sourcing convention as the
  pilot's own seed being a checkpoint commit SHA, but a different commit).
  Pilot seed (`18bba6ebc1042323109b7dc312f6066497702753`) is NOT reused.
- **Exclusion set (18 addresses total, applied before the draw)**:
  - The 13 addresses already in `PILOT_EXCLUSIONS.ts` (already baked into
    `individualCandidatePool`'s stored 5721 count).
  - Plus 5 addresses newly excluded for Step 6B (already touched in Step
    6A): `702 CAPTAINS WAY`, `511 KAUFFMAN ST`, `305 ADMIRALS WAY`,
    `105 ADMIRALS WAY`, `3414 BARING ST`.
- **Exact pre-shuffle candidate counts** (per stratum, after all 18
  exclusions AND after excluding the 28 `designation-year-conflict`
  records per the frozen treatment in section 2): in-window stratum =
  **28**, pre-window stratum = **5228**.
- **Exact deterministic shuffle algorithm** (identical mechanism to the
  pilot, reused verbatim — `stableSortByAddress()` then
  `seededShuffleOrder()` from `enumeratePhiladelphiaFrame.ts`): within each
  era stratum independently, candidates are first stably sorted by address
  (ascending plain-string comparison), then shuffled via FNV-1a(seed) →
  mulberry32 → Fisher-Yates using the Step 6B seed above. The draw walks
  each stratum's shuffled order from the front, taking the first candidates
  that resolve to a terminal non-`request-cap-exhausted` outcome, until 6
  (in-window) / 2 (pre-window) are drawn. **No candidates are drawn in this
  task** — this section freezes the mechanism only.

---

## 4. Declared official surfaces (frozen, exhaustive)

- **Primary (document-resolution surface)**: PHC Recent Nominations index —
  `https://www.phila.gov/departments/philadelphia-historical-commission/recent-nominations-to-the-philadelphia-register-of-historic-places/`.
- **Supporting (identity/designation-metadata only, never a document
  source)**: ArcGIS FeatureServer `Historic_sites_PhilReg` and its CARTO SQL
  mirror `historic_sites_philreg` (fields used: `loc`, `idesigdate1`).
- **Out of scope**: general web search, the opaque Swiftype-backed
  phila.gov site search, email/records requests, undeclared archives, or
  manual sleuthing.

---

## 5. Two reconnaissance facts, now resolved

### 5A — Index "year" semantics

**Finding (empirically confirmed by the one available control, not asserted
as independently guaranteed by the page's own wording):** the Recent
Nominations page's year-section (`H3`) grouping and displayed "Date" column
align with `idesigdate1`. Evidence: 2301 Fairmount Ave's displayed Date
("October 14, 2022") exactly matches its ArcGIS `idesigdate1`
("10/14/2022") to the day, and the row sits structurally inside the "2022
nominations" `H3` section. The page's own intro text ("This page collects
the individual nominations for properties that have recently been added to
the register... For older nominations, contact the Historical Commission
staff") frames the page around register-addition (designation) outcomes,
consistent with but not literally using the word "designation." **Frozen
navigation rule: treat the index's year-section/Date basis as equivalent to
`idesigdate1`, confirmed by one control, not by independent documentation.**
Coverage window: H3 sections confirmed present for 2026 down to 2017
(10 sections) — this is the frozen window boundary used in section 2.

### 5B — Index row / multi-resource structure

**Finding (confirmed via raw HTML inspection, no narrative prose read):** a
single index row/title CAN represent multiple distinct resources/addresses.
Real confirmed examples from the raw page: "29 and 31 W. Bells Mill Rd.",
"580 Pelham Rd. and 333 W. Upsal St.", "1631, 1633, and 1635 Francis St.",
"2008 and 2010 Chestnut St.", "4949 and 4951 Walnut St.", "234 and 240
Hermitage St.", "1400, 1406-18, and 1420 S. 3rd St.", "2095 and 2100 E.
Willard St.", "4500 and 4506 Tyson Ave.", "319 N. 19th St. and 312 N. 18th
St.", "807-11 Bainbridge St. and 620-24 S. 8th St.", and
"5901-13 and 5915-41 Germantown Ave.; 61-71 and 73 E. Haines St." (four
distinct address groups in one row) — contrasted with clean single-address
rows (e.g. "2301 Fairmount Ave. nomination"). **Frozen rule: any row
containing multiple resources/addresses is ambiguous for Tier 2 unless Tier
1 identity (an exact source-native/register ID in the document's own
identification field) independently resolves which resource within the row
is the candidate.**

### Side structural finding — no real pagination barrier

The index page's "Previous/Next" controls (`class="pagination-wrapper
no-js"`, `href="#"`) are a dead, client-side-only, no-JS-fallback widget —
not a real pagination mechanism. A single plain HTTP GET of the page
retrieved all 317 nomination rows across all 10 year-sections (2017–2026)
in one static response. **Frozen: the entire Recent Nominations index is a
one-time, single-request shared surface fetch — no per-candidate pagination
requests are needed.** Likewise, the full `(loc, idesigdate1)` ArcGIS/CARTO
dataset was retrieved in one bulk SQL query. Both are one-time shared-surface
costs, counted once in the session ledger (section 7).

---

## 6. Acceptance normalization (exact, frozen)

- **Strict (acceptance-grade) normalization**: `trim → uppercase → collapse
internal whitespace` (identical to `normalizeAddressForExactMatch()` in
  `enumeratePhiladelphiaFrame.ts`). No street-type expansion
  (ST↔STREET), no punctuation/spelling repair, no historic/current-address
  substitution, no fuzzy matching. Two strings must be byte-identical after
  this transform to count as a match for any tier or acceptance decision.
- **Diagnostic-only normalization** (logged only; can NEVER accept a
  document or upgrade a tier): strict normalization, THEN expand a small
  frozen table of common street-type abbreviations to their full form —
  `ST→STREET`, `AVE→AVENUE`, `RD→ROAD`, `BLVD→BOULEVARD`, `DR→DRIVE`,
  `LN→LANE`, `PL→PLACE`, `CT→COURT`, `PKWY→PARKWAY`, `SQ→SQUARE`,
  `TER→TERRACE`, `HWY→HIGHWAY`, `CIR→CIRCLE` — applied only as a trailing
  whole-token replacement. If two addresses become identical only after
  this diagnostic expansion (and not under strict normalization), log a
  `strict-normalization-near-miss` diagnostic note on that candidate's
  ledger entry. This note is purely descriptive, same spirit as the Step 5
  "144 BREAD ST" vs "144 BREAD STREET" finding.

---

## 7. Request limits and cost ledger (frozen)

- **Per-candidate cap**: max 5 network requests.
- **Session cap**: max 60 total network requests for the main Step 6B run,
  including the known-answer control.
- **Rate limit**: no faster than 1 request/second to the same official host.
- **Shared/cached surface responses** (the one Recent Nominations full-page
  fetch; the one bulk ArcGIS/CARTO `idesigdate1` query) count **once** in
  the session ledger when first fetched, and do not count again when reused
  locally for another candidate.
- **Per-resource marginal cost** (counted against the per-candidate cap):
  typically a liveness check (HEAD) of the matched document URL, plus — only
  when identification-layer evaluation is required for a Tier 1/2
  decision — one GET of the candidate document itself.
- Retries must stay inside both caps; a cap is never extended to rescue a
  candidate.

### Per-resource ledger fields (frozen, recorded for every drawn candidate)

Final outcome code; evidence tier; official surfaces queried; marginal
network-request count; one-time shared-surface requests used (0 if already
charged to an earlier candidate this session); candidate documents
compared; exact identifier available (Y/N); discretionary steps required
(Y/N); strict-normalization near-miss diagnostic (Y/N); human identity
spot-check result; new resolver-rule type encountered (if any — logged to
an ordered rule-type list, never implemented in Step 6B).

---

## 8. Designation metadata (frozen)

Primary frozen field: `idesigdate1` (ArcGIS alias `IDesigDate11`). Never use
`idesigdate2` for inclusion/navigation — Step 6B0 found no evidence it
represents the relevant individual designation date, only that it exists as
a second slot. If `idesigdate1` is absent/unusable for a candidate →
`designation-year-unresolvable`; the year is never inferred from the PRHP
raw-text date token (corroborating-only, per section-2 side note) or any
other source.

---

## 9. Evidence tiers (frozen)

- **Tier 1**: the index directly links the document (the row's
  `data-href`/title link resolves to a live document URL), OR an exact
  source-native/register ID appears in the document's own identification
  field. Document inspection for Tier 1 is limited to identification/
  structural metadata only — no narrative reading.
- **Tier 2**: accept only when ALL of the following hold: exact normalized
  address match; exact normalized resource name/title match; a unique
  inventory resource exists at that address; the index row/document
  represents a single resource (not a multi-address row per section 5B);
  no conflicting identifier; the identification layer is evaluable.
  Scan-only documents can never qualify as Tier 2 (or Tier 1 beyond a bare
  ID match — see Amendment A principle, section 10).

---

## 10. Outcome taxonomy and frozen precedence order

Ten frozen outcome codes, checked in this exact order per candidate (first
match wins):

1. **`designation-year-unresolvable`** — `idesigdate1` absent/unparseable on
   the authoritative ArcGIS/CARTO surface. Checked first: without a
   designation year there is no year to navigate by, and this is a
   structural precondition independent of coverage-window status.
2. _(Index search is attempted — against the single already-fetched index
   page content, searching all year-sections, not just the candidate's own
   year, so an unexpected pre-window resolution remains possible per
   section 2.)_ **`surface-infrastructure-failure`** — any attempted
   request against a declared surface fails for a non-content reason
   (5xx/timeout/DNS/malformed response) before a terminal outcome is
   reached. Checked before request-cap-exhaustion so infra failure is never
   conflated with a legitimately-spent budget.
3. **`request-cap-exhausted`** — the per-candidate (5) or session (60)
   request cap is reached before a terminal outcome, with no infra failure
   explaining the stoppage.
4. If the search completes within budget and finds no matching row:
   - **`unavailable-via-declared-self-service-surfaces`** if the candidate
     is pre-window (coverage-window loss — never conflated with a genuine
     same-surface search failure).
   - **`no-exact-match-on-declared-surface`** if the candidate is in-window
     (a genuine resolver-level miss, since the surface does cover this
     era).
5. If the search finds row(s):
   - **`ambiguous-multiple-candidates`** — multiple distinct,
     non-disambiguable candidate rows/documents match.
   - **`ambiguous-identifier-conflict`** — a single candidate row matches
     but carries conflicting identifiers.
   - **`resolved-document-not-evaluable-scan-only`** — a single,
     unambiguous match whose document is scan-only (Amendment A principle:
     acquisition/evaluation loss, not silent success, and not conflated
     with "no document was found at all").
   - **`resolved-tier-1`** — Tier 1 criteria met.
   - **`resolved-tier-2`** — Tier 2 criteria met.

This order preserves all five required semantic separations: out-of-window
coverage ≠ no-exact-match (step 4 splits on window status before coding a
miss); missing designation year ≠ coverage-window loss (step 1 fires before
step 4 could ever be reached); request-budget exhaustion ≠ infrastructure
failure (steps 2 and 3 are distinct and ordered); infrastructure failure ≠
evidence of document absence (step 2 fires before any absence-coded
outcome); scan-only follows Amendment A (step 5's scan-only code is
distinct from both "no match" and "ambiguous").

---

## 11. Interpretation table (frozen before candidate #1)

| Shape                              | Condition                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Thin adapter**                   | ≥4/6 in-window resolve Tier 1/2, zero discretionary steps, ≤1 unresolved in-window candidate whose only issue is the strict-normalization rule |
| **Detective-work/inference-heavy** | ≥3/6 in-window would require a new exception/fuzzy rule/discretionary interpretation to resolve                                                |
| **Coverage-limited**               | ≥4/8 total unavailable via declared surfaces (report known pre-window coverage separately so this is not mistaken for resolver failure)        |
| **Mixed**                          | No single condition above dominates, or multiple shapes materially contribute                                                                  |

These are architecture-shape labels, not population-rate estimates. The
known-answer control (2301 Fairmount Ave) is outside N=8 and never counted
toward these thresholds — it only verifies the frozen resolver reproduces a
known-correct result.

---

## 12. Reproducibility check (frozen, outside N=8 and main-run interpretation)

≥24 hours after the main run, rerun the exact frozen procedure (no rule
changes) for the first 2 accepted in-window experimental subjects (or all
accepted in-window subjects if fewer than 2 accepted). Record whether the
same official document identity/outcome is reproduced. Outside N=8 and
outside main-run interpretation counts.

---

## 13. Future pilot implication (recorded, not acted on)

If this resolver later becomes the retrievability gate for the preservation
pilot and only the declared Recent Nominations coverage window (2017–2026)
is mechanically reachable, the individual-resource pilot frame becomes "
in-window individual resources," and results cannot be generalized to older
nomination documents. The pilot is not amended or resumed in this task.

---

## 14. Shared accept-policy ownership (frozen)

The Philadelphia resolver reports candidate URLs/IDs, source surface, exact
matched strings, and structural identity evidence — it stops at document
identity. The shared Step 6B policy (this document, sections 9–10) assigns
evidence tier and final acquisition outcome. Neither invokes packet claim
extraction, trust, admission, worthiness, or angle generation.
