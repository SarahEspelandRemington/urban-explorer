---
name: walk-mode-phone-away-trust
description: Guides Urban Explorer Walk Mode decisions around phone-away trust, spatial accuracy, and calm automatic narration. Use when editing walk-mode selection, narration timing, eligibility, overlays, or address/coordinate coherence.
---

# Walk Mode Phone-Away Trust

## When to Use

Use this skill when changing Walk Mode behavior, especially:

- place selection and ranking
- narration timing and suppression
- map pin vs auto-narration eligibility
- address/coordinate coherence checks
- debug overlays or walk diagnostics

## Core Principle

Design Walk Mode so the user can put the phone away and trust the app to behave calmly and accurately.

Spatial correctness matters more than frequency. Silence is preferable to a confusing, mistimed, or aggressive narration.

This philosophy is still evolving, but it should already shape decisions in this order:

1. Cross-street / barrier / path-plausibility correctness
2. A thoughtful silence threshold when confidence is low
3. Debug visibility that explains decisions without driving them

## Instructions

- Prefer accuracy over content volume.
- Narrate only when a place is genuinely relevant to the user’s current path and direction.
- Treat visible pins and auto-narration eligibility as separate concepts.
- Keep behind-the-user, across-barrier, or disconnected places out of auto-narration.
- If confidence is low, do not force narration; let the system stay quiet.
- Treat cross-street and barrier cases as the first thing to get right, because they directly affect user trust.
- Make silence a deliberate product decision, not just a fallback, when the match is uncertain.
- Preserve original place records and attach debug metadata instead of deleting or mutating away uncertain data.
- When adding rejection reasons, make them useful for field testing: explain why a place was skipped without hiding the place itself.
- Keep timing ambient and low-pressure. Walk Mode should feel like a calm companion, not a feed.
- Keep debug output inspectable and useful, but do not let the overlay become the product logic.

## Decision Rules

Prefer these outcomes in order:

1. Correct, relevant narration
2. Quiet skip with explainable debug info
3. No narration

Avoid:

- narrating places behind the user
- narrating places across irrelevant streets, barriers, or dead-end paths
- using proximity alone when heading/path context says the match is weak
- deleting or filtering out records when a non-destructive flag is enough
- narrating a place whose copy cannot be grounded in verifiable source data. An OSM pin without a credible story is preferable to an OSM pin with an invented one.

## Debugging Guidance

When adding or changing diagnostics:

- include the place name
- include stored and geocoded coordinates when available
- include mismatch distance and reason
- make the result easy to screenshot and log-search

## Implementation Note

If a change affects selection, narration, or eligibility, ask whether it helps user trust and orientation before increasing narration frequency.
