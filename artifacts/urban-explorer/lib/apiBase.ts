/**
 * Single source of truth for the API base URL the mobile app talks to.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_API_URL    — preferred. Set by the dev script to point at
 *                                the published autoscale deployment so field
 *                                tests work over real cellular even when the
 *                                dev workspace has gone idle.
 *   2. EXPO_PUBLIC_DOMAIN     — legacy fallback. Resolves to the Replit dev
 *                                workspace domain. Only useful when actively
 *                                developing with the workspace running.
 *
 * If neither is set we return an empty string; callers will fail fast on the
 * first fetch rather than silently hitting localhost.
 */
export function getApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return "";
}

export const API_BASE = getApiBase();
