---
name: runtime-sync-verification
description: Verify the full runtime chain before asking the user to field-test on their phone. Use whenever a task affects client code, server/API code, cache behavior, environment variables, mobile runtime behavior, deployment behavior, or anything the user is expected to test in Expo Go. Core principle: GitHub green does not prove the phone is running the latest app. Source on disk does not prove the running server is current.
---

# Runtime Sync Verification

Before asking the user to field-test, verify the entire runtime chain. Run this checklist whenever a task touches client code, server/API code, cache keys, environment variables, mobile runtime behavior, or production deployment.

**Never diagnose product behavior from field test results until the runtime chain is verified.**

---

## Checklist

### 1. Identify the runtime target

- Read `artifacts/urban-explorer/lib/apiBase.ts` and the Expo dev workflow command to confirm `EXPO_PUBLIC_API_URL`.
- The dev workflow sets: `EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-https://city-explorer-guide-sarahremington.replit.app}` — the fallback is always the **production** server, not the dev server.
- Confirm whether the phone is hitting dev or production. Do not assume dev.

### 2. Confirm client bundle freshness

- If client code changed since the last Metro bundle, instruct the user to reload with cache cleared.
- The correct Replit equivalent of `expo start -c` is to restart the `artifacts/urban-explorer: expo` workflow.
- Tell the user the exact visual or debug tell that proves the new bundle is loaded (e.g., a changed label, a new debug field in the overlay, a specific log line).

### 3. Confirm API/server freshness

- If server code changed, confirm the running server reflects those changes.
- **Dev server**: the `artifacts/api-server: API Server` workflow rebuilds on restart. Check its startup log for a known config value (e.g., `forwardBiasMeters`, `offAxisPenaltyDeg`) or a newly added log line.
- **Production**: source code on disk ≠ the running binary. GitHub green ≠ production is current. Check production startup logs via `fetch_deployment_logs`.

### 4. Confirm production deployment status

When the phone uses the production URL (`city-explorer-guide-sarahremington.replit.app`):

1. Call `getDeploymentInfo()` to confirm the current deployment is active.
2. Fetch recent deployment logs and look for a startup config log line that proves the new binary is running (e.g., `forwardBiasMeters=60`).
3. If production logs show old config values, say so clearly and trigger a redeploy (`suggestDeploy()`).
4. After Publish: do **not** stop at "server is up." Verify the new binary is live with a live API request that would be impossible from the old build. If deployment logs lag, the live response is the source of truth — explain what about the response proves the new code path is active.

**Verifying new build is live (production):**
```javascript
// Example: fire a known-differentiating request and check the response shape
const r = await fetch('https://city-explorer-guide-sarahremington.replit.app/api/explore/discover', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ latitude: LAT, longitude: LNG, radius: 300, walkMode: true, osmAnchor: true }),
});
const data = await r.json();
const osmCount = (data.places ?? []).filter(p => p.candidateSource === 'osm').length;
// osmCount > 0 proves the osmAnchor branch is running — impossible from old build
```

### 5. Confirm cache state

- **Client AsyncStorage**: tile cache uses a versioned prefix (`STORAGE_PREFIX`). Tile keys include radius, so a radius change naturally invalidates old tiles. The 24h TTL and 60-tile LRU cap are the eviction mechanisms — not force-quitting Expo Go.
- **Server in-memory caches**: LLM result cache (15 min TTL), Overpass cache (5 min TTL), audio cache. A server restart clears these. A new production deploy also clears them (new process).
- **Discover cache key**: includes version suffix (e.g., `v39`). If the Overpass query or LLM prompt changes, bump the version to invalidate cached results. Run `pnpm run update:prompt-manifest` after bumping.
- If stale cache is suspected, clearly distinguish: raw cached data vs. what the app is actively displaying.

### 6. Confirm request/response contract

For any API-affecting change, trace one live request to the actual URL the phone uses:

- Request URL and method
- Request body flags (e.g., `walkMode`, `osmAnchor`, `radius`)
- Cache hit or miss (check server logs for cache key)
- Which server branch was taken
- Response shape (field names, counts, source labels)
- A field or value that is only possible from the new code path

### 7. Confirm test readiness

Before telling the user to field-test, provide all of the following:

- What to do on the phone (hard-close, reload from dev menu, scan new QR, etc.)
- Whether AsyncStorage needs clearing (and how)
- What to expect to see in the app or debug overlay
- What would prove the new client bundle is running
- What would prove the current API server is running
- What would indicate stale client/server/cache state

### 8. Report statuses separately

Always report these as distinct items — never conflate them:

| Status | What it means |
|---|---|
| **GitHub Actions green** | Code passed CI checks |
| **Local checks pass** | lint/typecheck/format passed in dev |
| **Metro/bundle current** | Expo Go is serving the latest source |
| **Dev API server current** | Dev server rebuilt with latest source |
| **Production deployed** | A Publish was requested |
| **Production verified** | Deployed server is actually running the new build |
| **Runtime verified** | Phone + API server are testing the intended code path |

---

## Project-specific reference

- **Production URL**: `https://city-explorer-guide-sarahremington.replit.app`
- **API URL source**: `artifacts/urban-explorer/lib/apiBase.ts` reads `EXPO_PUBLIC_API_URL`
- **Dev Expo workflow**: `artifacts/urban-explorer: expo`
- **Dev API workflow**: `artifacts/api-server: API Server`
- **Startup log marker**: `Walk Mode heading-bias config loaded` — contains `forwardBiasMeters`, `offAxisPenaltyDeg`, `offAxisPenaltyMeters` (current expected: 60 / 30 / 500)
- **Discover cache key format**: `${modeKey}:v39:${searchRadius}:${lat},${lng}...` (bump version on Overpass/prompt changes)
- **Client tile cache prefix**: `STORAGE_PREFIX` in `lib/placeCache.ts`; tile keys include radius, so radius changes auto-invalidate
- **Prompt manifest**: `scripts/prompt-manifest.json` — run `pnpm run update:prompt-manifest` after any change to `explore/index.ts` that affects cached LLM output
