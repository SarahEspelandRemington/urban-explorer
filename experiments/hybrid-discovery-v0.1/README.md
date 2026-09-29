# Streetlit Hybrid Discovery v0.1 — experimental harness

**Status: experimental, offline, non-production.** Nothing here is imported by
`artifacts/api-server`, wired into Walk Mode, or connected to any cache,
runtime, or the real `curatedLocalHistory.ts` registry. It is a standalone
TypeScript module tree runnable only via a local script, for evaluating the
hybrid-discovery flow described in the Spring Garden research sessions:

```
approved source registry -> claim extraction (data, not code) ->
provenance-aware claim checks -> deterministic place grounding ->
editorial-quality assessment -> AUTO-ADMIT / HOLD / SUPPRESS
```

## What this is and isn't

- The claim _dataset_ (`data/springGardenClaims.ts`) is hand-transcribed from
  claims actually gathered by manual research (WebFetch/WebSearch) against
  Spring Garden Street, 22nd->17th, in prior sessions. This harness does not
  itself scrape the web or call an LLM to extract claims — extraction is
  treated as an upstream step; this harness implements and tests the
  downstream checking/grounding/decision logic against real claim data.
- Source capability profiles (`sourceRegistry.ts`) are also hand-authored
  from what was actually observed about each source in this research, not
  invented.
- Nothing here should be read as changing, superseding, or informing
  `CURATED_LOCAL_HISTORY` in production. Any overlap in address/content with
  that file is coincidental to both describing the same real street.

## Running it

```
scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run.ts
```

Prints a per-claim decision table to stdout and writes
`experiments/hybrid-discovery-v0.1/report.json` with the full structured
output for further inspection.
