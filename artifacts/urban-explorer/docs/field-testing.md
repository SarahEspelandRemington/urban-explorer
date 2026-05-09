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

- **Location permission prompts** — grant "Always" for full walk mode
  narration.
- **Walk mode narration** — verify MP3 audio plays and the Now Playing lock
  screen module appears.
- **Building discovery** — walk around and confirm the explore tab populates
  with nearby places.
- **Search** — try typed place searches away from your home area.
- **Background location** — lock the screen during a walk and confirm
  narration continues.
- **Offline / poor signal** — confirm the app degrades gracefully rather than
  crashing.

## Sentry crash reporting during testing

The app will report crashes to Sentry if `EXPO_PUBLIC_SENTRY_DSN` is set at
build time. For development builds this is usually left unset to avoid
polluting production Sentry data. If you want crash reports during field
testing, set the DSN in your shell before running the build command:

```bash
export EXPO_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project
```
