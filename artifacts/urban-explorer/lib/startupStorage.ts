import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Single-pass batched read of every AsyncStorage key the providers need at
 * cold start. Doing one `multiGet` instead of N independent `getItem` calls
 * removes a serialized chain that can cost ~50-150ms on mid-tier Android
 * devices, depending on how many providers race for the JS bridge.
 *
 * The promise resolves to a map keyed by the raw storage key. Callers should
 * treat a missing key as `null`.
 */
export const STARTUP_KEYS = {
  locale: "urban-explorer.notificationLocale",
  walkBannerDismissed: "walk_banner_dismissed",
  walkWelcomeDismissed: "walk_welcome_dismissed",
  savedPlaces: "@urban_explorer_saved",
  recentRoutes: "recentWalkRoutes",
  showPrefetchStats: "walk_show_prefetch_stats",
  walkDebugOverlayEnabled: "walk_debug_overlay_enabled",
  exploreDebugOverlayEnabled: "explore_debug_overlay_enabled",
} as const;

const ALL_KEYS = Object.values(STARTUP_KEYS);

let cachedPromise: Promise<Map<string, string | null>> | null = null;

export function readStartupStorage(): Promise<Map<string, string | null>> {
  if (!cachedPromise) {
    cachedPromise = AsyncStorage.multiGet(ALL_KEYS as unknown as string[])
      .then((entries) => {
        const map = new Map<string, string | null>();
        for (const [key, value] of entries) {
          map.set(key, value);
        }
        return map;
      })
      .catch(() => new Map<string, string | null>());
  }
  return cachedPromise;
}

export async function getStartupValue(key: string): Promise<string | null> {
  const map = await readStartupStorage();
  return map.get(key) ?? null;
}

/**
 * Write-through helper for keys in STARTUP_KEYS. Use this instead of
 * `AsyncStorage.setItem` whenever the key must reflect a same-session
 * change, so a later `getStartupValue` call returns the updated value
 * instead of the stale snapshot taken at boot.
 *
 * Example: the Walk tab dismissal updates the welcome flag mid-session,
 * and the Explore tab reads the same flag on its own mount — without this
 * helper the Explore read would still see the boot-time `null` and show a
 * banner the user already dismissed.
 *
 * For non-startup keys, keep using `AsyncStorage.setItem` directly.
 */
export async function setStartupValue(
  key: string,
  value: string,
): Promise<void> {
  // Ensure the snapshot multiGet has been kicked off, then layer this write
  // on top so any in-flight or subsequent getStartupValue() call sees the
  // fresh value. We must NOT short-circuit the multiGet by seeding the
  // cache with a single-entry map — that would leave every other startup
  // key reading as `null` until process restart.
  const base = readStartupStorage();
  cachedPromise = base.then((map) => {
    map.set(key, value);
    return map;
  });
  await AsyncStorage.setItem(key, value);
}

/**
 * Test-only: reset the singleton cache so tests can re-trigger the multiGet
 * with fresh AsyncStorage state.
 */
export function _resetStartupStorageForTests(): void {
  cachedPromise = null;
}
