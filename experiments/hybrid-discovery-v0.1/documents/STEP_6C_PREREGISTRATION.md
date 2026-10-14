# Step 6C Preregistration — Cross-System Acquisition-Shape Mapping

**Status:** Preregistration only. No reconnaissance has been performed. No
jurisdiction has been inspected. This document freezes the question, units,
schema, limits, and decision rules before any NYC / Chicago / Omaha-Nebraska /
Las Vegas-Nevada / NPS surface is touched.

**Relationship to Step 6B:** This study tests the _representation
portability_ of the acquisition contract exercised in
`STEP_6B_PREREGISTRATION.md` (the five-part acquisition record and its
outcome/tier concepts). It does not alter, extend, or re-run Step 6B. No
packet, trust, or angle architecture change is in scope.

---

## 1. Purpose and evidentiary limit

Frozen question:

> Across a small set of preservation source systems, can the existing Step 6B
> acquisition contract represent the path from authoritative resource
> identity to narrative preservation document without city-specific field
> semantics?

This study is intended primarily to:

- identify acquisition shapes that exist;
- test representation portability of the acquisition contract;
- identify true contract gaps.

It is **not** intended to estimate how common any shape is nationally.

Because the jurisdictions were pre-selected as prior portability probes
(NYC, Chicago, and NPS have each already been touched by earlier
non-Philadelphia portability work in this pilot; Omaha/Nebraska and Las
Vegas/Nevada are new), a clean fit across them is only **moderate** evidence
that a small number of recurring shapes exists — not strong evidence, and
not a prevalence claim.

Pre-declared as counting **against** the "few recurring shapes" hypothesis:

- acquisition paths repeatedly requiring unique, non-reusable link/match
  semantics;
- multiple true contract failures (see Section 8);
- no recurring link-mechanism + match-evidence profiles among inspected
  non-identical systems;
- widespread request-only / partial / name-only acquisition.

---

## 2. Unit of analysis

The primary unit is:

> **source system = preservation agency + acquisition surface**

Jurisdiction is only a lookup/location key, not the unit itself. A single
resource may route through multiple systems (e.g., a building may have a
local landmark record, a state inventory record, and an NRHP record — three
systems, one resource).

**Jurisdictional contexts to inspect (not yet inspected):**

- New York City
- Chicago
- Omaha / Nebraska
- Las Vegas / Nevada

**Also included:**

- NPS National Register / NRHP system — a federal reference system that may
  recur across jurisdictions.

Where relevant, distinguish within each jurisdictional context:

- local designation system;
- state preservation system;
- federal NRHP system.

These may be zero, one, or several distinct source systems per jurisdictional
context, discovered during reconnaissance, not assumed in advance.

---

## 2A. System-discovery boundary (amendment)

For each jurisdictional context, inspect **at most**:

1. one primary local preservation system, if present;
2. one primary state preservation system, if materially distinct from the
   local system;
3. the shared NPS/NRHP system, where relevant.

**Maximum distinct source systems in the entire Step 6C study: 9**, counting
the NPS/NRHP system once across all jurisdictional contexts (not once per
jurisdiction).

Do **not** add secondary archives, adjacent agencies, university/library
collections, historical societies, or other repositories during
reconnaissance, regardless of how relevant they may appear once
reconnaissance begins.

**Choosing among multiple plausible primary systems at the same level:** use
the one explicitly identified by the responsible preservation agency as its
authoritative/public-facing system (e.g., stated as such on the agency's own
site). If that cannot be determined within the frozen request budget (see
Section 9), record the system identity as **ambiguous/unknown** for that
jurisdictional context/level and **stop** — do not broaden the search to
resolve the ambiguity.

---

## 3. Evidence labels

Every system-level claim must carry exactly one label:

- **Documented** — stated by the agency's own page/help text/schema;
- **Observed** — demonstrated by the inspected worked-example resource;
- **Unknown** — not established.

An observed worked example must **not** be generalized into a system-wide
claim unless official documentation supports it. Example: if one worked
resource happens to link directly to a PDF, that is `Observed` for "link
mechanism" on that resource; it only becomes a `Documented` system-wide claim
if the agency's own page/help text says that all (or a defined class of)
resources link this way.

---

## 4. Worked-example selection

For each source system, inspect **one representative resource**.

**Add one older resource only when both conditions hold:**

- the system spans meaningfully different archival eras; **and**
- the second resource is needed to test whether acquisition differs by era.

Older examples must be chosen by date/era, not because they are known in
advance to have better documentation (no cherry-picking toward a favorable
result).

Do **not** add a second resource when the first plus official documentation
already establishes the relevant acquisition shape.

For Omaha/Nebraska and Las Vegas/Nevada specifically: choose examples by
**system**, not merely by city name. A local landmark and an NRHP resource
may represent different source systems for the same city and must not be
conflated into one system's record.

---

## 5. Orthogonal acquisition attributes

Mutually exclusive A–F shape buckets are **not** used as primary data. For
each system, record the following six orthogonal attributes. Derived "shape"
labels may be added afterward from these attributes, but the attributes
themselves are authoritative.

**Link mechanism** (pick the one that applies; record verbatim if none fit):

- record-directly-links-document
- exact-ID lookup
- deterministic cross-surface matching
- request-only
- other documented mechanism (name it)

**Match evidence available:**

- native/source ID
- exact unique address
- exact name
- direct asserted linkage
- none / human-only relationship

**Coverage:**

- complete
- bounded
- partial
- unknown

**Extra steps:**

- deterministic only
- human inference required
- manual/request workflow

**Document form / acquisition form:**

- born-digital document
- scan
- HTML page
- database record/entry
- other (name it)

**Document granularity:**

- one resource
- district package
- multi-property batch
- other (name it)

---

## 6. Existing acquisition contract being tested

Test whether each system can populate the existing conceptual record (as
exercised in Step 6B, unchanged):

1. `InventoryIdentity`
2. declared official `DiscoverySurface`
3. candidate document identity/URL/record + match evidence
4. shared accept/reject outcome
5. provenance/fingerprint/acquisition-cost record

**No packet changes are permitted in this study.** If a system appears to
require a new field or a redefinition of an existing field's meaning, that is
reported as a contract-failure candidate (Section 8), not implemented.

---

## 7. Contract fit

A system **fits** when:

- the five acquisition-record parts (Section 6) can be populated from
  documented/observed facts;
- existing outcome/tier concepts (Step 6B's frozen evidence tiers and
  outcome taxonomy) are sufficient, unmodified;
- no field has to acquire a city-specific meaning.

**Request-only counts as contract fit.** It is a distinct acquisition shape
(Extra steps = manual/request workflow) and may be poor for scalability, but
it is not itself a representation failure — the five-part record can still
describe a request-only path (e.g., candidate identity = "obtainable only via
request," match evidence = "none / human-only relationship" or whatever is
actually documented).

**Tier-2/address-based fit is valid only where the exact address uniquely
identifies one resource.** Ranges, shared addresses, or multi-property rows
must not be treated as equivalent to a unique-address match — these are
recorded as `document granularity = district package` or `multi-property
batch`, not as a clean Tier-2 address fit.

---

## 8. True contract failure

A true failure requires a **specific unrepresentable element**, such as:

- linkage depends on a human-readable relationship not exposed as any
  exact/recordable identity evidence;
- authoritative identity is not representable as an inventory/resource
  record;
- the acquisition unit is not a document-like object and cannot be
  represented cleanly as a stable source record;
- a bundled document contains multiple resources with no stable
  sub-identifier or usable resource reference;
- another specific element that cannot fit the five-part contract without
  changing field semantics (must be named explicitly, not inferred
  generically).

**The following are explicitly NOT contract failures:**

- a new adapter mechanism;
- a new official surface type;
- a coverage limitation (partial/bounded/unknown coverage);
- request-only access.

---

## 9. Request/rate limits

Frozen before any reconnaissance:

- official government/agency surfaces only;
- no general web search as an acquisition mechanism;
- no more than 1 request/second per host;
- respect published robots/terms/access restrictions;
- no attempt to bypass login, paywall, anti-bot, or access controls;
- a login/paywall/manual-only system is recorded as non-self-service and
  reconnaissance on it **stops** at that point (recorded as `Documented`/
  `Observed` only as far as the public-facing boundary, then marked
  non-self-service — no further probing).

**Session request cap: 40 requests total for this study**, across all five
source-system contexts combined (reconnaissance + worked-example
verification). This is deliberately smaller than Step 6B's 60-request cap
because this study inspects single worked examples per system rather than
drawing a stratified sample, and because repeated shared-surface fetches are
not expected to be needed at this scale. If the cap would be exceeded for a
given system, reconnaissance on that system stops and the outcome is
recorded as `request-cap-exhausted` for that system, consistent with Step
6B's existing outcome taxonomy (no new outcome code is introduced).

No per-system sub-cap is separately frozen; the single 40-request session cap
governs all systems jointly, since the number of systems is itself only
known with certainty after reconnaissance (Section 2).

---

## 10. Out of scope

Do not, at any point in this study:

- fetch/read narrative content for story value;
- extract claims;
- build resolvers;
- write crawler/framework code;
- map complete jurisdiction holdings;
- fix Philadelphia coverage;
- add new contract surface types during the study;
- use commercial/paywalled/login-gated sources beyond noting their
  existence;
- make statistical statements about national prevalence;
- change packet/trust/angle architecture.

Identification fields and structural metadata only.

---

## 11. Required per-system output

For each source system, produce:

**Attribute table** — each of the six Section 5 attributes, each carrying:

- value;
- evidence label (Documented / Observed / Unknown);
- supporting official surface (URL or named surface).

**Worked acquisition record** — the worked example rendered as:

```
InventoryIdentity → DiscoverySurface → candidate/source identity → match evidence → outcome/provenance
```

**Contract result** — exactly one of:

- fit; or
- failure, with the exact criterion from Section 8 that failed.

**Cost classification** — exactly one of:

- direct
- one deterministic lookup
- multi-surface deterministic
- inference-heavy
- manual/request-only

---

## 12. Decision mapping

Frozen before reconnaissance.

**Philadelphia-specific acquisition** is supported when:

- the other inspected non-identical systems mostly have different
  link-mechanism + match-evidence profiles from Philadelphia and from each
  other;
- fewer than two recurring pairs exist.

**A few recurring adapter patterns** is supported when:

- at least two matching pairs of non-identical inspected systems share the
  same (a) link mechanism **and** (b) match-evidence profile.
- The shared NRHP surface may count as one recurring pattern (since the same
  federal system may appear under multiple jurisdictional contexts), but
  cannot alone satisfy this conclusion — a second, non-NRHP recurring pair is
  also required.

**Reconsider preservation-source scalability** is supported when:

- most inspected systems are request-only, partial-coverage, or
  name-only/human-inference dependent;
- or multiple true contract failures occur (Section 8).

These three outcomes are **architecture decisions**, not prevalence claims.

---

## 13. Hypothesis guardrail

Explicitly recorded, to be restated verbatim in the final report regardless
of outcome:

> Even if all inspected systems fit the contract, this does not prove that
> preservation acquisition nationally collapses into only a few shapes. The
> study can establish observed recurring shapes and identify failures, but
> not population prevalence.

---

## 14. Execution notes (binding on the future execution task, not acted on now)

- Do not alter any rule in this document mid-run once execution begins.
- Do not inspect NYC, Chicago, Omaha/Nebraska, Las Vegas/Nevada, or NPS
  surfaces under this preregistration until a separate execution task
  explicitly authorizes it.
- Log any new-rule type that reconnaissance would have needed, diagnostically
  only, without adding the rule — consistent with Step 6B's logging
  discipline.
