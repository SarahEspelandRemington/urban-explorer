# Field Testing with a Custom Dev Client

This guide covers how to build and install a **custom development client** for
field-testing Urban Explorer on a real device. The custom dev client is the
recommended approach because the app uses native modules (`expo-audio`,
`expo-symbols`, `expo-glass-effect`, `react-native-keyboard-controller`) that
are not included in the standard Expo Go app.

## What is a custom dev client?

It is functionally identical to Expo Go — you scan a QR code to load the app
from your dev server — but it includes all of the project's native modules
baked in. Once installed on your device you don't need to rebuild it unless
you add or update a native dependency.

## Prerequisites

| Requirement                               | Notes                                                       |
| ----------------------------------------- | ----------------------------------------------------------- |
| EAS CLI                                   | `npm install -g eas-cli`                                    |
| Expo account                              | Free tier is fine. Sign up at [expo.dev](https://expo.dev). |
| Apple Developer account (iOS)             | Required to install on a physical device.                   |
| Android device or emulator                | No developer account required for `.apk` sideloading.       |
| Deployed API accessible from the internet | Confirmed working — see "API domain" below.                 |

## API domain

The API is deployed on Replit and publicly reachable. The domain to use as
`EXPO_PUBLIC_DOMAIN` when building is:

```
d396db13-d7ce-4556-8ad4-fd49bc264b79-00-cs4h4zd0r2ri.janeway.replit.dev
```

> **Note**: This domain is tied to the current Replit environment. If the
> project is moved to a new Replit account the domain will change and you will
> need to rebuild the dev client with the new domain value.

## One-time EAS project setup

If this is the first EAS build from this machine / account:

```bash
# Log in to your Expo account
npx eas-cli login

# Link the project to EAS (adds projectId to app.config.js)
cd artifacts/urban-explorer
npx eas-cli build:configure
```

`build:configure` will prompt you to create or select an EAS project and will
write the `extra.eas.projectId` field into `app.config.js` automatically.

## Building the dev client

Run from the **workspace root** so that pnpm workspace resolution works
correctly.

### iOS

```bash
EXPO_PUBLIC_DOMAIN=d396db13-d7ce-4556-8ad4-fd49bc264b79-00-cs4h4zd0r2ri.janeway.replit.dev \
  npx eas-cli build \
  --config artifacts/urban-explorer/eas.json \
  --profile development \
  --platform ios
```

EAS will ask whether to register your device. Say **yes** to add your device's
UDID to the provisioning profile so the `.ipa` can be installed without Xcode.
After the build finishes, EAS prints a QR code — scan it on your iPhone to
install.

### Android

```bash
EXPO_PUBLIC_DOMAIN=d396db13-d7ce-4556-8ad4-fd49bc264b79-00-cs4h4zd0r2ri.janeway.replit.dev \
  npx eas-cli build \
  --config artifacts/urban-explorer/eas.json \
  --profile development \
  --platform android
```

This produces an `.apk`. Download and sideload it on your Android device
(Settings → Install unknown apps).

## Starting your local dev server

After installing the dev client on your device, start the Metro bundler from
the **workspace root**:

```bash
pnpm --filter @workspace/urban-explorer run dev
```

Metro prints a QR code. Open the installed dev client on your device and scan
it. The app will load over your local network.

For field testing **away from your local network**, start Metro with tunnel
mode:

```bash
cd artifacts/urban-explorer && npx expo start --tunnel
```

Tunnel mode routes traffic through Expo's servers so your device can reach
Metro from anywhere, not just your local Wi-Fi.

## What to test in the field

Work through these sections in order. Items marked **[LOG]** have matching
console output you can read in Metro dev tools (press `j` in the terminal after
`pnpm --filter @workspace/urban-explorer run dev`) or in the Sentry breadcrumb
trail.

### 1 · Device setup

- [ ] Location permission: **"Always"** (iOS) / **"Allow all the time"** (Android) — precise, not approximate.
- [ ] Notifications permission granted (required for the foreground-service banner on Android).
- [ ] Start outdoors or near a window; indoor GPS is unreliable for heading.

### 2 · GPS lock and first discover

| Step                     | Expected                             | [LOG] tag                |
| ------------------------ | ------------------------------------ | ------------------------ |
| Tap **Start Walk**       | Spinner < 8 s, then first pin on map | `[refetch] first fix`    |
| Walk 3–5 m               | GPS summary log appears              | `[GPS] lat=… vel=…`      |
| `vel=` field after 12+ m | Shows degrees and `(fresh)`          | `[heading:vel]` accepted |
| `pool=` field            | Increases to > 0 within 30 s         | `[discover] server OK`   |

**Pass**: at least one pin visible within 30 s.

### 3 · Discover cache layers

Run on the **same block** you just walked.

| Step                                | Expected                               | [LOG] tag                             |
| ----------------------------------- | -------------------------------------- | ------------------------------------- |
| Stop walk, restart at same location | Pins appear instantly, no server call  | `[discover] storage hit`              |
| Move 5 m and trigger a refetch      | Same tile key → still an in-memory hit | `[discover] session hit`              |
| Walk 200+ m to a new tile           | HTTP request fires; new pins merge in  | `[discover] server fetch … server OK` |

**Pass**: second start-at-same-spot shows `storage hit` not `server fetch`.

### 4 · Narration pipeline

| Step                                              | Expected                                    |
| ------------------------------------------------- | ------------------------------------------- |
| Walk within 60 m (dense) / 90 m (sparse) of a pin | Narration starts ≤ 5 s                      |
| Audio quality                                     | Natural voice MP3, not robotic TTS fallback |
| **Now Playing** widget on lock screen             | Visible with place name                     |
| Skip button mid-narration                         | Audio stops immediately; next place queues  |
| Replay button (appears ~30 s after a skip)        | Plays same place from cache, no re-fetch    |
| Two pins in range simultaneously                  | Second place queues and plays after first   |

**Pass**: ≥ 3 narrations over 15 min with no permanent deadlock.

### 5 · Directional gating (velocity heading)

| Step                                | Expected                                      | [LOG] tag                    |
| ----------------------------------- | --------------------------------------------- | ---------------------------- |
| Walk a single direction 30+ m       | `vel=…(fresh)` in GPS log                     | `[heading:vel]`              |
| A pin 90°+ off your heading at 60 m | Skipped by auto-narration                     | `[pickNext] … SKIP 90° gate` |
| Turn to face the skipped pin        | Narration fires within one GPS cycle          | —                            |
| Stand still 35+ s                   | `vel=…(stale)` in GPS log; compass takes over | —                            |

**Pass**: no narrations fire for places clearly behind you while walking.

### 6 · Long walk / loop walk resilience

Run for a 45–90 min loop (same block several times).

| Step                            | Expected                                                                       | [LOG] tag                            |
| ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| Complete a full loop            | Places from the first pass do **not** re-narrate on the second pass within 1 h | `narrated=N` stays steady in `[GPS]` |
| Walk loop after 65+ min         | `narrated=` count drops; earlier places can re-narrate                         | —                                    |
| 45+ min in cached area          | No server fetches; only `session hit`                                          | `[discover] session hit`             |
| `pool=` in GPS log after 30 min | Stays bounded (< 300)                                                          | `[GPS] pool=…`                       |

**Pass**: no memory warnings after 60 min; narrations continue without deadlock.

### 7 · Auto-density switching

| Step                                   | Expected                                      |
| -------------------------------------- | --------------------------------------------- |
| Walk briskly (> 1.8 m/s for 90 s)      | Switches to **Sparse** (fewer, farther pins)  |
| Slow to a stroll (< 0.8 m/s for 120 s) | Switches to **Dense**                         |
| Manual density toggle                  | Persists 10 min; auto-switching resumes after |

### 8 · Background / lock-screen operation

_(Custom dev client only — Expo Go cannot test background location on iOS.)_

| Step                              | Expected                                               |
| --------------------------------- | ------------------------------------------------------ |
| Lock screen mid-walk              | Audio continues within 10 s of next pin entering range |
| Now Playing widget on lock screen | Displays place name and "Urban Explorer"               |
| Phone call during narration       | Audio pauses; resumes or drains queue after call ends  |
| Return from lock screen           | Map pins still visible; GPS dot tracking correctly     |

**Pass**: no missed narrations on a 10-min locked-screen walk.

### 9 · Network interruption

| Step                                   | Expected                                                        | [LOG] tag                             |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| Enable airplane mode mid-walk          | App keeps running; cached tiles still narrate                   | —                                     |
| Walk to an uncached tile while offline | Loading spinner clears, no crash                                | `[discover] server error … status=`   |
| Re-enable connectivity                 | Next movement triggers a fresh server fetch for the missed tile | `[discover] server fetch … server OK` |

### 10 · Stop / restart

| Step                                  | Expected                                         |
| ------------------------------------- | ------------------------------------------------ |
| Tap **Stop Walk**                     | Audio stops; Now Playing widget clears           |
| Tap **Start Walk** again at same spot | Fresh state; previously heard places re-narrate  |
| Stop and restart 3× rapidly           | No duplicate GPS subscriptions; no audio overlap |

### Reading the diagnostic logs

Filter Metro console output by these prefixes:

| Prefix                    | Meaning                                             |
| ------------------------- | --------------------------------------------------- |
| `[GPS]`                   | Position + heading snapshot every 10 s              |
| `[heading:vel]`           | Velocity heading accepted or rejected per fix       |
| `[refetch]`               | Refetch trigger fired (distance vs threshold shown) |
| `[discover] session hit`  | Tile already fetched this session (in-memory)       |
| `[discover] storage hit`  | Tile served from AsyncStorage 24 h cache            |
| `[discover] server fetch` | HTTP request to `/api/explore/discover`             |
| `[discover] server OK`    | N incoming places, M merged into pool               |
| `[discover] server error` | Non-2xx HTTP response                               |
| `[narration audio]`       | MP3 play start, watchdog trip, or error             |
| `[Speech.speak]`          | TTS fallback start / done / error                   |
| `[pickNext]`              | Candidate scoring and selection                     |
| `[maybeNarrate]`          | Blocked reason (cooldown, speaking, etc.)           |

**Healthy fresh-walk pattern:**

```
[refetch] first fix — triggering discover
[discover] server fetch tile=40.754,-73.988:120 radius=120m
[discover] server OK tile=40.754,-73.988:120 incoming=8 merged=8
[GPS] lat=40.75490 lng=-73.98820 vel=247°(fresh) cmp=248° pool=8 narrated=0 density=dense
[narration audio] play "Grand Central Terminal" uri=file://… gen=1
[narration audio] didJustFinish gen=1
```

**Trouble signs:**

- `vel=…(stale)` for > 30 s while moving — GPS velocity too weak; check for obstructions.
- `server error status=5xx` repeating — API server issue.
- `[narration audio] watchdog tripped` — MP3 decoder stall; MP3 file may be corrupt.
- `pool=0` after a discover — server returned no places; try clearing building-type filters.
- `[GPS]` log stops appearing — GPS subscription may have died; stop and restart the walk.

## Sentry crash reporting during testing

The app will report crashes to Sentry if `EXPO_PUBLIC_SENTRY_DSN` is set at
build time. For development builds this is usually left unset to avoid
polluting production Sentry data. If you want crash reports during field
testing, set the DSN in your shell before running the build command:

```bash
export EXPO_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project
```
