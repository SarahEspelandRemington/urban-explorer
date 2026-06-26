# CLAUDE.md — Streetlit Operating Brief

This file is the primary operating brief for Claude Code when working on the
Streetlit codebase. It should be read at the start of every session. It does
not replace the detailed reference docs listed in Section 8 — those exist for
deep dives — but it establishes the standing rules that apply to all work.

This document captures durable operating principles, not immutable
implementation details. When this document and the current source code
disagree, inspect the source code and update this document if appropriate.

---

## 1. Source of Truth Rules

- **GitHub `main` and `~/Documents/streetlit-clean` are the source of truth.**
  All code changes happen here, on the Mac clone.
- **Replit is production API hosting and legacy runtime only.** It is not a
  development environment. Do not edit code in Replit.
- **Do not click Replit Publish** unless a task has been explicitly scoped to
  include a production deployment.
- **Do not transfer, migrate, or reconfigure Replit** unless that is the
  explicit, agreed goal of the current task.
- The app has been rebranded from "Urban Explorer" to "Streetlit" and the
  bundle ID changed from `com.urbanexplorer.app` to `com.streetlit.app`.
  Some older docs still use the old name — the code and `app.config.js` are
  the canonical reference for current values.

---

## 2. Runtime Safety Rules

Before testing any server or API behavior, verify the production server is
running the expected code:

```bash
curl https://city-explorer-guide-sarahremington.replit.app/api/healthz
# Expected: {"status":"ok"}

curl https://city-explorer-guide-sarahremington.replit.app/api/healthz?verbose=true
# Returns environment and cache version metadata
```

**Core runtime principles:**

- GitHub green does not mean production is fresh. CI validates source code;
  it does not restart the server, rebuild the deployment, or re-bundle Metro.
- Each runtime layer — GitHub source, Replit dev server, Replit production
  deployment, Metro bundle, iOS Simulator, API cache — is independently
  versioned and must be explicitly refreshed. See the Runtime Sync / Testing
  Matrix (Section 8) for the full per-layer reference.
- Do not assume a Replit dev server restart has any effect on the production
  `.replit.app` deployment. They are completely independent.

**Things that must not be changed casually:**

- LLM cache version tokens (e.g., `osm:v43`) — bumping evicts all cached
  results for that namespace from the database. Only bump after a deliberate
  prompt or Overpass query change. Currently, a bump also requires running
  `pnpm run update:prompt-manifest` and committing the updated
  `scripts/prompt-manifest.json` (CI enforces this). Verify this enforcement
  mechanism is still in place before bumping.
- `EXPO_PUBLIC_API_URL` or any `EXPO_PUBLIC_*` env var — these are baked into
  the Metro bundle at startup, not resolved at runtime. A change requires
  killing and restarting Metro with `--clear`.
- EAS build profiles (`eas.json`), bundle identifiers, or app plugin config
  (`app.config.js`) — any of these can require a full EAS rebuild.
- The `OVERPASS_PROVIDERS` array has previously been deliberately ordered for
  production reliability (the French instance has worked reliably from the
  production IP). Before changing the order, inspect the current
  implementation and confirm whether that reasoning still holds.
- Walk Mode tuning parameters (`offAxisPenaltyDeg`, `offAxisPenaltyMeters`,
  `maxQueueDistance`, `discoverRadius`, `pickNext` logic) have been calibrated
  through field testing. Treat any change to these as a behavioral change
  requiring explicit review, not a routine tweak.
- Privacy scrubbing in Sentry calls — governed by the `no-pii-in-sentry`
  ESLint rule and a dedicated test suite.

---

## 3. Git / Command Rules

- **Always work from the clean Mac clone** at `~/Documents/streetlit-clean`
  unless explicitly instructed otherwise.
- **Check `git status` before and after any set of changes.**
- **Do not commit, push, build, publish, or run migrations without explicit
  approval** from the user for that specific action.
- **Prefer read-only diagnostics before implementation.** Understand the
  current state of the code and runtime before proposing changes.
- **Keep diffs narrow and scoped.** Do not combine unrelated tasks in a single
  change set.
- Before pushing, all of the following must pass:
  ```bash
  pnpm run typecheck
  pnpm run lint
  pnpm run format:check   # run `pnpm run format` to auto-fix, then recheck
  ```
  If `artifacts/api-server/src/routes/explore/index.ts` was changed in a way
  that affects a cache-key version token, also run:
  ```bash
  pnpm run update:prompt-manifest
  ```
  and commit the updated `scripts/prompt-manifest.json` alongside the code.

---

## 4. Product Quality Rules

Streetlit surfaces hidden or overlooked urban stories — the kind of context
that changes how someone understands a place or neighborhood.

**Streetlit should prioritize:**

- Hidden or overlooked stories about ordinary places
- Visible remnants of an earlier use or era
- Context that explains why a place or neighborhood looks the way it does today
- Ordinary places connected to larger historical, cultural, social, or
  economic patterns
- Discoveries that reveal an invisible layer of the city
- Grounded, source-aware interpretation
- Trust over novelty
- Fewer, better discoveries over generic filler

**Streetlit should avoid:**

- Generic business descriptions (e.g., "This is a bank," "It serves local
  students")
- Unsupported historical claims or fake certainty
- Borrowed nearby-landmark context presented as if it belongs to the candidate
  place
- Hallucinated or approximate sites masquerading as real, verified places
- Overconfident language when evidence is weak
- Placeholder language ("notable place," "local institution") unsupported by
  actual context
- Raw category labels presented as discoveries

**Tie-breaking principle:** when choosing between two discoveries, prefer the
one that creates the larger change in the user's understanding of the place.
An ordinary place with an extraordinary story should generally outrank an
extraordinary-looking place with no meaningful story.

**A real nearby place is not automatically a Streetlit discovery.** OSM
presence confirms that a place exists; it does not by itself justify
surfacing. To auto-surface, a place should have a specific hidden story,
visible remnant, contextual explanation, civic/social role, architectural
meaning, or larger-pattern connection. See the Discovery Ranking Rubric
(Section 8) for the full tier definitions.

---

## 5. Walk Mode Design Rules

Walk Mode should feel like a calm companion, not a feed.

**Core principle:** design Walk Mode so the user can put the phone away and
trust the app to behave calmly and accurately. Spatial correctness matters
more than narration frequency. Silence is preferable to a confusing, mistimed,
or aggressive narration.

**Decision priority order:**

1. Cross-street / barrier / path-plausibility correctness
2. A thoughtful silence threshold when confidence is low
3. Debug visibility that explains decisions without driving them

**When working on Walk Mode (selection, narration, eligibility, overlays,
address/coordinate coherence):**

- Narrate only when a place is genuinely relevant to the user's current path
  and direction.
- Treat visible map pins and auto-narration eligibility as separate concepts
  — a place can be a pin without triggering narration.
- Keep behind-the-user, across-barrier, and disconnected places out of
  auto-narration.
- If confidence is low, let the system stay quiet.
- Prefer non-destructive flags over deleting or filtering out uncertain data.
- When adding rejection reasons, make them useful for field testing: explain
  why a place was skipped without hiding the place itself.
- Do not narrate a place whose copy cannot be grounded in verifiable source
  data. An OSM pin without a credible story is preferable to an OSM pin with
  an invented one.
- Before increasing narration frequency, ask whether the change helps user
  trust and orientation.

**Preferred outcomes in order:**

1. Correct, relevant narration
2. Quiet skip with explainable debug info
3. No narration

---

## 6. Language / Terminology Rules

Use these terms consistently in code, copy, and conversation:

| Term          | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| **location**  | The user's GPS/search/map position                     |
| **place**     | A real-world entity (building, site, landmark)         |
| **discovery** | A surfaced place — the card, result, or narration unit |
| **story**     | Narrative or explanatory content about a place         |

**Trust and verification language:**

- Do not claim "verified," "archival research," "human review," or "confirmed
  history" unless that is literally true of the content being described.
- Do not use overconfident language when evidence is weak.
- Be careful with location and privacy wording — the product handles precise
  GPS data and must not imply more certainty or data retention than exists.

---

## 7. Product Owner Context

The product owner (Sarah) is the creative and product driver. She is not a
programmer but is actively learning and makes thoughtful product decisions.

**When communicating:**

- Default to plain English. If a technical term is unavoidable, define it
  immediately in the same sentence.
- Explain what a command does, not just what to type.
- Use analogies to familiar physical concepts rather than technical metaphors.
- Keep explanations proportional — a yes/no question gets a direct answer
  first, then elaboration if useful.
- When there are two valid approaches, describe trade-offs and give a clear
  recommendation. Do not present options without a preference.
- State risks once clearly and move on. Do not repeat warnings after a
  decision has been made.
- When something the user thought was true turns out to be correct, confirm
  it clearly rather than hedging.

**End-of-session push rule:**

Push to GitHub only when the user explicitly requests it, or when the user
has approved all changes made in the session and confirmed they want a push.
GitHub is the source of truth; Replit may be deleted at any time.

---

## 8. Implementation Style

- Prefer small, reversible changes.
- Do not combine unrelated tasks in a single change.
- Report exact files changed and show diff summaries before committing.
- Run relevant checks (`typecheck`, `lint`, `format:check`) before declaring
  work done.
- Stop for review before any commit, push, build, or deploy action.
- Do not add features, error handling, or abstractions beyond what the task
  requires.
- Do not add comments or docstrings to code that was not changed.
- Do not create new files unless they are clearly necessary for the task.

---

## 9. Key Reference Docs

Load these when a task requires deeper context in the relevant area. Do not
load all of them by default.

| Doc                                                            | When to load                                                                                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `artifacts/urban-explorer/docs/discovery-ranking-rubric.md`    | Any task touching discovery eligibility, ranking, filtering, Explore surface, or Walk Mode narration eligibility                                                                                       |
| `artifacts/urban-explorer/docs/runtime-sync-testing-matrix.md` | Any task involving server/API changes, Metro/client changes, cache behavior, env vars, or field testing                                                                                                |
| `artifacts/urban-explorer/docs/runbook.md`                     | Repo structure, production URL, redeploy steps, EAS dev client, known runtime issues, "do not touch casually" table                                                                                    |
| `.agents/skills/walk-mode-phone-away-trust/SKILL.md`           | Any task touching Walk Mode selection, narration, eligibility, overlays, or address/coordinate coherence                                                                                               |
| `threat_model.md`                                              | Any task involving API surface changes, input handling, caching, location data, or new external integrations                                                                                           |
| **Discovery Acceptance Model**                                 | **PENDING: currently PDF-only at `attached_assets/Discovery Acceptance Model V3.pdf_...pdf`. No markdown version exists. Treat as a real reference once converted to Markdown and added to the repo.** |
| **Streetlit Product Language & Trust Guidelines**              | **PENDING: does not yet exist in the repo. Treat as a real reference once added.**                                                                                                                     |

---

## 10. External / Non-Engineering Docs

The following documents exist for public-facing, privacy, or support
communication purposes. They are **not** standing rules for app development
work and should only be consulted if a task explicitly involves public-facing
copy, privacy statements, or support content.

- **Streetlit Launch Privacy Factsheet** — not yet in repo
- **Streetlit Web Presence Plan** — not yet in repo

---

## 11. Stale / Replit-Era Context

The following files exist in the repo and should be preserved as-is, but they
are superseded by this file for Claude Code sessions:

- **`replit.md`** — the primary operational doc from the Replit era. Rich
  historical reference (architecture decisions, known issues, new-account
  setup), but written for Replit workflows and partially stale (old bundle ID
  `com.urbanexplorer.app`, Replit-specific push instructions). Do not treat it
  as a standing instruction set.
- **`.agents/skills/user-context/SKILL.md`** — user/product owner profile
  written for the Replit AI agent. Communication style guidance has been
  absorbed into Section 7 of this file. The Replit-specific parts (Replit
  Secrets, Bearer-token GitHub push) do not apply to Claude Code.
- **`.agents/skills/runtime-sync-verification/SKILL.md`** — runtime chain
  verification checklist written for the Replit agent. The underlying logic
  remains valid; the portable version is in the Runtime Sync / Testing Matrix
  doc listed in Section 9.
- **`.agents/agent_assets_metadata.toml`** — Replit-generated image asset
  index. Not relevant to Claude Code.
