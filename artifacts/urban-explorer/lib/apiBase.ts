/**
 * Single source of truth for the API base URL the mobile app talks to.
 *
 * Always reads EXPO_PUBLIC_API_URL, which the dev workflow unconditionally
 * sets to the published production deployment so the phone works over real
 * cellular even when the dev workspace is asleep.
 *
 * Throws immediately at bundle-load time if the env var is absent or empty.
 * Previously this silently returned "", which made every API call in the
 * app degrade to a relative fetch (e.g. "/api/explore/discover") with no
 * error — indistinguishable from a real "nothing found" result. Confirmed
 * live: a Metro session started without this var resolved discover fetches
 * to the app's own HTML shell instead of the API host.
 */
export function getApiBase(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set. Set it before starting Metro, e.g.:\n" +
        "  EXPO_PUBLIC_API_URL=https://urban-explorer-ihsy.onrender.com pnpm exec expo start --dev-client",
    );
  }
  return url;
}

export const API_BASE = getApiBase();
