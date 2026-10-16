# Step 6D2 — Corrected Replay Results (walkMode:true observation surface)

Baseline commit: `188620b4a27d2de9ee43977b48b95edb49d0d2b5`
Preregistration: `STEP_6D_PREREGISTRATION.md` (`ac0af0f`, unchanged)
Amendment: `STEP_6D2_AMENDMENT.md` (unchanged)
Original (invalid-surface) run: `STEP_6D_RESULTS.md` / `step6dResultLog.json` — preserved, not edited.

**Audited classification correction (2026-10-16)**: a read-only audit of this
file's original classification accounting found that `way/1356166516`
("The Korean United Methodist Church") had been placed in an ad-hoc
`bridge-check-incomplete` state despite its Wikidata P649 route having
actually been checked and confirmed absent. This file and
`step6d2ResultLog.json` were corrected in place to reflect: a single
reclassification to `checked-no-NRHP-claim`; removal of
`bridge-check-incomplete` as a candidate class (replaced by a separate,
non-class "indeterminate bridge completeness" flag for the remaining 53
Bethlehem/Jim Thorpe candidates); and an updated robustness-check denominator
(106 → 107, ~0.94% → ~0.93%). No new discover/Overpass/Wikidata/NPS calls
were made to produce this correction — see Section 8 for full detail. All
other reported results (bridgeable count = 1, overall joinability ≈ 0.625%,
individual-listing share = 0/160 lower bound, frozen low-joinability
interpretation, and text-layer-probe-gate-not-reached) are unchanged.

## 0. Preconditions

- HEAD was exactly `188620b4a27d2de9ee43977b48b95edb49d0d2b5`.
- Tracked tree was clean.
- `git diff HEAD` on both `STEP_6D_PREREGISTRATION.md` and `STEP_6D2_AMENDMENT.md` was empty.
- Only previously-known unrelated untracked artifacts remained.

All preconditions passed.

## 1. Production/runtime identity

Confirmed via `render deploys list` **before** any call: live deploy commit
`f467483c76d4714fd8d0d8d3924a521a81ac7330` (deploy `dep-db425gmq1p3s73eo7ctg`,
status `live`) — identical to the original Step 6D run; no new deploy
occurred between the two runs.

## 2. Exact corrected requests

All four: `POST https://urban-explorer-ihsy.onrender.com/api/explore/discover`,
body `{"latitude": <centroid lat>, "longitude": <centroid lon>, "radius": 1000, "mode": "full", "osmAnchor": true, "walkMode": true}` — identical to the original run plus `walkMode: true`.

| Area                    | Centroid          | Timestamp (UTC)      | HTTP status | Bytes | SHA-256                                                            | Raw file                                             |
| ----------------------- | ----------------- | -------------------- | ----------- | ----- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| Fairmount/Spring Garden | 39.965, -75.1675  | 2026-10-15T23:14:15Z | 200         | 46780 | `a8eed5ba60e7c6ed00cc408346cc13dcf8a7211c777fcc2175f391544db3dfb2` | `step6d2-artifacts/discover_fairmount_walkmode.json` |
| Midtown Manhattan       | 40.7595, -73.9955 | 2026-10-15T23:14:29Z | 200         | 42527 | `5712e3962e7ee07e2d3df81c7cdc5d495d98432174c060114a9d38a44665d44d` | `step6d2-artifacts/discover_midtown_walkmode.json`   |
| Bethlehem, PA           | 40.625, -75.380   | 2026-10-15T23:14:48Z | 200         | 31989 | `b0829e978eda0a123ac0200ca2b5bbc3bb92a006d25e510cea6e0e32224bf9f9` | `step6d2-artifacts/discover_bethlehem_walkmode.json` |
| Jim Thorpe, PA          | 40.875, -75.730   | 2026-10-15T23:15:03Z | 200         | 4282  | `9c0ede2f010d3ee1130a6a58c3603db0de690a28bc468e24a2dedf671fc571cd` | `step6d2-artifacts/discover_jimthorpe_walkmode.json` |

## 3. Tier distribution per area (Walk-mode survivors)

| Area                    | Total survivors | Tier None | Tier 1 | Tier 4  | `emptyReason`    |
| ----------------------- | --------------- | --------- | ------ | ------- | ---------------- |
| Fairmount/Spring Garden | 68              | 14        | 6      | 48      | none (non-empty) |
| Midtown Manhattan       | 68              | 8         | 2      | 58      | none (non-empty) |
| Bethlehem, PA           | 51              | 3         | 1      | 47      | none (non-empty) |
| Jim Thorpe, PA          | 7               | 0         | 0      | 7       | none (non-empty) |
| **Total**               | **194**         | **25**    | **9**  | **160** |                  |

**Root-cause hypothesis fully confirmed**: under the original (non-walkMode)
observation surface, all four areas showed 0 Tier-4 places; under the
corrected (`walkMode:true`) surface, the identical underlying candidate
pools surface **160 Tier-4 places total** — the exact population
`filterExploreTier4` was stripping. Jim Thorpe, which previously returned
`emptyReason: "filtered_for_quality"` with 0 places, now returns all 7 of
its candidates, all Tier 4.

**Explicit scope statement (required by the amendment, Section 9)**: this
measured population is **"thin candidates among Walk-mode survivors,"
not all upstream candidates** — `filterGenericCommercial` and the earlier
pipeline filters (denylist, residential filter, commercial-use filter,
radius filter, denied-places/interpretive-overlay filter) still run
unconditionally regardless of `walkMode`. `walkMode:true` only bypasses
`filterExploreTier4`.

## 4. Thin-candidate counts (frozen predicate applied exactly)

`discoveryTier === 4 && (discoveryRejectionReason === "placeholderFallback" || discoveryRejectionReason === "metadataOnly")`

| Area                    | Thin count | `placeholderFallback` | `metadataOnly` |
| ----------------------- | ---------- | --------------------- | -------------- |
| Fairmount/Spring Garden | 48         | 46                    | 2              |
| Midtown Manhattan       | 58         | 49                    | 9              |
| Bethlehem, PA           | 47         | 35                    | 12             |
| Jim Thorpe, PA          | 7          | 6                     | 1              |
| **Total**               | **160**    | **136**               | **24**         |

All 160 thin candidates carry an `osmId` (none are `streetlit`-owned).

## 5. OSM `ref:nrhp` bridge (Overpass) — partial completion, honestly reported

Per the frozen procedure: one batched Overpass request per area, four-request
cap, max 1 req/sec, `https://overpass-api.de/api/interpreter`, `out tags;`
only.

| Area                    | Request timestamp (UTC) | HTTP status | Bytes | SHA-256                                                            | Elements returned   |
| ----------------------- | ----------------------- | ----------- | ----- | ------------------------------------------------------------------ | ------------------- |
| Fairmount/Spring Garden | 2026-10-15T23:17:01Z    | 200         | 21239 | `153335dc1a6754a801086d7367bbb06a920c52efadc730f6db269c20ca8854f1` | 61                  |
| Midtown Manhattan       | 2026-10-15T23:17:39Z    | 200         | 29704 | `4ee76b8367f594872037a8d03539aab1f0f4c98bd055df2935314c757e60d138` | 66                  |
| Bethlehem, PA           | 2026-10-15T23:18:20Z    | **502**     | 534   | `8084e21e11df846a2e41bb93ddaf66961aa2ef71e9a9fc1f46debc960b303042` | 0 (gateway timeout) |
| Jim Thorpe, PA          | 2026-10-15T23:18:22Z    | **502**     | 534   | `8084e21e11df846a2e41bb93ddaf66961aa2ef71e9a9fc1f46debc960b303042` | 0 (gateway timeout) |

Bethlehem and Jim Thorpe returned `# 502 Gateway Timeout — This Overpass API
server is currently at capacity` — a genuine, transient public-endpoint
failure, not a client-side error. **Per the frozen "one Overpass request per
area maximum... no retries" rule, these were not retried.** The raw error
bodies were still saved and hashed per the frozen storage requirement.

**Consequence**: the OSM `ref:nrhp` bridge is **confirmed clean (checked,
absent) for Fairmount and Midtown only.** For Bethlehem and Jim Thorpe, the
OSM side of the bridge is **unconfirmed**, not "confirmed absent" — this
materially affects classification for those two areas (Section 7).

`ref:nrhp` found among the 127 successfully re-fetched elements
(Fairmount 61 + Midtown 66): **0.**

## 6. OSM drift check (Fairmount + Midtown only — the only areas with Overpass data)

Compared Overpass-returned `wikidata` against the stored discover response's
`osmTags.wikidata`, for every element where either side carried a value:

| Area                    | Elements compared | Mismatches |
| ----------------------- | ----------------- | ---------- |
| Fairmount/Spring Garden | 2                 | 0          |
| Midtown Manhattan       | 13                | 0          |

**No drift/staleness found.** No element needed to be marked stale.
Bethlehem and Jim Thorpe have no Overpass data to compare against, so the
drift check was **not performed** for those two areas (distinct from "0
drift found" — it is "not checked").

## 7. Wikidata P649 bridge

10 distinct thin candidates (across all 4 areas) carry a `wikidata` OSM tag.
All 10 QIDs fit in a single batched `wbgetentities` request (well under the
50-QID/request, 20-request-total caps).

|                         |                                                                    |
| ----------------------- | ------------------------------------------------------------------ |
| Request timestamp (UTC) | 2026-10-15T23:20:48Z                                               |
| Endpoint                | `https://www.wikidata.org/w/api.php?action=wbgetentities`          |
| HTTP status             | 200                                                                |
| Bytes                   | 194674                                                             |
| SHA-256                 | `db5a75d4d1c8d52717d24e6aab9277b1cd61a2b1e371848b6e7f88f732cdd65c` |
| Raw file                | `step6d2-artifacts/wikidata_batch1.json`                           |
| QIDs requested          | 10                                                                 |
| Requests used of 20-cap | 1                                                                  |

Current-P649 filtering (deprecated rank / `P582` end-time qualifier
excluded) result:

| QID          | Thin candidate                                        | Area        | Current P649?                     |
| ------------ | ----------------------------------------------------- | ----------- | --------------------------------- |
| Q2989707     | Community College of Philadelphia                     | Fairmount   | No                                |
| Q6749290     | Manhattan Plaza                                       | Midtown     | No                                |
| Q164980      | Playwrights Horizons                                  | Midtown     | No                                |
| Q7777417     | Theatre Row                                           | Midtown     | No                                |
| Q5489525     | Upright Citizens Brigade Theatre                      | Midtown     | No                                |
| Q45101703    | Producers Club Theaters and Bar                       | Midtown     | No                                |
| Q6825053     | Metropolitan Community Church                         | Midtown     | No                                |
| Q564793      | Jacob K. Javits Convention Center                     | Midtown     | No                                |
| **Q7712319** | **Congregation Ezrath Israel** (`way/265322610`)      | **Midtown** | **Yes — `05000445`**              |
| Q132068776   | The Korean United Methodist Church (`way/1356166516`) | Bethlehem   | No — checked and confirmed absent |

Exactly **one** current, genuine NRHP bridge found: `way/265322610`
("Congregation Ezrath Israel", `alt_name: The Actors Temple`,
`wikipedia: en:The Actors' Temple`) — Midtown Manhattan, `discoveryRejectionReason: placeholderFallback`.

**Resource-type check (class 2 vs. 3 vs. 4)**: inspected this entity's full
claim set (`P31` = `Q34627`, a building/institution type, not a listing-type
statement; `P1435` = `Q19558910`, a generic heritage-designation value with
no explicit individual-vs-district qualifier; no `P361` "part of" claim
present at all). **No explicit Wikidata statement names the resource type
as specifically an individual listing or a district/contributing
property.** Per the frozen precedence, this resolves to class 4:
**`unlabeled-bridged`**, not class 2.

## 8. Classification (frozen precedence, applied exactly)

**Audited correction (2026-10-16, applied to this file and
`step6d2ResultLog.json`)**: a read-only audit found that `way/1356166516`
("The Korean United Methodist Church", Bethlehem) carries a Wikidata QID
(`Q132068776`) for which P649 **was actually fetched and confirmed absent**
in the batched Wikidata call (Section 7) — independent of the Bethlehem
Overpass 502 failure, which only left its _OSM-side_ `ref:nrhp` status
unconfirmed. Per the frozen class definitions, a confirmed-absent checked
Wikidata route is sufficient for `checked-no-NRHP-claim`; it does not require
the OSM side to also be confirmed. This candidate is therefore reclassified
from the ad-hoc incomplete state to `checked-no-NRHP-claim`. The ad-hoc
`bridge-check-incomplete` label has been **removed as a candidate class**
throughout. The remaining 53 Bethlehem/Jim Thorpe thin candidates (46 + 7)
have neither a valid confirmed OSM `ref:nrhp` nor any Wikidata QID at all
(`wikidata_tag: null`) — per audit rule 2, a `no-bridge` classification
requires a _confirmed_ absence of an OSM identifier, which the Overpass 502
never established for them, so they cannot honestly be `no-bridge` either.
They are recorded as an **indeterminate bridge-completeness flag** — a
bridge-completeness/execution-status marker, not one of the six frozen
candidate classes — alongside the existing Overpass 502/not-retried status.

| Area                    | `ambiguous` | `individual-listing-bridged` | `district-associated-bridged` | `unlabeled-bridged` | `checked-no-NRHP-claim` | `no-bridge` | Indeterminate bridge completeness (not a class) |
| ----------------------- | ----------- | ---------------------------- | ----------------------------- | ------------------- | ----------------------- | ----------- | ----------------------------------------------- |
| Fairmount/Spring Garden | 0           | 0                            | 0                             | 0                   | 1                       | 47          | 0                                               |
| Midtown Manhattan       | 0           | 0                            | 0                             | 1                   | 7                       | 50          | 0                                               |
| Bethlehem, PA           | 0           | 0                            | 0                             | 0                   | 1                       | 0           | 46                                              |
| Jim Thorpe, PA          | 0           | 0                            | 0                             | 0                   | 0                       | 0           | 7                                               |
| **Overall**             | **0**       | **0**                        | **0**                         | **1**               | **9**                   | **97**      | **53**                                          |

All six frozen classes plus the indeterminate flag sum to 160 (the full thin
population): 0+0+0+1+9+97+53 = 160.

Join-method split among the bridged (non-incomplete, non-no-bridge,
non-checked-no-NRHP-claim) candidates — i.e. the 1 `unlabeled-bridged`
candidate:

| OSM only | Wikidata only | Both |
| -------- | ------------- | ---- |
| 0        | 1             | 0    |

No OSM/Wikidata conflict occurred (no candidate had both a valid OSM
`ref:nrhp` and a valid current P649 — the one bridged candidate's OSM side
was confirmed absent, not conflicting).

## 9. Metrics — per area and overall

| Metric                                                      | Fairmount               | Midtown          | Bethlehem                       | Jim Thorpe              | **Overall**                                         |
| ----------------------------------------------------------- | ----------------------- | ---------------- | ------------------------------- | ----------------------- | --------------------------------------------------- |
| 1. Thin-candidate count                                     | 48                      | 58               | 47                              | 7                       | **160**                                             |
| 2. Bridgeable count (classes 2–4 + ambiguous)               | 0                       | 1                | 0 (+46 indeterminate)           | indeterminate           | **1** (+53 indeterminate, excluded from this count) |
| 3. Joinability (bridgeable/thin)                            | 0%                      | 1.72%            | 0% confirmed (46 indeterminate) | indeterminate           | **0.625%** (1/160, literal frozen formula)          |
| 4. Individual-NRHP share among all thin                     | 0%                      | 0%               | 0% confirmed (46 indeterminate) | indeterminate           | **0%** (0/160)                                      |
| 5. Individual-NRHP share among bridgeable thin              | undefined (0/0)         | 0% (0/1)         | undefined (0/0 confirmed)       | indeterminate           | **0%** (0/1)                                        |
| 6. Class split                                              | see Section 8           |                  |                                 |                         |                                                     |
| 7. Join-method split                                        | —                       | Wikidata-only ×1 | — (0 confirmed bridges)         | indeterminate           | **Wikidata-only ×1**                                |
| 10. Drift/staleness count                                   | 0 (2 compared)          | 0 (13 compared)  | not checked                     | not checked             | **0 confirmed, 2 areas unchecked**                  |
| 11. Wikipedia baseline for individual-listing-bridged       | N/A (0 such candidates) |                  |                                 |                         | **N/A**                                             |
| 12. Share of individual-listing-bridged that are baseline C | N/A                     |                  |                                 |                         | **N/A**                                             |
| 13. Share of all OSM candidates with `ref:nrhp`             | 0% (0/61)               | 0% (0/66)        | unconfirmed (0/51 known)        | unconfirmed (0/7 known) | **0% of 127 confirmed; 58 unconfirmed**             |
| 14. Share of thin OSM candidates with `ref:nrhp`            | 0% (0/48)               | 0% (0/58)        | unconfirmed                     | unconfirmed             | **0% of 106 confirmed; 54 unconfirmed**             |

Note on row 14: this metric is specific to the **OSM-side** `ref:nrhp`
bridge method only (the Overpass re-fetch). `way/1356166516`'s OSM side
remains unconfirmed regardless of its audited Wikidata reclassification, so
row 14's confirmed/unconfirmed split (106 / 54) is unaffected by the
Section 8 correction — it is a different denominator from the
joinability-robustness check below, which counts completeness across _both_
bridge methods combined.

**Robustness check on joinability**: excluding the 53 indeterminate-flag
candidates from the denominator entirely (bridgeable / (thin − indeterminate)
= 1/107 ≈ 0.93%) still lands in the same **low joinability (`<20%`)**
bucket as the literal frozen-formula value (1/160 ≈ 0.625%). The Overpass
failure does not change the interpretation-table outcome either way.

**Mandatory caveat, stated verbatim per the frozen preregistration**:
observed individual-NRHP share among all thin candidates remains a **lower
bound** — bridge coverage (OSM `ref:nrhp` tagging completeness and Wikidata
`wikidata` tagging + P649 claim completeness) is incomplete, made more so
here by the Overpass failures for two of the four areas. A candidate in
`no-bridge`, `checked-no-NRHP-claim`, or carrying the indeterminate
bridge-completeness flag may still be NRHP-listed in reality; this study
cannot establish that.

## 10. Frozen interpretation applied

Joinability = 1/160 ≈ 0.625% → **low joinability (`<20%`)**.

Per the frozen decision mapping: **"Low joinability (`<20%`) → inconclusive
about NRHP prevalence, because identifier linkage is insufficient.
Interpreted as an identity-linkage limitation (today's OSM/Wikidata tagging
doesn't reach far enough to measure this), not a no-go on the NRHP source
family itself."**

**Result: inconclusive about NRHP prevalence.** This is not a no-go on the
NRHP source family — it means today's available OSM `ref:nrhp` tagging and
Wikidata `wikidata`/P649 tagging on these specific thin candidates, in
these four areas, essentially never bridges to NRHP (1 bridge found out of
160 thin candidates, and that one bridge was `unlabeled-bridged`, not even
an individual listing). No threshold was reinterpreted after seeing the
result. This remains unaffected by the Section 8 audited classification
correction (Section 9's robustness check still lands in the same low
bucket). This is not a no-go on the NRHP source family itself, but it also
does not justify an NPS individual-listing adapter as the next
implementation step.

## 11. Text-layer probe gate

**Not reached.** The frozen result is "inconclusive," not "proceed" — the
gate's trigger condition (a proceed result) was not produced. The probe was
not run.

## 12. A genuine volatility finding (observational, not a required metric)

The single Wikidata-bridged candidate (`way/265322610`, "Congregation
Ezrath Israel" / The Actors' Temple) is a place this repository's own
`GENERATED_LOCAL_HISTORY` curated-entry work previously promoted with a
story-bearing override specifically to **prevent** Tier-4 classification
(see memory: "RESOLVED: hasStoryBearingClaim discoveryTier fix"). In this
run it nonetheless classified Tier-4/`placeholderFallback` — not because
the curated override failed, but because `applyDiscoveryTier`'s own logic
intentionally skips the curated-tier override when the classifier's
_exact-placeholder-shape_ condition fires (i.e., this request's LLM copy
generation produced no usable copy at all for this candidate — `"A notable
place in this area."`, `facts: []`). This means **Tier-4/thin status, as
measured here, is not a stable per-place property** — it can flip between
runs depending on transient LLM copy-generation outcomes for the same real
place. This is disclosed as a methodological caveat affecting how strongly
any single run's thin-candidate count should be read, not as a bug to fix
(out of scope: no production changes made or proposed).

## 13. Request counts / caps

| Stage                      | Requests used                             | Cap              |
| -------------------------- | ----------------------------------------- | ---------------- |
| Discover (`walkMode:true`) | 4                                         | 4 (one per area) |
| Overpass                   | 4 (2 succeeded, 2 failed 502, no retries) | 4 (one per area) |
| Wikidata `wbgetentities`   | 1                                         | 20               |

## 14. Artifacts

All under `experiments/hybrid-discovery-v0.1/documents/step6d2-artifacts/`:
`discover_fairmount_walkmode.json`, `discover_midtown_walkmode.json`,
`discover_bethlehem_walkmode.json`, `discover_jimthorpe_walkmode.json`,
`hashes.txt`, `overpass_query_{fairmount,midtown,bethlehem,jimthorpe}.txt`,
`overpass_fairmount.json`, `overpass_midtown.json`, `overpass_bethlehem.txt`
(502 body, renamed from `.json` to `.txt` during the 2026-10-16 audited
correction commit — content/hash unchanged, plain-text error body was never
valid JSON), `overpass_jimthorpe.txt` (502 body, same rename), `overpass_hashes.txt`,
`wikidata_batch1.json`, `wikidata_results.json`, `osmid_lists.json`,
`thin_candidates_full.json`, `thin_with_wikidata.json`,
`overpass_tagmaps.json`, `classified_thin_candidates.json`. Plus, at the
`documents/` level: `STEP_6D2_RESULTS.md` (this file) and
`step6d2ResultLog.json`.

## 15. Confirmations

- Original Step 6D artifacts (`STEP_6D_RESULTS.md`, `step6dResultLog.json`,
  `step6d-artifacts/*`) were not modified.
- `STEP_6D_PREREGISTRATION.md` and `STEP_6D2_AMENDMENT.md` were not
  modified.
- No production code was modified.
- `HINT_TAGS` was not widened — `ref:nrhp` was read only from the
  independent, read-only Overpass re-fetch, never from the production
  response.
- No NPS PDFs were fetched.
- No commit or push was made.
