# Streetlit — Operational Runbook

> Last updated: 2026-06-09. Documentation only — does not affect any app code.

---

## 1. Repo structure (high level)

```
urban-explorer/                   ← GitHub repo root = Replit workspace root
├── artifacts/
│   ├── api-server/               ← Express 5 API backend (Node 24, TypeScript)
│   │   ├── src/routes/explore/   ← All discovery, narration, walk, route endpoints
│   │   └── config/               ← walk-config.json, boring-building-types.json
│   ├── urban-explorer/           ← Expo / React Native mobile app (SDK 54)
│   │   ├── app/                  ← expo-router file-based screens
│   │   ├── components/           ← Shared UI components
│   │   ├── contexts/             ← WalkModeContext, SettingsContext, etc.
│   │   ├── lib/                  ← walkEligibility, audio helpers, etc.
│   │   ├── constants/            ← colors.ts, categories.ts, buildingTypeGroups.ts
│   │   ├── app.config.js         ← Expo dynamic config (bundle ID, plugins, EAS ID)
│   │   ├── eas.json              ← EAS build profiles (development, development-simulator)
│   │   └── docs/                 ← This file and field-testing notes
│   └── mockup-sandbox/           ← Dev-only Vite canvas preview server (not deployed)
├── lib/
│   ├── api-spec/                 ← OpenAPI spec (source of truth for API contracts)
│   ├── api-zod/                  ← Generated Zod schemas
│   ├── api-client-react/         ← Generated React Query hooks
│   └── db/                       ← Drizzle ORM schema (PostgreSQL)
├── scripts/                      ← CI dashboard, prompt-manifest checker, etc.
├── pnpm-workspace.yaml           ← Workspace catalog and package discovery
└── .github/workflows/            ← CI pipeline (typecheck, lint, format, privacy tests)
```

---

## 2. How the API server runs in Replit

Workflow name: **`artifacts/api-server: API Server`**

Command: `pnpm --filter @workspace/api-server run dev`

- Runs `esbuild` to produce `artifacts/api-server/dist/index.mjs`, then starts it with `node --enable-source-maps`.
- Binds to the `PORT` environment variable (assigned by Replit; proxied through the shared reverse proxy at `/api`).
- Required environment variables (set in Replit Secrets):
  - `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` — provisioned automatically by the Replit OpenAI integration.
  - `SESSION_SECRET` — long random string; add manually via Replit Secrets.
- Database: Replit-provisioned PostgreSQL; schema managed by Drizzle (`pnpm --filter db push`).
- Logs visible in the Replit workflow panel. Use `req.log` in route handlers; `logger` singleton elsewhere. Never `console.log`.

---

## 3. How the Expo client runs in Replit / Expo Go

Workflow name: **`artifacts/urban-explorer: expo`**

The dev script starts Metro Bundler in **Expo Go mode** (`--go` flag) and serves it over the Replit proxy:

```
expo start --go --localhost --port $PORT --max-workers 4
```

- The Replit preview pane shows a QR code or direct link.
- Scanning with the Expo Go app on a phone loads the JS bundle over the network.
- **This mode uses Expo Go as the native runtime.** It does not use the EAS dev client.
- Known limitation: Walk Mode native features (background location, lock-screen audio) do not work correctly in Expo Go. See §10.

The `--go` flag is intentionally left in place so the Replit preview pane remains usable for UI development. Do not remove it until you are ready to retire Expo Go as a testing surface.

---

## 4. Current production API URL

```
https://city-explorer-guide-sarahremington.replit.app
```

All API endpoints are under `/api/`:

- `POST /api/explore/discover` — Walk Mode and Explore discovery
- `POST /api/explore/walk-narration` — narration text
- `POST /api/explore/walk-narration-audio` — TTS audio
- `GET  /api/explore/walk-config` — Walk Mode runtime parameters
- `GET  /api/healthz` — health check

---

## 5. Mobile API URL configuration

The mobile app points to production by default. The URL is injected at Metro startup via the dev script:

```
EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-https://city-explorer-guide-sarahremington.replit.app}
```

To point a local dev session at a different API, set `EXPO_PUBLIC_API_URL` in the environment before starting Metro. The app reads it via `process.env.EXPO_PUBLIC_API_URL` at bundle time — it is baked into the JS bundle, not resolved at runtime.

---

## 6. How to redeploy production

1. Push or merge changes to the `main` branch on GitHub.
2. Open the **Deployments** panel in Replit.
3. Click **Redeploy** (or the equivalent publish action).
4. Wait for the healthcheck to go green — the production container restarts and runs the new build.

The production container runs: `node --enable-source-maps artifacts/api-server/dist/index.mjs`

It does **not** pick up changes automatically on push. A manual redeploy trigger is required each time.

---

## 7. How to verify production is running the latest code

**Step 1 — Check the GitHub HEAD commit:**

```bash
# In the repo, after pushing:
git log --oneline -3
```

The latest commit SHA should match what you pushed.

**Step 2 — Hit the healthcheck:**

```bash
curl https://city-explorer-guide-sarahremington.replit.app/api/healthz
# Expected: {"status":"ok"}
```

**Step 3 — Check production logs for the new deployment marker:**

After a redeploy, the production log stream will show:

```
[Info] starting up user application
[info] Loaded BORING_BUILDING_TYPES from config file ...
```

This is the new process starting. Any log lines with the old pid are pre-redeploy.

**Step 4 — For Overpass specifically, verify the OSM anchor path is active:**

```bash
curl -s -X POST https://city-explorer-guide-sarahremington.replit.app/api/explore/discover \
  -H "Content-Type: application/json" \
  -d '{"latitude":39.966,"longitude":-75.174,"walkMode":true,"osmAnchor":true,"searchRadius":300}' \
  | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('overpassFallback:', d.get('overpassFallback','ABSENT — OSM path OK'))
print('osmCandidateCount:', d.get('osmCandidateCount'))
print('places:', len(d.get('places',[])))
"
```

Expected output (OSM anchor path working):

```
overpassFallback: ABSENT — OSM path OK
osmCandidateCount: {'r150': N, 'r300': N, 'r500': N}
places: 20–30
```

If `overpassFallback: True` appears, Overpass is unavailable and the LLM fallback is active.

---

## 8. How to run checks before pushing

All of these must pass before pushing. Run them from the workspace root:

```bash
pnpm run typecheck        # TypeScript — all packages
pnpm run lint             # ESLint + conflict markers + prompt-manifest check
pnpm run format:check     # Prettier — fails if any file is unformatted
pnpm run format           # Auto-fix formatting (run this, then re-check)
```

If you modify `artifacts/api-server/src/routes/explore/index.ts` in any way that changes an LLM cache-key version token (e.g. `osm:v43` → `osm:v44`), you must also run:

```bash
pnpm run update:prompt-manifest
```

Then commit the updated `scripts/prompt-manifest.json` alongside your code change. The lint check (`check:prompt-manifest`) will fail on CI if you forget this.

**Privacy tests** (run separately if you touch Sentry-related code):

```bash
pnpm --filter @workspace/urban-explorer run test
```

---

## 9. Current EAS dev-client status

| Item                                            | Status                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `expo-dev-client` package                       | ✅ Installed — `~6.0.20` in `package.json`                         |
| `expo-dev-client` plugin                        | ✅ Registered — first entry in `app.config.js` plugins array       |
| EAS project ID                                  | ✅ Set — `9b30343d-86e4-4227-9d0c-01b5a4376780` in `app.config.js` |
| Bundle identifier                               | ✅ `com.urbanexplorer.app`                                         |
| `eas.json`                                      | ✅ Created — `artifacts/urban-explorer/eas.json`                   |
| `development` profile (physical device)         | ✅ Present — requires Apple Developer account                      |
| `development-simulator` profile (iOS Simulator) | ✅ Present — no Apple Developer account needed                     |
| EAS build run                                   | ❌ Not yet triggered — no dev client binary exists yet             |
| Apple Developer account                         | ❌ Not yet — needed for physical device build only                 |

---

## 10. Current known runtime issues

### Native crash in Expo Go (Walk Mode)

**Symptom:** Walk Mode triggers repeated native crash-reconnect cycles in Expo Go (15+ crashes observed). Metro log shows a reconnection loop, not a JS error.

**Root cause:** `react-native-maps` version mismatch. The project uses `1.18.0`; Expo SDK 54's Expo Go binary ships `1.20.1`. The native bridge diverges between the JS bundle and the runtime binary.

**Fix:** Build a dev client using EAS (see §13). The dev client embeds exactly the native modules declared in `package.json`, eliminating the mismatch. Upgrading `react-native-maps` to `1.20.1` to continue using Expo Go is not recommended because Walk Mode also relies on background location and lock-screen audio, which Expo Go cannot run correctly.

**Workaround until dev client is built:** Walk Mode cannot be tested in Expo Go. All other screens work normally.

---

### Overpass provider race — live and production-verified

**Current state (as of 2026-06-09):** The Overpass provider race is live in production.

- `overpass-api.de` (the original single endpoint) is IP-throttled from Replit's production container — every request timed out at 6s with `AbortError`.
- The fix races `overpass.openstreetmap.fr` (primary) and `overpass-api.de` (fallback) using `Promise.any()`.
- The French instance (`openstreetmap.fr`) responds from production. Confirmed by post-redeploy production logs: `[osm-anchor] Wikipedia enrichment ready`, `overpassFallback: ABSENT`, `osmCandidateCount.r300 = 24`.
- The `[overpass] provider responded` log line was added for ongoing monitoring. If it goes silent and `[osmAnchor] Overpass unavailable` reappears, the FR instance has also been blocked and a third provider or self-hosted alternative will be needed.

**Timeout chain (current):**

| Layer                             | Value                       |
| --------------------------------- | --------------------------- |
| Overpass QL `[timeout:N]`         | `9s` (server-enforced)      |
| `AbortController`                 | `10s` (client-side abort)   |
| Outer `Promise.race` null-resolve | `12s` (belt-and-suspenders) |

---

### OSM-anchor discovery vs LLM-fallback discovery

Walk Mode runs two distinct paths depending on Overpass availability:

**OSM-anchor path (current normal state):**

- Fetches real map data from Overpass → verified lat/lng for all returned places
- LLM brainstorm is seeded with real OSM place names and tags → higher accuracy
- `coordSource: "osm"` on all places → no `autoNarrationBlocked`
- `osmCandidateCount` populated in response
- `overpassFallback` absent from response

**LLM-fallback path (triggered if Overpass fails):**

- LLM invents place names with no OSM grounding
- Nominatim name-search used to verify coordinates → `coordSource: "nominatim-confirmed"` or `"llm"`
- `autoNarrationBlocked: true` on unverified places unless `overpassFallbackMode` clears it
- `verifyAddressCoherence` provides a second filter (geocodes the place address; rejects if it lands in a different city)
- `overpassFallback: true` present in response
- Response time typically 23–51s

---

### Cold discover requests are slow; cached requests are fast

The LLM step (even on the OSM-anchor path) takes 5–25s on a cache miss. Results are cached in memory (15-minute TTL) and also in the PostgreSQL database (persisted across restarts). After the first request for a tile, all subsequent requests return in under 500ms.

Walk Mode issues one discover call per grid tile as you walk. The first time you visit a new tile, there will be a brief delay. Revisiting the same tile (or areas near where others have walked) is instant.

---

## 11. Do not touch casually

These areas have subtle behaviour that is easy to break and hard to diagnose in the field:

| Area                                                                                             | Why                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offAxisPenaltyDeg`, `offAxisPenaltyMeters`, `maxQueueDistance`, `discoverRadius` in walk-config | Carefully tuned for urban canyon heading accuracy. Changes affect what auto-narrates during a walk.                                                                                                                          |
| `pickNext` in `WalkModeContext.tsx`                                                              | Contains the 90° hard exclusion gate and directional scoring. Logic is tightly coupled to GPS-velocity vs compass fallback.                                                                                                  |
| Overpass query shape in `fetchNearbyOSMPlaces`                                                   | The 13-clause union query is balanced for coverage vs speed. Adding broad clauses (e.g. bare `nwr["name"]`) can cause multi-second Overpass responses.                                                                       |
| LLM cache-key version tokens (`osm:v43`, etc.)                                                   | Bumping a version evicts all cached results for that namespace from the DB. Correct to do after logic changes, destructive if done accidentally. After bumping, run `pnpm run update:prompt-manifest` and commit both files. |
| `OVERPASS_PROVIDERS` array order                                                                 | FR is first intentionally — it is the provider that works from production IP. Do not swap the order without re-verifying both providers from the production container.                                                       |
| Privacy scrubbing in Sentry calls                                                                | Governed by the `no-pii-in-sentry` ESLint rule and a dedicated test suite. Adding new location or user data to Sentry events without going through the scrubber is a privacy violation.                                      |
| `postProcessPlaces` pipeline                                                                     | `verifyPlaceCoordinates` → `verifyAddressCoherence` → quality filters run in strict order. Reordering or skipping steps changes what places reach the client.                                                                |
| `newArchEnabled: true` in `app.config.js`                                                        | New Architecture is on. Any native package added must be verified as New Arch compatible before installing.                                                                                                                  |

---

## 12. Immediate next-step checklist

- [ ] **Build the iOS Simulator dev client** — eliminates the Expo Go native crash so Walk Mode can be tested (see §13)
- [ ] **Field-test Walk Mode on a real device** — requires the physical-device EAS build (`development` profile), which requires an Apple Developer account
- [ ] **Monitor `[overpass] provider responded` in production logs** — confirms which provider is serving Overpass data on an ongoing basis
- [x] **Walk Mode rebuild (T001–T008)** — address coherence rejection (`verifyAddressCoherence`), narration spatial anchor + `crossStreets`, `walkEligibility.ts` with reason tags, `maybeNarrate` re-validation guard (stale/behind90/addressMismatch), `narrationIsPassed` badge, Settings-gated `WalkModeDebugOverlay`, 370 tests passing, pushed to GitHub

---

## 13. How to build the iOS Simulator dev client on a Mac

### Prerequisites (one-time)

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Log in with your Expo account (free account, no Apple Developer account needed)
eas login
```

Xcode must be installed on your Mac (available from the Mac App Store, free).

### Build the simulator binary

Run from the Expo project root (wherever you have the repo checked out locally):

```bash
cd path/to/urban-explorer/artifacts/urban-explorer
eas build --platform ios --profile development-simulator
```

This runs the build remotely on EAS infrastructure (~15–25 minutes). When it finishes, EAS provides a download link for a `.tar.gz` containing the `.app` bundle. No Apple Developer account or signing certificates are required for simulator builds.

**Profile used** (`artifacts/urban-explorer/eas.json`):

```json
"development-simulator": {
  "developmentClient": true,
  "distribution": "internal",
  "ios": {
    "simulator": true
  }
}
```

### Install into the iOS Simulator

```bash
# Extract the downloaded archive, then install:
xcrun simctl install booted UrbanExplorer.app

# Launch the app:
xcrun simctl launch booted com.urbanexplorer.app
```

The Simulator must already be running (open Xcode → open Simulator, or `open -a Simulator`).

### Start Metro for dev-client mode

```bash
cd path/to/urban-explorer/artifacts/urban-explorer
npx expo start --dev-client
```

The simulator app shows a connection screen and auto-connects to Metro on the same machine. From this point, all JS/TS edits hot-reload instantly — no rebuild needed.

> **Important:** Use `--dev-client`, not `--go`. The dev client binary refuses connections from a `--go` Metro server.

### When to rebuild the dev client

A new EAS build is required whenever the **native layer** changes:

- Upgrading `react-native-maps`, `expo-location`, `expo-audio`, or any other package with native code
- Adding a new package that contains native code
- Adding a new entry to the `plugins` array in `app.config.js`
- Changing `infoPlist`, `UIBackgroundModes`, permissions, or `bundleIdentifier`
- Upgrading the Expo SDK
- Toggling `newArchEnabled`

All other changes (JS/TS files, styles, screens, API changes) hot-reload without a rebuild.

### Physical device build (future — requires Apple Developer account)

When you have an Apple Developer Program membership ($99/year):

```bash
# Register your iPhone's UDID with EAS
eas device:create

# Build for physical device
eas build --platform ios --profile development
```

**Profile used**:

```json
"development": {
  "developmentClient": true,
  "distribution": "internal",
  "ios": {
    "simulator": false,
    "resourceClass": "m-medium"
  },
  "android": {
    "buildType": "apk"
  }
}
```

EAS manages certificates and provisioning profiles automatically. Install the resulting build by scanning the QR code EAS provides, then trust the developer certificate in iOS Settings → General → VPN & Device Management.

---

## 14. Simulator freshness / runtime evidence

### Core rules

- **The Simulator / Expo Go always calls the production API by default.** `EXPO_PUBLIC_API_URL` is set to `https://city-explorer-guide-sarahremington.replit.app` by the dev workflow script.
- **Local API server changes are invisible to the Simulator** unless `EXPO_PUBLIC_API_URL` is explicitly overridden to point at the local dev server before Metro starts.
- **Server / API changes require a production deploy** before the Simulator can verify them. Changing `artifacts/api-server/` and reloading Expo Go will not pick up those changes.
- **Client changes require Metro to re-bundle.** Reload Expo Go (shake → Reload, or press R in the Metro terminal) after any JS/TS edit.
- **`EXPO_PUBLIC_*` variables are baked into the JS bundle at Metro start time.** They are not resolved at runtime. If you change a `EXPO_PUBLIC_*` value, you must stop and restart the Metro workflow — a hot reload is not enough.
- **Diagnose stale Simulator behavior before assuming the code failed.** Work through the checklist below before filing a bug.

### Required runtime evidence template

Include this block in every test report that involves the Simulator or Expo Go:

```
## Runtime Evidence
- Tested surface:         [ Simulator (Expo Go) | Simulator (dev client) | Physical device ]
- Metro URL:              https://$REPLIT_EXPO_DEV_DOMAIN  (local port 23584)
- API base URL in bundle: <value of EXPO_PUBLIC_API_URL at Metro start>
- API target:             [ production | local dev (port 8080) ]
- Code source / commit:   local HEAD <SHA>  /  GitHub HEAD: <SHA>
- Freshness step:         [ Expo Go reload (R) | --reset-cache restart | Simulator erase ]
- Evidence observed:      <visible UI change or log line confirming the change is live>
```

### Fresh Simulator test checklist

Run through this before testing any change:

1. **Identify the change type:** client code, API server code, or both.
2. **If you changed API server code:** deploy to production first (`Deployments → Redeploy`). The Simulator cannot see local dev-server changes.
3. **If you changed an `EXPO_PUBLIC_*` env var:** stop the Expo workflow and restart it so Metro re-reads the variable.
4. **If you changed client code:** reload Expo Go (shake the device → Reload, or press R in the Metro terminal).
5. **If stale behavior persists after a reload:** restart the Expo workflow with `--reset-cache` to clear Metro's on-disk transform cache:
   ```bash
   pnpm --filter @workspace/urban-explorer exec expo start --go --localhost --port $PORT --max-workers 4 --reset-cache
   ```
6. **If AsyncStorage / persisted app state may be involved** (saved places, route history, banner dismissals, settings flags): erase Simulator content — iOS Simulator → **Device → Erase All Content and Settings**.
7. **Record runtime evidence** (template above) before calling a test result valid.

### AsyncStorage keys that persist across app restarts

These are the keys the app writes to `AsyncStorage` and that survive killing and relaunching the app in Simulator. They are only cleared by erasing Simulator content.

| Key | What it holds |
| --- | --- |
| `urban-explorer.notificationLocale` | Locale preference |
| `walk_banner_dismissed` | Walk Mode banner state |
| `walk_welcome_dismissed` | Walk Mode welcome state |
| `@urban_explorer_saved` | Saved places |
| `recentWalkRoutes` | Recent walk routes |
| `walk_show_prefetch_stats` | Prefetch stats overlay toggle |
| `walk_debug_overlay_enabled` | Walk Mode debug overlay toggle |
| `explore_debug_overlay_enabled` | Explore debug overlay toggle |
| Custom message keys (`customMessages.ts`) | Discovery / detail message overrides |
