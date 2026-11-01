# Streetlit: standing instructions for Claude Code

Read this at the start of every session. These rules apply to every task, so Sarah's prompts won't repeat them.

## What this project is

Streetlit is a solo-built iOS walking app (Expo / EAS, server on Render). While someone walks, it surfaces true, interesting discoveries about nearby places. Its purpose is to make an ordinary street look different than it did 30 seconds earlier.

Sarah is the founder and product owner. She has a clear product vision but is not an engineer. Explain what you did and why in plain language, define technical terms the first time you use them, and keep summaries short.

## Editorial and trust rules

- **Trust over invention.** Do not introduce new ungrounded fallback behavior or weaken existing grounding safeguards. Keep the ungrounded LLM fallback path gated behind `osmAnchor`; never loosen that gate.
- **Silence-over-filler is the product direction.** Strict runtime silence is not globally enabled; do not change that behavior unless the task explicitly authorizes it. Preserve modest genuine discoveries that clear the bar; do not turn trust guidance into an automatic global suppression policy.
- **No metadata-driven narration is the product intent.** Narration should come from source-authored material, not thin metadata expanded into confident prose. This does not mean every current runtime path already meets that standard. Do not introduce or expand metadata-driven narration; flag existing gaps without treating them as authorization to rewrite behavior.
- **Tier and chain filtering is unconditional.** It applies in every mode, including Walk Mode. Never add a mode-specific bypass (see the past `filterGenericCommercial` bug).

Changes to these rules or their runtime implementation are high tier. Flag them and proceed only within Sarah's explicitly authorized scope.

## How to work: three tiers

Sarah's prompt will name a tier. If it doesn't, assume **medium**, and tell her if you think it's actually a different tier.

**Small** (copy changes, config, an obvious isolated bug, anything easy to undo)
Diagnose, fix, and show the diff in one pass. Then stop and wait for approval to commit.

**Medium** (a real feature, or a fix across several files)
Give a brief plan first, in plain language: what you'll change, which files, and what could go wrong. For a well-bounded task, you may then implement if Sarah explicitly says `plan and proceed`; otherwise, wait for approval before editing. For uncertain or consequential medium work, plan and stop for approval. After implementing, show the diff and stop.

**High** (grounding and silence logic, narration evidence selection, the data model, anything the editorial rules above touch)
Read-only investigation first. Report findings and stop. Implement only after Sarah authorizes a specific, narrow scope. Show the diff, then stop.

## Review route

- **Small:** Sarah → CC → Sarah.
- **Medium:** Sarah + one reviewer (ChatGPT OR RC) → CC, unless Sarah explicitly chooses otherwise.
- **High:** ChatGPT for product/history/editorial continuity; RC only when there is a genuine architecture/contract question. CC implements only after the decision is bounded and Sarah authorizes the scope.
- Do not involve both ChatGPT and RC merely because both exist. If both are needed, give each a distinct job.

## Git rules

- **Never push without explicit approval.** Commit and push are separate decisions.
- **Never commit without explicit approval** of the diff.
- One concern per commit. Never bundle unrelated changes.
- Respect `check:prompt-manifest`. Cache/prompt versions change only when the protected prompt/cache region actually changes or the manifest requires it. Do not bump versions merely because `explore/index.ts` was touched.
- Temporary instrumentation (debug logs, test hooks) must be removed before commit, or tracked with an explicit removal trigger.

## Scope discipline

- Do only what the prompt asks. No drive-by refactors, renames, dependency upgrades, or "while I was in there" fixes.
- If you notice something else worth fixing, mention it at the end and don't act on it.
- Confirm that changes took effect. Don't assume they did.
- If a task turns out bigger or riskier than its tier suggested, stop and say so.

## Where things live

- Repo-root `WALK_DIAGNOSTIC.md` is the immediate product-learning brief, not a second backlog. Read it only when the task involves Walk testing or diagnosing Walk results; skip it otherwise.
- The Google backlog remains canonical for long-term priorities; editorial documents also live in Google Docs. If needed context is not available to you, ask Sarah for the relevant text. Don't guess at it.
- The repo may be more current than the Google Docs in places. Treat the repo as the source of truth for code.

## Reporting back

End every task with:

1. **What changed**, in one or two plain sentences.
2. **How to check it**, meaning what Sarah can do or look at to confirm it works.
3. **Anything surprising** or anything you chose not to do.

Keep it brief. Sarah is watching her token budget, so don't paste large files or long logs back unless asked.

## Current focus

Recover the Streetlit “I walk past this all the time and had no idea” experience. The next step is a bounded real-world Walk diagnostic on current production. Do not assume the current architecture is the answer: use field evidence to identify the dominant failure mode before selecting the next intervention.

Current production baseline is richer-evidence A-style synthesis. Generalized grounding-gate V1–V3 is parked / do not ship. Do not open V4 by default.
