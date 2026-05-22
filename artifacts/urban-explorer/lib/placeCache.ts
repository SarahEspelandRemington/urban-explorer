import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Geographic tile cache for discovered places.
//
// The cache has two layers:
//
//   1. Session-scoped in-memory Set  (fetchedTilesRef in WalkModeContext)
//      Instant, zero I/O. Prevents duplicate /discover requests within a
//      single walk session when the user revisits the same ~111 m cell.
//
//   2. AsyncStorage persistent cache  (this module)
//      24-hour TTL. Eliminates HTTP round-trips for areas the user walked
//      recently (yesterday, earlier today). Historical facts are stable
//      enough to be reused across sessions within that window.
//
// Tile key format mirrors the server's discoverCacheKey exactly so that
// client-side grid snapping and server-side grid snapping are in sync:
//   "{snappedLat},{snappedLng}:{radius}{includesSuffix}"
//
// Grid snap: 0.002° ≈ 222 m step → ±111 m coverage per cell.
// Any two fetch centres within ~111 m of the same grid point share a tile.
// ---------------------------------------------------------------------------

/** Match the server's snap grid (0.002° steps ≈ 222 m → ±111 m coverage). */
export const snapGrid = (v: number): string =>
  (Math.round(v * 500) / 500).toFixed(3);

/** 24 h TTL — historical places are stable within this window. */
export const PLACE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// v5: bumped to invalidate entries written before PRECISE_LOCATION_PROSE_RE
// and NAMED_NEIGHBORHOOD_RE were added to Rule 4 of applyLlmPrecisionFilter.
// LLM-only places whose summaries contain intersection-of / block-style prose
// or named-neighbourhood claims are now downgraded to INTERPRETIVE_OVERLAY,
// but cached v4 entries still carry the old (passing) discoveryClass.
// Old v4 keys expire naturally after 24 h; they are unreachable immediately.
const STORAGE_PREFIX = "@urban-explorer/place-cache:v5:";

/** Hard cap on tiles stored in AsyncStorage to bound disk usage. */
const MAX_TILES = 60;

interface PlaceCacheEntry {
  places: unknown[];
  fetchedAt: number;
}

/**
 * Build the tile key for a fetch centre.
 *
 * @param lat           Fetch centre latitude (already projected ahead if applicable)
 * @param lng           Fetch centre longitude
 * @param radius        discoverRadius from DENSITY_CONFIG
 * @param includesSuffix  e.g. ":inc=cafe,pub" or ""  (match server format exactly)
 */
export function buildTileKey(
  lat: number,
  lng: number,
  radius: number,
  includesSuffix: string,
): string {
  return `${snapGrid(lat)},${snapGrid(lng)}:${radius}${includesSuffix}`;
}

function storageKey(tile: string): string {
  return `${STORAGE_PREFIX}${tile}`;
}

/**
 * Load cached places for a tile.
 * Returns `null` on miss, expiry, or parse error — caller should fall through
 * to a fresh server fetch.
 */
export async function getPlaceCache(tile: string): Promise<unknown[] | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(tile));
    if (!raw) return null;
    const entry: PlaceCacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > PLACE_CACHE_TTL_MS) {
      // Stale — prune async and signal a miss.
      AsyncStorage.removeItem(storageKey(tile)).catch(() => {});
      return null;
    }
    return Array.isArray(entry.places) ? entry.places : null;
  } catch {
    return null;
  }
}

/**
 * Persist places for a tile.
 * Fire-and-forget — never blocks the caller.
 * Enforces MAX_TILES by evicting the oldest entry when the cap is reached.
 */
export function setPlaceCache(tile: string, places: unknown[]): void {
  const entry: PlaceCacheEntry = { places, fetchedAt: Date.now() };
  AsyncStorage.setItem(storageKey(tile), JSON.stringify(entry)).catch(() => {});

  // Background: enforce the tile cap by pruning the oldest entries.
  (async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter((k) => k.startsWith(STORAGE_PREFIX));
      if (cacheKeys.length <= MAX_TILES) return;

      const raws = await AsyncStorage.multiGet(cacheKeys);
      const entries = raws
        .map(([k, v]) => {
          let fetchedAt = 0;
          try {
            fetchedAt = (JSON.parse(v ?? "") as PlaceCacheEntry).fetchedAt ?? 0;
          } catch {
            /* ignore */
          }
          return { key: k, fetchedAt };
        })
        .sort((a, b) => a.fetchedAt - b.fetchedAt);

      await AsyncStorage.multiRemove(
        entries.slice(0, cacheKeys.length - MAX_TILES).map((e) => e.key),
      );
    } catch {
      /* best-effort — never break the main path */
    }
  })();
}
