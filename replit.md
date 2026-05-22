# Urban Explorer

[![CI](https://github.com/SarahEspelandRemington/urban-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/SarahEspelandRemington/urban-explorer/actions/workflows/ci.yml)

A mobile app that surfaces AI-generated historical and factual information about buildings and spaces based on the user's GPS location.

## Run & Operate

- `pnpm run typecheck`: Type-check all packages.
- `pnpm run build`: Type-check and build all packages.
- `pnpm run lint`: Run ESLint for `urban-explorer` and `api-server`.
- `pnpm run format:check`: Check that all files are formatted with Prettier (CI gate — fails if any file is unformatted; run `pnpm run format` to fix).
- `pnpm run format`: Auto-format all files with Prettier.
- `pnpm --filter @workspace/api-spec run codegen`: Regenerate API hooks and Zod schemas.
- `pnpm --filter @workspace/db run push`: Push DB schema changes (development only).
- `pnpm --filter @workspace/api-server run dev`: Run API server locally.

**Required Environment Variables:**

- `AI_INTEGRATIONS_OPENAI_BASE_URL` (provisioned by Replit OpenAI integration)
- `AI_INTEGRATIONS_OPENAI_API_KEY` (provisioned by Replit OpenAI integration)
- `SESSION_SECRET`: A long random string (e.g., `openssl rand -hex 32`).
- `EXPO_PUBLIC_SENTRY_DSN`: (Optional) Sentry DSN for crash reporting.
- `AUDIO_DB_MAX_ENTRIES`: (Optional) Maximum audio rows kept in the database (positive integer, default 100). Missing values default silently to 100; present-but-invalid values log a warning and fall back to 100.
- `OSM_CACHE_MAX_SIZE`: (Optional) Maximum entries in the short-lived proximity OSM cache (positive integer, default 200). Oldest entry is evicted LRU-style when the cap is reached.
- `UPLOAD_MAX_FILES`: (Optional) Maximum number of files per multipart upload request (positive integer, default 10).
- `UPLOAD_MAX_FIELDS`: (Optional) Maximum number of non-file fields per multipart upload request (positive integer, default 20).
- `UPLOAD_MAX_PARTS`: (Optional) Maximum total parts (files + fields combined) per multipart upload request (positive integer, default UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS = 30).
- `UPLOAD_MAX_FILE_SIZE`: (Optional) Hard cap in bytes for a single uploaded file (positive integer, default derived from UPLOAD_BODY_LIMIT = 10485760 = 10 MB). Per-endpoint `fileSizeOverride` still takes precedence.
- `UPLOAD_FIELD_SIZE`: (Optional) Maximum byte size for a non-file field value in any multipart upload request (positive integer, default 1048576 = 1 MB).
- `UPLOAD_STRICT_CONFIG`: (Optional) When set to `true` (case-insensitive), turns the startup warning about `UPLOAD_MAX_FILE_SIZE` exceeding `UPLOAD_BODY_LIMIT` into a hard failure (thrown `Error`). Intended for CI/CD pipelines that should reject misconfigured deployments before serving traffic. Default: `false` (warn-only).
- `DASHBOARD_SLOW_JOB_WINDOW`: (Optional, CI dashboard) Look-back window in runs used by the "consistently slowest job" bottleneck indicator in `gen-dashboard.js` (positive integer, default 5). Invalid values log a warning and fall back to 5.
- `DASHBOARD_SLOW_JOB_MIN_RUNS`: (Optional, CI dashboard) Minimum number of runs within the window in which a job must be the bottleneck before the trend indicator is shown (positive integer, default 3). Invalid values log a warning and fall back to 3.

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo (React Native)
- **Lint**: ESLint v9 flat config
- **Formatting**: Prettier
- **AI**: OpenAI via Replit AI Integrations

## Where things live

- `artifacts/urban-explorer/`: Expo React Native mobile application.
- `artifacts/api-server/`: Express API backend.
- `lib/api-spec/`: OpenAPI specification (source of truth for API contracts).
- `lib/db/`: Drizzle ORM database schema (source of truth for DB schema).
- `artifacts/urban-explorer/constants/colors.ts`: Design tokens (theme colors).
- `artifacts/urban-explorer/constants/categories.ts`: Category colors and icons.
- `artifacts/urban-explorer/constants/buildingTypeGroups.ts`: Building type filter definitions.
- `app.config.js`: Dynamic Expo configuration.

## Architecture decisions

- **AI Model Selection**: Uses specific OpenAI models (gpt-4.1-mini, gpt-4.1-nano) tuned for different API endpoints to balance speed, cost, and detail.
- **Location Grounding**: Prioritizes Nominatim (OpenStreetMap) for geocoding and location suggestions, falling back to LLMs for ambiguity. Integrates Overpass API to ground AI-generated history with verified OSM data.
- **Walk Mode Narration**: Prioritizes native pre-rendered MP3 audio via `expo-audio` for natural-voice TTS, falling back to `expo-speech` or Web Speech API. Includes a custom "Now Playing" module for lock screen integration.
- **Walk Mode Directional Scoring**: Heading uses GPS-velocity (movement vector) as primary signal, device compass as fallback — velocity is more reliable in urban canyons where steel-frame buildings can deflect magnetometers 90–180°. Velocity heading requires ≥12 m of consistent movement before it is trusted. `offAxisPenaltyDeg=45°` (raised from 30°), `offAxisPenaltyMeters=500m` (raised from 300m). Hard 90° exclusion gate in `pickNext`: when velocity heading is available, places more than 90° off the travel direction are completely skipped for auto-narration (not just penalised). `forwardBiasMeters=60m` cosine bonus with no `dist/3` cap (cap removed — maxQueueDistance now prevents far-avenue jumps). **PIN VISIBILITY vs AUTO-NARRATION**: all places within `memoryRadius=800m` appear as map pins; auto-narration is gated separately by `maxQueueDistance`: dense=60m (tightened from 90m, now strictly within one Manhattan short block), sparse=90m (tightened from 120m). `discoverRadius` dense=120m / sparse=130m. `LOOK_AHEAD_METERS=30m` keeps the discover-circle on the user's actual block. Rating bonus capped at 30m. Overridable via `WALK_OFF_AXIS_PENALTY_DEG`, `WALK_OFF_AXIS_PENALTY_METERS`, `WALK_FORWARD_BIAS_METERS` env vars.
- **Dynamic Map Discovery**: Implements a debounced auto-discovery mechanism (150m+ pan) for map views, accumulating and deduplicating markers.
- **Robust Caching & In-Flight Dedup**: In-memory caches for LLM results (15min TTL) and Overpass results (5min TTL). Concurrent cache-miss requests for the same key are coalesced onto a single LLM/TTS call via in-flight Maps (`inFlightNarration`, `inFlightAudio`, `inFlightDetail`), preventing duplicate paid API calls.
- **OSRM Provider Racing**: Route endpoint races multiple OSRM providers with `Promise.any()` and returns the fastest successful result. Distinguishes reachable-but-no-route (404) from all-providers-failed (502).
- **Privacy by Design**: Extensive PII scrubbing and anonymization for Sentry crash reporting, tested with a dedicated test suite and enforced by a custom ESLint rule.

## Product

- **Location-based Discovery**: Users discover historical facts about nearby places using GPS or manual search.
- **Walk Mode**: Provides pre-planned routes with OSRM, real-time proximity-based narration, and building type filtering.
- **Place Details & Timeline**: Offers detailed historical information and a "Time Travel" feature visualizing changes over eras.
- **Saved Places**: Users can bookmark interesting locations.
- **Accessibility**: Designed for WCAG AA compliance with appropriate roles, labels, and touch targets.
- **Crash Reporting & Monitoring**: Integrated Sentry for robust crash reporting, with custom dashboards and anomaly-detection alerts for narration prefetch hit rates and audio fallback rates.

## New account setup

Follow these steps in order when importing this project into a fresh Replit
account. The `post-merge.sh` script (`pnpm install` + `db push`) runs
automatically after every task merge and covers steps 3 and 5.

**Step 1 — Import from GitHub**
Create a new Replit and import from
`https://github.com/SarahEspelandRemington/urban-explorer`. Replit will clone
the repo and install dependencies automatically.

**Step 2 — Connect the OpenAI integration**
Open the Integrations panel in Replit and connect the **OpenAI** integration.
This automatically provisions `AI_INTEGRATIONS_OPENAI_BASE_URL` and
`AI_INTEGRATIONS_OPENAI_API_KEY`. The API server will not start without these.

**Step 3 — Add `SESSION_SECRET`**
Go to Replit Secrets and add:

```
SESSION_SECRET=<output of: openssl rand -hex 32>
```

The server starts but all session-based features silently break without this.

**Step 4 — Set GitHub Actions variables**
In the GitHub repo Settings → Variables → Actions, set:

```
MAX_NEW_WARNINGS=<copy value from original repo>
```

This controls the CI warning gate. CI will fail on every PR until it is set.

Optionally, also set:

```
DASHBOARD_BUILD_SPIKE_PCT=20
```

This controls the build-time spike threshold (%) shown in the CI dashboard. Defaults to `20` if unset. Raise or lower it from the GitHub UI without editing any workflow YAML.

**Step 5 — Push the database schema**
The PostgreSQL database is provisioned automatically by Replit. Run:

```bash
pnpm --filter db push
```

This is idempotent and safe to re-run. `post-merge.sh` does this automatically
after each task merge.

**Step 6 — Start the workflows**
Start the `artifacts/api-server: API Server` and
`artifacts/urban-explorer: expo` workflows from the Replit workflow panel. The
Expo workflow serves the mobile app preview; the API workflow serves `/api/*`.

**Optional — Sentry**
Add `EXPO_PUBLIC_SENTRY_DSN` to Replit Secrets if you want crash reporting.
Leave it unset to run without Sentry — the app handles the missing DSN
gracefully.

**Optional — EAS / field testing**
See `artifacts/urban-explorer/docs/field-testing.md` for instructions on
building a custom dev client for real-device field testing.

## User preferences

- **Always push to GitHub at the end of every session** (or when the user asks). This account may be deleted, so GitHub is the source of truth. Use the GitHub API to push any changed files before closing out.
- **Walk Mode should follow phone-away trust**: prioritize spatial accuracy and user confidence over narration frequency. Cross-street / barrier correctness comes first, silence is a deliberate product choice when confidence is low, and debug output should explain decisions without driving them.

## Gotchas

- **OpenAI Integration**: The API server requires the Replit OpenAI integration to be connected to provision necessary environment variables.
- **Secrets**: `SESSION_SECRET` must be manually added to Replit Secrets. Sentry source map upload secrets are EAS build-time secrets, not Replit secrets.
- **Database**: Database contents are _not_ exported. `db push` recreates the schema but wipes data.
- **PII Scrubbing**: Be mindful of PII when interacting with Sentry calls, as sensitive data is automatically scrubbed. Use the custom ESLint rule `no-pii-in-sentry.mjs` to detect potential leaks.
- **Sentry Anomaly Detection**: Requires ~7 days of history to build a reliable baseline. Use `PREFETCH_ALERT_DETECTION_TYPE=static` or `AUDIO_FALLBACK_ALERT_DETECTION_TYPE=static` for setup scripts if history is insufficient or Sentry plan doesn't support it.
- **Legacy Sentry Alerts**: If migrating from older Sentry configurations, ensure legacy combined audio fallback alerts are manually disabled/deleted to avoid double-paging.

## Pointers

- **pnpm workspaces**: [https://pnpm.io/workspaces](https://pnpm.io/workspaces)
- **Drizzle ORM**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
- **Zod**: [https://zod.dev/](https://zod.dev/)
- **Orval**: [https://orval.dev/](https://orval.dev/)
- **Expo Documentation**: [https://docs.expo.dev/](https://docs.expo.dev/)
- **Sentry Documentation**: [https://docs.sentry.io/](https://docs.sentry.io/)
- **Replit AI Integrations**: [https://docs.replit.com/ai/integrations](https://docs.replit.com/ai/integrations)
