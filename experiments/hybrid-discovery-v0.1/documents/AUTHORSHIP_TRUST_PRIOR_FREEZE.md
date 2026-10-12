# Authorship Trust Prior Freeze — preservation-document narrative claims

Experiment provenance note only. This is NOT a production trust-policy
decision and does not change any production code, `ClaimType`, check, or
grounding logic. It records the pre-registered pilot prior for the
`authorshipRole x ClaimType -> capability strength` table in
`authorshipCapability.ts`, frozen before the six-subject Philadelphia
preservation-document pilot begins (implementation step 3A).

## Pre-registered pilot prior

For **narrative claim types only** — every `ClaimType` other than the
structured-designation type (`register-status`) and the core-fact types
(`construction-date`, `architect`, `identity`) — the following capability
strengths are frozen. Explicitly, against the full `ALL_CLAIM_TYPES` set in
`authorshipCapability.ts`, this means the narrative set is exactly:
`use-history`, `biographical`, `institutional-founding`, `event`,
`superlative`, `legend-tradition`, `statistic`, `demolition`,
`relationship`, `urban-remnant` — i.e. `ALL_CLAIM_TYPES` minus
`STRUCTURED_DESIGNATION_TYPES` minus `CORE_FACT_TYPES` as defined in that
file. This boundary is frozen alongside the capability values below; a
future `ClaimType` addition is out of scope for this freeze and would
require an explicit decision about which bucket it falls into.

| Authorship role       | Narrative capability strength |
| --------------------- | ----------------------------- |
| `applicant`           | `medium`                      |
| `consultant-preparer` | `medium`                      |
| `unknown`             | `medium`                      |

Structured-designation and core-fact claim types are **not** covered by
this narrative posture and remain exactly as previously drafted (fail-closed
`low` for `unknown`, unchanged for `applicant`/`consultant-preparer`). No
special structured-fact trust exception has been added. `commission-staff`
values are unchanged from the prior provisional draft.

## Rationale

- Unlabeled nomination narrative prose is not intrinsically less trustworthy
  than other narrative sources (e.g. Wikipedia, Forgotten New York) merely
  because the document does not name a specific author.
- Preservation nominations carry an advocacy incentive (the applicant is
  requesting designation), so these lanes are deliberately `medium`, not
  `high`.
- Claim-level integrity problems (e.g. a conflicting date, an unsupported
  superlative) remain the responsibility of the existing, unmodified checks
  — this table only sets the trust ceiling, never a substitute for them.

## Freeze condition

**This table must not be changed again after seeing six-subject pilot
outcomes without explicitly invalidating/restarting this pre-registration.**
If the six-subject sample reveals a reason to revisit these values, that
must be a separate, explicitly-scoped decision — not a quiet adjustment made
while reviewing pilot results.

## What this freeze does NOT cover

- No special trust path for structured/form-field facts has been added. The
  distinction (a commission-determined structured fact vs. interpretive
  narrative prose) remains conceptually valid but unimplemented pending a
  real example — none of the 2301 Fairmount Avenue claims came from an
  explicitly labeled commission/form field (see implementation-step-3A final
  report item 8).
- Does not change adapter authorship assignment, production types,
  `ClaimType`, production trust logic, checks, or grounding.
