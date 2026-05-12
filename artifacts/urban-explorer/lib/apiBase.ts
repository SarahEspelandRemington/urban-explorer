/**
 * Single source of truth for the API base URL the mobile app talks to.
 *
 * Always reads EXPO_PUBLIC_API_URL, which the dev workflow unconditionally
 * sets to the published production deployment so the phone works over real
 * cellular even when the dev workspace is asleep. If the env var is absent
 * callers will fail fast on the first fetch rather than silently hitting the
 * wrong host.
 */
export function getApiBase(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? "";
}

export const API_BASE = getApiBase();
