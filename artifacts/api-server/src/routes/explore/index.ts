import { Router } from "express";
import { logger } from "../../lib/logger";
import {
  LLM_CACHE_CURRENT_VERSIONS,
  OSM_CACHE_VERSION,
} from "../../lib/cacheVersions";
import {
  AUDIO_DB_MAX_ENTRIES,
  AUDIO_CACHE_MAX_SIZE,
  AUDIO_CACHE_TTL_MS,
  BORING_BUILDING_TYPES_ENV,
  BORING_BUILDING_TYPES_FILE_ENV,
  LLM_CACHE_MAX_SIZE,
  LLM_CACHE_TTL_MS,
  OSM_CACHE_MAX_SIZE,
  OSM_CACHE_TTL_MS,
  OSM_SUGGESTIONS_CACHE_MAX_SIZE,
  OSM_SUGGESTIONS_CACHE_TTL_MS,
  WALK_FORWARD_BIAS_METERS,
  WALK_OFF_AXIS_PENALTY_DEG,
  WALK_OFF_AXIS_PENALTY_METERS,
} from "../../config";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { PgRateLimitStore } from "../../lib/pgRateLimitStore";
import { openai } from "@workspace/integrations-openai-ai-server";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import {
  DiscoverPlacesBody,
  GeocodeLocationBody,
  GetPlaceDetailBody,
  GetPlaceTimelineBody,
  GetPlacesAlongRouteBody,
  GetRouteBody,
  GetWalkNarrationBody,
  InvestigateAddressBody,
  RatePlaceBody,
  SuggestLocationsBody,
} from "@workspace/api-zod";
import {
  db,
  placeRatings,
  placePhotos,
  userPlaceRatings,
  apiCache,
} from "@workspace/db";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { resolve } from "path";
import { computeOsmTrustLevel, OSM_COPY_RULES } from "../../lib/osmTrustLevel";
import { sanitizeDisplayTags } from "../../lib/sanitizeDisplayTags";
import { haversineDistance } from "../../lib/geo";
import {
  type WikipediaSummary,
  parseWikipediaOsmTag,
  buildWikiPromptBlock,
} from "../../lib/wikipediaEnrichment";

const router = Router();

interface OSMPlace {
  name: string;
  lat: number;
  lon: number;
  type: string;
  tags: Record<string, string>;
  /** Overpass element reference, e.g. "node/12345678". Set in the Overpass parser. */
  osmId: string;
}

const OVERPASS_PROVIDERS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const DEFAULT_BORING_BUILDING_TYPES = [
  "garage",
  "garages",
  "shed",
  "hut",
  "roof",
  "carport",
  "barn",
  "storage_tank",
  "silo",
  "container",
  "outhouse",
  "greenhouse",
  "service",
  "kiosk",
  "toilets",
  "parking",
  "garbage_shed",
  "bicycle_parking",
];

function loadBoringBuildingTypes(): Set<string> {
  if (BORING_BUILDING_TYPES_ENV) {
    const types = BORING_BUILDING_TYPES_ENV.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    logger.info(
      { count: types.length },
      "Loaded BORING_BUILDING_TYPES from environment variable",
    );
    return new Set(types);
  }

  const configPath = BORING_BUILDING_TYPES_FILE_ENV
    ? resolve(BORING_BUILDING_TYPES_FILE_ENV)
    : resolve(
        new URL("../config/boring-building-types.json", import.meta.url)
          .pathname,
      );

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
    const types = (parsed as unknown[])
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .map((v) => v.toLowerCase().trim());
    logger.info(
      { path: configPath, count: types.length },
      "Loaded BORING_BUILDING_TYPES from config file",
    );
    return new Set(types);
  } catch {
    logger.info(
      { path: configPath },
      "Config file not found or invalid, using default BORING_BUILDING_TYPES",
    );
    return new Set(DEFAULT_BORING_BUILDING_TYPES);
  }
}

const BORING_BUILDING_TYPES = loadBoringBuildingTypes();

// ---------------------------------------------------------------------------
// Walk Mode heading-bias configuration
// ---------------------------------------------------------------------------
// These three constants control pickNext scoring on the mobile client.
// They can be tuned without a mobile rebuild by setting environment variables
// and restarting the server. The GET /api/explore/walk-config endpoint returns
// the active values so the client can fetch and apply them at walk-start.
// Values are parsed and validated by the centralised config module at startup.

interface WalkConfig {
  forwardBiasMeters: number;
  offAxisPenaltyDeg: number;
  offAxisPenaltyMeters: number;
}

const WALK_CONFIG: WalkConfig = {
  forwardBiasMeters: WALK_FORWARD_BIAS_METERS,
  offAxisPenaltyDeg: WALK_OFF_AXIS_PENALTY_DEG,
  offAxisPenaltyMeters: WALK_OFF_AXIS_PENALTY_METERS,
};

logger.info(WALK_CONFIG, "Walk Mode heading-bias config loaded");

const osmCache = new Map<string, { places: OSMPlace[]; timestamp: number }>();
const OSM_CACHE_DISTANCE = 200;

// Separate cache for nearby OSM places, keyed by a coarse coordinate bucket
// (~100m grid via 3 decimal places). Stores the full OSMPlace[] so callers
// can both rebuild osmContext for the LLM prompt AND derive search suggestions
// without hitting Overpass again.
//
// TTL is intentionally longer than both the short OSM cache (5 min) and the
// LLM cache (15 min) because OSM landmark names are stable. The primary use
// is in the investigate endpoint: if the LLM cache expires and the same
// (or a nearby) empty-result address is searched again, the Overpass call is
// skipped entirely by checking this cache first.
const osmSuggestionsCache = new Map<string, LLMCacheEntry<OSMPlace[]>>();

function osmSuggestionsBucketKey(lat: number, lng: number): string {
  // OSM_CACHE_VERSION: invalidates entries cached before the Overpass provider race was added.
  return `osm:${OSM_CACHE_VERSION}:${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function getCachedOSMPlaces(lat: number, lng: number): OSMPlace[] | null {
  const key = osmSuggestionsBucketKey(lat, lng);
  const entry = osmSuggestionsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > OSM_SUGGESTIONS_CACHE_TTL_MS) {
    osmSuggestionsCache.delete(key);
    void deleteCacheEntry("osm", key);
    return null;
  }
  return entry.data;
}

function setCachedOSMPlaces(
  lat: number,
  lng: number,
  places: OSMPlace[],
): void {
  const key = osmSuggestionsBucketKey(lat, lng);
  if (osmSuggestionsCache.size >= OSM_SUGGESTIONS_CACHE_MAX_SIZE) {
    const oldest = osmSuggestionsCache.keys().next().value;
    if (oldest) {
      osmSuggestionsCache.delete(oldest);
      void deleteCacheEntry("osm", oldest);
    }
  }
  osmSuggestionsCache.set(key, {
    data: places,
    timestamp: Date.now(),
  });
  void persistCacheEntry("osm", key, places, OSM_SUGGESTIONS_CACHE_TTL_MS);
}

interface LLMCacheEntry<T = any> {
  data: T;
  timestamp: number;
}

const llmCache = new Map<string, LLMCacheEntry>();

// In-flight deduplication: if two requests miss the same cache key simultaneously,
// only one LLM/TTS call is made. The second caller awaits the first's promise and
// reuses its result — preventing duplicate paid API calls on cold-cache surges.
const inFlightNarration = new Map<string, Promise<string>>();
const inFlightAudio = new Map<string, Promise<Buffer>>();
const inFlightDetail = new Map<string, Promise<any>>();
const inFlightSuggestion = new Map<string, Promise<string[]>>();
const inFlightGeocode = new Map<string, Promise<NominatimResult[]>>();

// Cache key versioning convention:
// Every LLM-backed cache key includes a version segment (e.g. ":v1:").
// When a prompt changes materially — wording, output schema, honesty rules,
// model selection — increment that endpoint's version so stale cached
// responses are never served to users of the updated prompt.
// Start at v1 for a new key; bump to v2, v3, etc. after each material change.
// The timeline key is already at v2 after its prompt update (Task #270).
//
// LLM_CACHE_CURRENT_VERSIONS is imported from lib/cacheVersions — the
// authoritative list of every (prefix, version) pair that is currently live.
// On startup, any DB rows whose cache_key begins with a known prefix but
// carries a different version segment are deleted so they can never be
// warmed back into memory.  When you bump a version here, also bump it in
// the cache key assignment below.

function getLLMCache<T>(key: string): T | null {
  const entry = llmCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > LLM_CACHE_TTL_MS) {
    llmCache.delete(key);
    void deleteCacheEntry("llm", key);
    return null;
  }
  return entry.data as T;
}

function setLLMCache(key: string, data: any): void {
  if (llmCache.size >= LLM_CACHE_MAX_SIZE) {
    const oldest = llmCache.keys().next().value;
    if (oldest) {
      llmCache.delete(oldest);
      void deleteCacheEntry("llm", oldest);
    }
  }
  llmCache.set(key, { data, timestamp: Date.now() });
  void persistCacheEntry("llm", key, data, LLM_CACHE_TTL_MS);
}

async function deleteCacheEntry(namespace: string, key: string): Promise<void> {
  try {
    await db
      .delete(apiCache)
      .where(
        and(eq(apiCache.namespace, namespace), eq(apiCache.cacheKey, key)),
      );
  } catch (err) {
    logger.warn(
      { err, namespace, key },
      "Failed to delete cache entry from DB",
    );
  }
}

async function persistCacheEntry(
  namespace: string,
  key: string,
  data: unknown,
  ttlMs: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    await db
      .insert(apiCache)
      .values({ namespace, cacheKey: key, data, expiresAt })
      .onConflictDoUpdate({
        target: [apiCache.namespace, apiCache.cacheKey],
        set: { data, expiresAt },
      });
  } catch (err) {
    logger.warn({ err, namespace, key }, "Failed to persist cache entry to DB");
  }
}

async function warmCachesFromDb(): Promise<void> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(apiCache)
      .where(gt(apiCache.expiresAt, now));

    let osmLoaded = 0;
    let llmLoaded = 0;
    let audioLoaded = 0;

    for (const row of rows) {
      const remainingMs = row.expiresAt.getTime() - Date.now();
      if (remainingMs <= 0) continue;

      if (row.namespace === "osm") {
        if (osmSuggestionsCache.size < OSM_SUGGESTIONS_CACHE_MAX_SIZE) {
          osmSuggestionsCache.set(row.cacheKey, {
            data: row.data as OSMPlace[],
            timestamp:
              Date.now() - (OSM_SUGGESTIONS_CACHE_TTL_MS - remainingMs),
          });
          osmLoaded++;
        }
      } else if (row.namespace === "llm") {
        if (llmCache.size < LLM_CACHE_MAX_SIZE) {
          llmCache.set(row.cacheKey, {
            data: row.data,
            timestamp: Date.now() - (LLM_CACHE_TTL_MS - remainingMs),
          });
          llmLoaded++;
        }
      } else if (row.namespace === "audio") {
        if (audioCache.size < AUDIO_CACHE_MAX_SIZE) {
          try {
            const base64 = (row.data as { bytes: string }).bytes;
            const bytes = Buffer.from(base64, "base64");
            audioCache.set(row.cacheKey, {
              bytes,
              timestamp: Date.now() - (AUDIO_CACHE_TTL_MS - remainingMs),
            });
            audioLoaded++;
          } catch {
            // Skip malformed audio cache entries rather than crashing warmup.
          }
        }
      }
    }

    logger.info(
      { osmLoaded, llmLoaded, audioLoaded },
      "Warmed in-memory caches from database",
    );
  } catch (err) {
    logger.warn({ err }, "Failed to warm caches from DB; starting cold");
  }
}

async function cleanupExpiredCacheEntries(): Promise<void> {
  try {
    await db.delete(apiCache).where(lt(apiCache.expiresAt, new Date()));
  } catch (err) {
    logger.warn({ err }, "Failed to clean up expired cache entries");
  }
  await evictExcessAudioDbEntries();
}

async function evictExcessAudioDbEntries(): Promise<void> {
  try {
    const result = await db.execute(
      sql`DELETE FROM ${apiCache}
          WHERE ${apiCache.namespace} = ${"audio"}
          AND ${apiCache.cacheKey} NOT IN (
            SELECT cache_key FROM ${apiCache}
            WHERE namespace = ${"audio"}
            ORDER BY expires_at DESC
            LIMIT ${AUDIO_DB_MAX_ENTRIES}
          )`,
    );
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info(
        { deleted, maxEntries: AUDIO_DB_MAX_ENTRIES },
        "Evicted excess audio DB cache entries",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Failed to evict excess audio cache entries from DB");
  }
}

// Delete DB rows whose cache_key matches a known prefix but carries an old
// version segment.  This runs once at startup, before warmCachesFromDb, so
// stale rows are never loaded into the in-memory caches.
async function cleanupStaleCacheVersions(): Promise<void> {
  let totalDeleted = 0;

  for (const [prefix, currentVersion] of LLM_CACHE_CURRENT_VERSIONS) {
    try {
      const result = await db.execute(
        sql`DELETE FROM ${apiCache}
            WHERE ${apiCache.namespace} = ${"llm"}
            AND ${apiCache.cacheKey} LIKE ${prefix + ":%"}
            AND ${apiCache.cacheKey} NOT LIKE ${prefix + ":" + currentVersion + ":%"}`,
      );
      const count = result.rowCount ?? 0;
      if (count > 0) {
        totalDeleted += count;
        logger.info(
          { prefix, currentVersion, count },
          "Deleted stale LLM cache entries for old prompt version",
        );
      }
    } catch (err) {
      logger.warn(
        { err, prefix, currentVersion },
        "Failed to delete stale LLM cache entries for prefix",
      );
    }
  }

  if (totalDeleted > 0) {
    logger.info(
      { totalDeleted },
      "Startup stale cache version cleanup complete",
    );
  }
}

void cleanupStaleCacheVersions().then(() => warmCachesFromDb());
setInterval(() => void cleanupExpiredCacheEntries(), 5 * 60 * 1000);

function getOSMCacheKey(
  lat: number,
  lng: number,
): { key: string; places: OSMPlace[] } | null {
  const now = Date.now();
  for (const [key, entry] of osmCache) {
    if (now - entry.timestamp > OSM_CACHE_TTL_MS) {
      osmCache.delete(key);
      continue;
    }
    const [cachedLat, cachedLng] = key.split(",").map(Number);
    if (
      haversineDistance(lat, lng, cachedLat, cachedLng) < OSM_CACHE_DISTANCE
    ) {
      return { key, places: entry.places };
    }
  }
  return null;
}

// Returns null when Overpass errored or timed out (transient failure).
// Returns OSMPlace[] (possibly empty) when Overpass responded successfully —
// an empty array means the area is genuinely sparse, not a network failure.
async function fetchNearbyOSMPlaces(
  lat: number,
  lng: number,
  radiusMeters: number,
  quickMode = false,
  maxResults = 40,
): Promise<OSMPlace[] | null> {
  const cached = getOSMCacheKey(lat, lng);
  if (cached) return cached.places;

  const r = Math.min(radiusMeters, 500);
  const timeoutSec = quickMode ? 4 : 5;
  const query = `
[out:json][timeout:${timeoutSec}];
(
  nwr["historic"](around:${r},${lat},${lng});
  nwr["heritage"](around:${r},${lat},${lng});
  nwr["ruins"](around:${r},${lat},${lng});
  nwr["tourism"~"^(attraction|artwork|memorial|museum|gallery|viewpoint)$"](around:${r},${lat},${lng});
  nwr["name"]["building"](around:${r},${lat},${lng});
  nwr["name"]["amenity"~"^(place_of_worship|library|theatre|cinema|arts_centre|pub|bar|bank|post_office|police|fire_station|school|college|university|marketplace|townhall|courthouse|prison|hospital|community_centre|social_facility)$"](around:${r},${lat},${lng});
  nwr["name"]["man_made"~"^(water_tower|chimney|bridge|lighthouse|monument|tower|pier|reservoir_covered|storage_tank|gasometer)$"](around:${r},${lat},${lng});
  nwr["name"]["landuse"~"^(religious|cemetery|industrial|railway)$"](around:${r},${lat},${lng});
  nwr["name"]["railway"~"^(station|halt|tram_stop|subway_entrance|disused_station)$"](around:${r},${lat},${lng});
  nwr["name"]["disused:amenity"](around:${r},${lat},${lng});
  nwr["name"]["demolished:building"](around:${r},${lat},${lng});
  nwr["memorial"](around:${r},${lat},${lng});
  nwr["name"]["leisure"~"^(park|garden|nature_reserve)$"](around:${r},${lat},${lng});
);
out center body ${maxResults};
`;
  const controller = new AbortController();
  const abortTimeout = quickMode ? 5000 : 10000;
  const timeout = setTimeout(() => controller.abort(), abortTimeout);

  const fetchOpts = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "UrbanExplorer/1.0 (walking-tour app)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: controller.signal,
  };

  try {
    const { resp, provider } = await Promise.any(
      OVERPASS_PROVIDERS.map((url) =>
        fetch(url, fetchOpts).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return { resp: r, provider: url };
        }),
      ),
    );
    clearTimeout(timeout);
    logger.info({ provider }, "[overpass] provider responded");

    const json = (await resp.json()) as { elements?: any[] };
    if (!json.elements) return null;

    const seen = new Set<string>();
    const results: OSMPlace[] = [];

    for (const el of json.elements) {
      const name = el.tags?.name;
      if (!name) continue;

      const normKey = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(normKey)) continue;
      seen.add(normKey);

      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (typeof elLat !== "number" || typeof elLon !== "number") continue;

      const osmType =
        el.tags?.historic ||
        el.tags?.tourism ||
        el.tags?.amenity ||
        el.tags?.building ||
        el.tags?.landuse ||
        el.tags?.man_made ||
        "place";

      results.push({
        name,
        lat: elLat,
        lon: elLon,
        type: osmType === "yes" ? "building" : osmType,
        tags: el.tags || {},
        osmId: `${(el.type as string | undefined) ?? "node"}/${el.id as string}`,
      });
    }

    const finalResults = results.slice(0, maxResults);
    if (osmCache.size >= OSM_CACHE_MAX_SIZE) {
      const oldest = osmCache.keys().next().value;
      if (oldest) osmCache.delete(oldest);
    }
    osmCache.set(`${lat},${lng}`, {
      places: finalResults,
      timestamp: Date.now(),
    });
    return finalResults;
  } catch (err) {
    clearTimeout(timeout);
    logger.warn({ err }, "Overpass fetch failed, returning null");
    return null;
  }
}

function sanitizeOSMText(raw: string, maxLen = 80): string {
  return raw
    .replace(/[\n\r\t]/g, " ")
    .replace(
      /[^\x20-\x7E\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/g,
      "",
    )
    .trim()
    .slice(0, maxLen);
}

function formatOSMContext(
  places: OSMPlace[],
  userLat: number,
  userLng: number,
): string {
  if (places.length === 0) return "";

  const lines = places.map((p, i) => {
    const dist = Math.round(haversineDistance(userLat, userLng, p.lat, p.lon));
    const name = sanitizeOSMText(p.name, 100);
    const details: string[] = [];
    if (p.tags["addr:street"]) {
      const num = sanitizeOSMText(p.tags["addr:housenumber"] || "", 10);
      const street = sanitizeOSMText(p.tags["addr:street"], 60);
      details.push(`address: ${num} ${street}`.trim());
    }
    if (p.tags.start_date)
      details.push(`built: ${sanitizeOSMText(p.tags.start_date, 20)}`);
    if (p.tags.architect)
      details.push(`architect: ${sanitizeOSMText(p.tags.architect, 60)}`);
    if (p.tags.heritage) details.push(`heritage site`);
    if (p.tags.historic)
      details.push(`historic: ${sanitizeOSMText(p.tags.historic, 30)}`);
    if (p.tags["building:levels"])
      details.push(`${sanitizeOSMText(p.tags["building:levels"], 5)} stories`);
    if (p.tags["building:material"])
      details.push(
        `material: ${sanitizeOSMText(p.tags["building:material"], 30)}`,
      );
    if (p.tags.wikidata) {
      const wd = p.tags.wikidata.match(/^Q\d{1,12}$/);
      if (wd) details.push(`wikidata: ${wd[0]}`);
    }
    const extra = details.length > 0 ? ` (${details.join(", ")})` : "";
    return `  ${i + 1}. "${name}" [${sanitizeOSMText(p.type, 30)}] at ${p.lat.toFixed(5)},${p.lon.toFixed(5)} — ${dist}m away${extra}`;
  });

  return `\n\nREAL PLACES FROM MAP DATA (OpenStreetMap) near these coordinates:\n${lines.join("\n")}\n\nIMPORTANT: Use OSM entries as verified anchors — exact name and coordinates must be preserved. Add your historical knowledge on top. Up to half your returned places may come from your own knowledge (demolished buildings, former uses, buried infrastructure, organisations that no longer exist) if OSM doesn't fill the quota — mark those confidence "medium" or "low". Do not force an OSM entry that has no interesting story. Places confirmed by OSM data should be confidence "high".`;
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Nominatim helpers
// ---------------------------------------------------------------------------
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_HEADERS = {
  "User-Agent": "UrbanExplorer/1.0 (walking-tour app)",
  Accept: "application/json",
};

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  addresstype?: string;
}

/** Shorten "West 53rd Street, Manhattan, New York County, New York, 10019, United States"
 *  → "West 53rd Street, Manhattan" for display in the suggestion list. */
function formatNominatimDisplayName(raw: string): string {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  const keep = parts.slice(0, 2).join(", ");
  return keep;
}

/** Human-readable type string from a Nominatim result. */
function nominatimTypeLabel(r: NominatimResult): string {
  const t = r.addresstype || r.type || r.class || "";
  const map: Record<string, string> = {
    street: "Street",
    road: "Street",
    pedestrian: "Street",
    junction: "Intersection",
    place: "Place",
    neighbourhood: "Neighborhood",
    suburb: "Neighborhood",
    quarter: "Neighborhood",
    city_block: "Block",
    building: "Building",
    amenity: "Place",
    tourism: "Landmark",
    historic: "Historic site",
    church: "Church",
    memorial: "Memorial",
    museum: "Museum",
    park: "Park",
    square: "Square",
    city: "City",
    town: "Town",
    village: "Village",
    county: "County",
  };
  return (
    map[t.toLowerCase()] ||
    (t ? t.charAt(0).toUpperCase() + t.slice(1) : "Place")
  );
}

async function nominatimSearch(
  query: string,
  limit: number,
  extraParams?: Record<string, string>,
): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: String(limit),
    addressdetails: "0",
    ...extraParams,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
      signal: controller.signal,
      headers: NOMINATIM_HEADERS,
    });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const data = (await resp.json()) as NominatimResult[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    clearTimeout(timer);
    logger.warn({ err }, "Nominatim place search failed, returning empty");
    return [];
  }
}

interface NearCoordCacheEntry {
  value: { lat: number; lon: number } | null;
  expiresAt: number;
}

const NEAR_COORD_CACHE_MAX = 500;
const NEAR_COORD_TTL_SUCCESS_MS = 30 * 60 * 1000;
const NEAR_COORD_TTL_FAILURE_MS = 2 * 60 * 1000;
const nearLocationCoordCache = new Map<string, NearCoordCacheEntry>();

function setNearCoordCache(
  key: string,
  value: { lat: number; lon: number } | null,
): void {
  if (nearLocationCoordCache.size >= NEAR_COORD_CACHE_MAX) {
    const firstKey = nearLocationCoordCache.keys().next().value;
    if (firstKey !== undefined) nearLocationCoordCache.delete(firstKey);
  }
  nearLocationCoordCache.set(key, {
    value,
    expiresAt:
      Date.now() +
      (value ? NEAR_COORD_TTL_SUCCESS_MS : NEAR_COORD_TTL_FAILURE_MS),
  });
}

/** Geocode an address string to coordinates. Results are cached per-process:
 *  successful lookups for 30 min, failures for 2 min (so transient errors
 *  don't permanently disable viewbox bias). Cache is capped at 500 entries. */
async function geocodeNearLocation(
  address: string,
): Promise<{ lat: number; lon: number } | null> {
  const key = address.toLowerCase();
  const cached = nearLocationCoordCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const params = new URLSearchParams({
    q: address,
    format: "jsonv2",
    limit: "1",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
      signal: controller.signal,
      headers: NOMINATIM_HEADERS,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      setNearCoordCache(key, null);
      return null;
    }
    const json = await resp.json();
    const first = Array.isArray(json) ? json[0] : null;
    if (!first) {
      setNearCoordCache(key, null);
      return null;
    }
    const result = { lat: parseFloat(first.lat), lon: parseFloat(first.lon) };
    setNearCoordCache(key, result);
    return result;
  } catch (err) {
    clearTimeout(timer);
    logger.warn({ err }, "Nominatim geocode failed, caching null");
    setNearCoordCache(key, null);
    return null;
  }
}

// ---------------------------------------------------------------------------

const NOMINATIM_MIN_INTERVAL_MS = 1100; // Nominatim ToS: max 1 req/sec
let lastNominatimCallAt = 0;

// Schedule a single Nominatim call to be issued at least NOMINATIM_MIN_INTERVAL_MS
// after the previous one. Claims a time slot synchronously so that multiple parallel
// callers (e.g. Promise.allSettled) each get their own non-overlapping slot, then
// waits asynchronously until that slot arrives before calling fn().
function scheduleNominatimCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const earliest = lastNominatimCallAt + NOMINATIM_MIN_INTERVAL_MS;
  const delay = Math.max(0, earliest - now);
  lastNominatimCallAt = now + delay;
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => fn().then(resolve, reject), delay);
  });
}

/**
 * Reverse-geocode a coordinate pair to a human-readable neighbourhood label.
 *
 * Used to derive the Explore area header from the actual search-centre
 * coordinates rather than from the LLM's (potentially hallucinated) location
 * field.  Results are cached at 3 d.p. (~110 m) so repeated discovers within
 * the same grid cell are served from in-memory cache with no Nominatim call.
 *
 * Returns { label, src } where src is "nominatim" on success and "fallback"
 * on any network/timeout/no-data failure (label is "Nearby" in that case).
 */
async function fetchNeighborhoodLabel(
  lat: number,
  lng: number,
): Promise<{ label: string; src: "nominatim" | "fallback" }> {
  // Key uses the "nbhd" prefix (not "revgeo-nbhd") so it is governed by the
  // ["nbhd", "v2"] entry in LLM_CACHE_CURRENT_VERSIONS and is never
  // accidentally swept by the broader "revgeo:v12:" cleanup rule.
  const cacheKey = `nbhd:v2:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = getLLMCache<{ label: string; src: "nominatim" | "fallback" }>(
    cacheKey,
  );
  if (cached) return cached;

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18", // building-level granularity — returns addr.neighbourhood reliably
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await scheduleNominatimCall(() =>
      fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
        signal: controller.signal,
        headers: NOMINATIM_HEADERS,
      }),
    );
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`Nominatim ${resp.status}`);
    const data = (await resp.json()) as Record<string, any>;
    const addr = data.address || {};
    const neighbourhood =
      addr.neighbourhood ||
      addr.suburb ||
      addr.city_district ||
      addr.quarter ||
      addr.village;
    const city = addr.city || addr.town || addr.municipality || addr.county;
    let label: string;
    if (neighbourhood && city) {
      label = `${neighbourhood}, ${city}`;
    } else if (neighbourhood) {
      label = neighbourhood;
    } else if (city) {
      label = city;
    } else {
      const first = (data.display_name || "").split(",")[0].trim();
      label = first || "Nearby";
    }
    const result = { label, src: "nominatim" as const };
    setLLMCache(cacheKey, result);
    return result;
  } catch {
    clearTimeout(timer);
    return { label: "Nearby", src: "fallback" as const };
  }
}

async function verifyPlaceCoordinates(
  places: any[],
  userLat: number,
  userLng: number,
  searchRadius: number,
): Promise<void> {
  // Correct coords that disagree with Nominatim by more than this.
  // 80 m ≈ half a city block — catches real pin errors while tolerating
  // Nominatim's own address-number imprecision.
  const COORD_CORRECTION_THRESHOLD_M = 80;
  // Only accept a Nominatim result if it is plausibly near the user — this
  // stops us correcting to a same-named church in another city.
  const MAX_ACCEPT_DIST_M = searchRadius * 2;
  // Viewbox biases Nominatim ranking toward the user's neighbourhood.
  // bounded=0 (default) lets it still match if OSM's bounding box sits just
  // outside; we filter by distance ourselves.
  const BOX_DEG = 0.06; // ≈6.7 km side — covers any search radius we use
  const viewbox = `${(userLng - BOX_DEG).toFixed(6)},${(userLat - BOX_DEG).toFixed(6)},${(userLng + BOX_DEG).toFixed(6)},${(userLat + BOX_DEG).toFixed(6)}`;

  // Verify all places that have a name or address — named POIs (churches,
  // sculptures, storefronts) are best matched by name; addresses help
  // disambiguate common names.
  const candidates = places.filter(
    (p) =>
      (typeof p.name === "string" && p.name.trim().length > 3) ||
      (typeof p.address === "string" && p.address.trim().length > 5),
  );

  // Schedule all Nominatim lookups upfront so each candidate gets its own
  // time slot (0 ms, 1100 ms, 2200 ms …). Promise.allSettled then waits for
  // all of them concurrently — a single slow or failed lookup no longer
  // blocks the rest, and the global rate-limit counter is updated atomically
  // before any setTimeout fires so concurrent callers can't double-book slots.
  await Promise.allSettled(
    candidates.map((p) =>
      scheduleNominatimCall(async () => {
        // Combine name + address for a rich free-text POI query.
        // A named place (e.g. "Olivet Covenant Presbyterian Church")
        // resolves far more accurately by name than by a vague address.
        const query = [p.name?.trim(), p.address?.trim()]
          .filter(Boolean)
          .join(" ");
        let results = await nominatimSearch(query, 5, {
          countrycodes: "us",
          viewbox,
        });

        // Retry with address-only when the combined name+address query returns
        // nothing. Real well-known landmarks (e.g. "Rookery Building
        // 209 S LaSalle St Chicago") can fail Nominatim's strict combined
        // parser even though geocoding the address string alone succeeds.
        // Only retry when:
        //   • the primary query was a name+address combination (not name-alone
        //     or address-alone), so we do not repeat an identical query; AND
        //   • the place carries a non-empty address field to use as the
        //     fallback query string.
        // The acceptance window (MAX_ACCEPT_DIST_M) is intentionally unchanged
        // — do not broaden the geographic radius here.
        if (results.length === 0) {
          const addrOnly = p.address?.trim() ?? "";
          const wasCombinedQuery = !!p.name?.trim() && !!addrOnly;
          if (wasCombinedQuery) {
            results = await scheduleNominatimCall(() =>
              nominatimSearch(addrOnly, 5, {
                countrycodes: "us",
                viewbox,
              }),
            );
          }
        }
        if (results.length === 0) {
          // Nominatim has no POI entry for this place (obscure historical site,
          // demolished building, former use with no OSM node). This is NOT
          // necessarily a hallucination — the address simply is not in the OSM
          // database. Mark it as "llm"-sourced (coordinates are LLM-only, not
          // externally verified) and flag it ineligible for Walk auto-narration.
          // It will still appear in Explore as a low-confidence discovery.
          //
          // Distinct from _rejectOutOfArea (Nominatim DID find the address but
          // it belongs elsewhere — that path above is unchanged and still drops).
          p.coordSource = "llm";
          p.autoNarrationBlocked = true;
          return;
        }

        // Among all returned results, pick the one closest to the user
        // that is still within the plausible search area.  We do NOT pick
        // the result closest to the AI's claimed coords — those may be wrong.
        let bestLat = NaN;
        let bestLon = NaN;
        let bestDist = Infinity;
        // Track the closest result Nominatim returned, regardless of the
        // MAX_ACCEPT_DIST_M acceptance window.  We need it to detect the case
        // where Nominatim found the address but it belongs in a different part
        // of the city — i.e. the LLM hallucinated local coordinates for a
        // real place that is genuinely far away.
        let closestAnyDist = Infinity;
        for (const r of results) {
          const rLat = parseFloat(r.lat);
          const rLon = parseFloat(r.lon);
          if (!isFinite(rLat) || !isFinite(rLon)) continue;
          const d = haversineDistance(userLat, userLng, rLat, rLon);
          if (d < closestAnyDist) closestAnyDist = d;
          if (d <= MAX_ACCEPT_DIST_M && d < bestDist) {
            bestDist = d;
            bestLat = rLat;
            bestLon = rLon;
          }
        }
        if (!isFinite(bestLat)) {
          // Nominatim found the address, but every result is outside the
          // acceptance window.  If the closest result is also beyond the
          // search radius the place's address genuinely belongs elsewhere —
          // flag it so the post-filter can remove it rather than leaving the
          // LLM's hallucinated local coordinates in place.
          if (isFinite(closestAnyDist) && closestAnyDist > searchRadius * 1.1) {
            p._rejectOutOfArea = true;
          }
          return;
        }

        const moveBy = haversineDistance(
          p.latitude,
          p.longitude,
          bestLat,
          bestLon,
        );
        if (moveBy > COORD_CORRECTION_THRESHOLD_M) {
          // Nominatim disagrees with the LLM pin by more than a city-block
          // half-width — move the pin to the Nominatim-grounded location.
          p.latitude = bestLat;
          p.longitude = bestLon;
          p.confidence = "low";
          p.coordSource = "nominatim-corrected";
        } else {
          // Nominatim found a matching result within the correction threshold —
          // the LLM-proposed pin is already accurate (e.g. a well-known
          // landmark like the Willis Tower or the Chicago Board of Trade).
          // Do not move the coordinates, but mark the place as confirmed so it
          // survives the coordSource gate in both Explore and Walk modes.
          // The viewbox + MAX_ACCEPT_DIST_M acceptance window already scopes
          // the lookup to the user's neighbourhood, so a generic nearby token
          // match in a different part of the city is excluded before we reach
          // this branch.
          p.coordSource = "nominatim-confirmed";
        }
      }),
    ),
  );
}

/**
 * Address ↔ coordinates coherence check (NON-DESTRUCTIVE).
 *
 * Catches the IMG_0343-style hallucination where the LLM emits a place with
 * an internally inconsistent location: real-sounding street address (e.g.
 * "610 8th Ave") attached to lat/lng that sit five blocks west on the
 * Hudson piers. `verifyPlaceCoordinates` doesn't catch this because its
 * Nominatim search combines name+address and the made-up name returns no
 * match — so coords are left alone and the place flows downstream into
 * Walk Mode's narration queue.
 *
 * Behaviour (deliberately conservative — this is a safety/quality filter
 * for narration, not a destructive data-cleaning operation):
 *   • Original record (name, lat/lng, summary, facts) is NEVER mutated.
 *   • Only places with strong evidence of mismatch are blocked from auto
 *     narration via `autoNarrationBlocked: true`. They still appear as map
 *     pins and in API responses for the user to inspect.
 *   • Strong evidence requires TWO signals: (1) geocoded address >200 m
 *     from claimed lat/lng, AND (2) geocoded address >1.5× search radius
 *     from the user (catches "real street, wrong city" hallucinations).
 *   • Geocode failures or single-signal ambiguity are recorded in the
 *     debug field but do NOT block narration — we don't have enough
 *     confidence to act.
 *   • Every coherence outcome is attached to `addressCoherence` for later
 *     inspection: { storedLat, storedLon, geocodedLat, geocodedLon,
 *     mismatchMeters, status, reason }. Mismatches are also logged.
 *
 * Strategy: for each eligible place, build UP TO TWO probes and run them
 * in parallel:
 *   • Address probe — when the address field matches ADDRESS_RX (digit +
 *     street-type token). Geocodes the raw address string.
 *   • Name probe — when the place NAME contains an ordinal street reference
 *     (NAME_STREET_RX). Geocodes just that street phrase with city context.
 *
 * Previously the name probe was only a FALLBACK when no address matched.
 * Now BOTH run simultaneously, and a name-street conflict overrides an
 * otherwise-ok address result.  This is the primary fix for the
 * "Remnant Trolley Track Embedded in 39th St" failure mode where the LLM
 * fabricates a plausible local address (which geocodes fine near the user)
 * while the place NAME reveals the historical subject is on a distant street.
 *
 * Re-uses geocodeNearLocation (with its 30-min cache) so repeat hits cost
 * nothing.
 */
async function verifyAddressCoherence(
  places: any[],
  userLat: number,
  userLng: number,
  searchRadius: number,
): Promise<void> {
  const COHERENCE_THRESHOLD_M = 200;
  // Heuristic for "this looks like a real street address": a digit followed
  // by a street-type token (Ave, Avenue, St, Street, Blvd, Rd, etc.). Plain
  // intersection references like "8th Ave & W 49th St" don't have a street
  // number and are skipped (they geocode to the intersection itself which
  // can be far from the building).
  //
  // Address-range handling: the optional group (?:[-–—]\d{1,4})? captures
  // hyphenated / en-dash ranges like "3408–10" or "3408-10" so that
  // "3408–10 Spruce Street" is recognised as a numbered address. Without
  // this, the \S+ slot consumes "–10", leaving "Spruce" as an unmatched
  // extra token before the street type — the entire regex fails and no
  // coherence probe is created for the address.
  const ADDRESS_RX =
    /\b\d{1,5}(?:[-–—]\d{1,4})?\s+\S+\s+(ave|avenue|st|street|blvd|boulevard|rd|road|ln|lane|dr|drive|pl|place|ct|court|sq|square|way|pkwy|parkway|hwy|highway)\b/i;

  // Also catch placenames that hard-code a street reference — either with a
  // preposition ("near 8th Avenue", "on 9th Ave") OR as a leading ordinal
  // ("38th Street Vaudeville Theater", "42nd Street Ballroom", "8th Avenue
  // Market"). The discover prompt forbids these, but this check is a runtime
  // backstop when the LLM ignores the instruction.
  //
  // Match strategy:
  //   • Optional preposition group ("near|on|along|at|off")
  //   • Optional cardinal direction ("north|south|east|west|n|s|e|w")
  //   • Required ordinal number + suffix (\d{1,3}(st|nd|rd|th))
  //   • Required street type (full word preferred; abbreviation accepted)
  // Ordinal suffix is now REQUIRED (was optional) to avoid matching bare
  // decade references like "21st Century Architecture".
  // Full word forms (street, avenue…) are listed before abbreviations (st,
  // ave…) so the alternation matches the longest token first.
  const NAME_STREET_RX =
    /\b(?:(?:near|on|along|at|off)\s+)?(?:(?:north|south|east|west|n|s|e|w)\s+)?(\d{1,3}(?:st|nd|rd|th)\s+(?:street|avenue|boulevard|road|place|square|parkway|highway|lane|drive|ave|blvd|rd|pl|sq|pkwy|hwy|ln|dr|st|way))\b/i;

  // Catches named geographic entities — walkways, plazas, parks, landings,
  // and similar features — whose names contain no ordinal number and whose
  // type word ("Walk", "Plaza", "Landing", etc.) is absent from ADDRESS_RX.
  // Strategy: match the capitalized word immediately before the type word so
  // "Subsurface Locust Walk Trolley Tracks" extracts "Locust Walk", not
  // "Subsurface Walk".  The GENERIC_PRECEDING_WORDS guard prevents common
  // non-proper-nouns ("Street", "Old", "Historic", cardinal directions) from
  // anchoring the probe and triggering false positives.
  const NAME_PLACE_RX =
    /\b([A-Z][a-z]+(?:[''][a-z]+)?)\s+(Walk|Plaza|Square|Park|Landing|Alley|Row|Viaduct|Bridge|Creek|Run|Canal|Wharf|Pier|Market|Campus|Promenade|Esplanade|Greenway|Trail|Boardwalk|Common|Commons|Loop|Waterfront)\b/;
  const GENERIC_PRECEDING_WORDS = new Set([
    "street",
    "avenue",
    "road",
    "lane",
    "drive",
    "place",
    "court",
    "way",
    "north",
    "south",
    "east",
    "west",
    "upper",
    "lower",
    "old",
    "new",
    "central",
    "main",
    "near",
    "along",
    "former",
    "historic",
  ]);

  // Derive a short city+state string from coordinates so that name-extracted
  // probes ("38th Street") can be disambiguated by Nominatim.  Without this,
  // Nominatim may return "38th Street" from an entirely different city.
  // Coverage is intentionally broad (generous bounding boxes are fine; a
  // false "New York City" lookup is safe because the mismatch gate still
  // fires if the geocode result is far from the place's claimed coords).
  function cityContextFromCoords(lat: number, lon: number): string {
    if (lat > 40.4 && lat < 40.95 && lon > -74.3 && lon < -73.7)
      return "New York City, NY";
    if (lat > 37.6 && lat < 37.9 && lon > -122.6 && lon < -122.3)
      return "San Francisco, CA";
    if (lat > 41.6 && lat < 42.1 && lon > -87.9 && lon < -87.5)
      return "Chicago, IL";
    if (lat > 34.0 && lat < 34.2 && lon > -118.5 && lon < -118.1)
      return "Los Angeles, CA";
    if (lat > 47.5 && lat < 47.7 && lon > -122.5 && lon < -122.2)
      return "Seattle, WA";
    if (lat > 42.2 && lat < 42.4 && lon > -71.2 && lon < -71.0)
      return "Boston, MA";
    if (lat > 29.6 && lat < 29.9 && lon > -95.5 && lon < -95.2)
      return "Houston, TX";
    if (lat > 33.6 && lat < 33.9 && lon > -84.5 && lon < -84.2)
      return "Atlanta, GA";
    if (lat > 39.8 && lat < 40.1 && lon > -75.3 && lon < -74.9)
      return "Philadelphia, PA";
    if (lat > 38.8 && lat < 39.0 && lon > -77.2 && lon < -76.9)
      return "Washington, DC";
    if (lat > 25.6 && lat < 25.9 && lon > -80.4 && lon < -80.1)
      return "Miami, FL";
    return "";
  }

  // Build per-place probe lists. Both address and name probes are collected
  // when available — they run in parallel and are evaluated together so a
  // fabricated local address cannot mask a conflicting name-street reference.
  interface PlaceProbe {
    place: any;
    probe: string;
    role: "address" | "name" | "named-place";
  }
  const allProbes: PlaceProbe[] = [];

  for (const p of places.filter(
    (p) =>
      !p._rejectOutOfArea &&
      typeof p.latitude === "number" &&
      typeof p.longitude === "number",
  )) {
    if (typeof p.address === "string" && ADDRESS_RX.test(p.address)) {
      allProbes.push({ place: p, probe: p.address, role: "address" });
    }
    if (typeof p.name === "string") {
      const m = p.name.match(NAME_STREET_RX);
      if (m) {
        // Append city context so Nominatim doesn't resolve "39th Street"
        // to a city on the other side of the country.
        const cityCtx = cityContextFromCoords(userLat, userLng);
        const nameProbe = cityCtx ? `${m[1]}, ${cityCtx}` : m[1];
        allProbes.push({ place: p, probe: nameProbe, role: "name" });
      }
      // Named-place probe: catches "Locust Walk", "Fairmount Park",
      // "Penn's Landing", "Reading Viaduct", etc. — geographic entities with
      // no ordinal number and a type word absent from ADDRESS_RX.  Only fires
      // when the word immediately before the type is a non-generic proper noun
      // (GENERIC_PRECEDING_WORDS guard).
      const mp = p.name.match(NAME_PLACE_RX);
      if (mp && !GENERIC_PRECEDING_WORDS.has(mp[1].toLowerCase())) {
        const cityCtx = cityContextFromCoords(userLat, userLng);
        const placeProbe = cityCtx
          ? `${mp[1]} ${mp[2]}, ${cityCtx}`
          : `${mp[1]} ${mp[2]}`;
        allProbes.push({ place: p, probe: placeProbe, role: "named-place" });
      }
    }
  }
  if (allProbes.length === 0) return;

  // Accumulate geocode outcomes keyed by place object identity.
  interface ProbeOutcome {
    role: "address" | "name" | "named-place";
    probe: string;
    mismatchMeters: number;
    geocodedDistFromUser: number;
    geocodedLat: number;
    geocodedLon: number;
  }
  const outcomes = new Map<any, ProbeOutcome[]>();

  // Use scheduleNominatimCall so we obey the 1 req/sec ToS cap. Promise.allSettled
  // runs them concurrently; one slow lookup doesn't stall the rest.
  await Promise.allSettled(
    allProbes.map(({ place: p, probe, role }) =>
      scheduleNominatimCall(async () => {
        const result = await geocodeNearLocation(probe);
        if (!result) return; // geocode failure — cautious, do not block
        const mismatchMeters = haversineDistance(
          p.latitude,
          p.longitude,
          result.lat,
          result.lon,
        );
        const geocodedDistFromUser = haversineDistance(
          userLat,
          userLng,
          result.lat,
          result.lon,
        );
        const arr = outcomes.get(p) ?? [];
        arr.push({
          role,
          probe,
          mismatchMeters,
          geocodedDistFromUser,
          geocodedLat: result.lat,
          geocodedLon: result.lon,
        });
        outcomes.set(p, arr);
      }),
    ),
  );

  // Evaluate each place after all Nominatim calls have settled.
  const applyRejection = (
    p: any,
    probe: string,
    mismatchM: number,
    geocodedDistM: number,
    gLat: number,
    gLon: number,
    reason: string,
    twoSignal: boolean,
  ) => {
    p._rejectOutOfArea = true;
    const debug = {
      storedLat: p.latitude,
      storedLon: p.longitude,
      geocodedLat: gLat,
      geocodedLon: gLon,
      mismatchMeters: Math.round(mismatchM),
      geocodedDistFromUserMeters: Math.round(geocodedDistM),
      address: probe,
    };
    if (twoSignal) {
      p.latitude = gLat;
      p.longitude = gLon;
      p.autoNarrationBlocked = true;
    }
    p.addressCoherence = { ...debug, status: "mismatch", reason };
    logger.warn(
      { place: p.name, ...debug },
      twoSignal
        ? "[address-coherence] REJECTED (two-signal): resolves outside search area"
        : "[address-coherence] REJECTED: coordinate mismatch exceeds threshold",
    );
  };

  for (const [p, results] of outcomes) {
    const addrR = results.find((r) => r.role === "address");
    const nameR = results.find((r) => r.role === "name");
    const namedPlaceR = results.find((r) => r.role === "named-place");

    // Named-place probe is evaluated first and treated as a high-confidence
    // signal.  A specific geographic entity ("Locust Walk", "Fairmount Park")
    // has a well-known, unambiguous location.  If Nominatim places it far from
    // the claimed coordinates the place is almost certainly hallucinated or
    // mislocated — reject it regardless of what address/name-street probes say.
    if (namedPlaceR && namedPlaceR.mismatchMeters > COHERENCE_THRESHOLD_M) {
      const twoSignal = namedPlaceR.geocodedDistFromUser > searchRadius * 1.5;
      applyRejection(
        p,
        namedPlaceR.probe,
        namedPlaceR.mismatchMeters,
        namedPlaceR.geocodedDistFromUser,
        namedPlaceR.geocodedLat,
        namedPlaceR.geocodedLon,
        `Named-place reference "${namedPlaceR.probe}" geocodes ${Math.round(namedPlaceR.mismatchMeters)}m from claimed coordinates${twoSignal ? `; also ${Math.round(namedPlaceR.geocodedDistFromUser)}m from user (>1.5× search radius)` : ""}`,
        twoSignal,
      );
      continue;
    }

    if (addrR && nameR) {
      // Both probes returned results. Evaluate independently then reconcile.
      const addrOk = addrR.mismatchMeters <= COHERENCE_THRESHOLD_M;
      const nameOk = nameR.mismatchMeters <= COHERENCE_THRESHOLD_M;

      if (addrOk && nameOk) {
        p.addressCoherence = {
          storedLat: p.latitude,
          storedLon: p.longitude,
          geocodedLat: addrR.geocodedLat,
          geocodedLon: addrR.geocodedLon,
          mismatchMeters: Math.round(addrR.mismatchMeters),
          geocodedDistFromUserMeters: Math.round(addrR.geocodedDistFromUser),
          address: addrR.probe,
          nameProbedStreet: nameR.probe,
          status: "ok",
          reason: `address ${Math.round(addrR.mismatchMeters)}m and name-street ${Math.round(nameR.mismatchMeters)}m — both within tolerance`,
        };
      } else if (!nameOk) {
        // Name street reference conflicts with claimed coordinates even though
        // the address geocodes near the user. This is the fabricated-address
        // pattern: the LLM invented a plausible local address while the NAME
        // reveals the historical subject actually belongs on a different street.
        // The name signal takes precedence.
        const twoSignal = nameR.geocodedDistFromUser > searchRadius * 1.5;
        applyRejection(
          p,
          nameR.probe,
          nameR.mismatchMeters,
          nameR.geocodedDistFromUser,
          nameR.geocodedLat,
          nameR.geocodedLon,
          `Name street reference "${nameR.probe}" geocodes ${Math.round(nameR.mismatchMeters)}m from claimed coordinates (address may be fabricated to match user location)${twoSignal ? `; also ${Math.round(nameR.geocodedDistFromUser)}m from user (>1.5× search radius)` : ""}`,
          twoSignal,
        );
      } else {
        // nameOk but !addrOk — address disagrees even though name is locally
        // coherent. Standard address mismatch rejection.
        const twoSignal = addrR.geocodedDistFromUser > searchRadius * 1.5;
        applyRejection(
          p,
          addrR.probe,
          addrR.mismatchMeters,
          addrR.geocodedDistFromUser,
          addrR.geocodedLat,
          addrR.geocodedLon,
          `Address↔coordinate mismatch ${Math.round(addrR.mismatchMeters)}m (>${COHERENCE_THRESHOLD_M}m threshold)${twoSignal ? `; geocoded address ${Math.round(addrR.geocodedDistFromUser)}m from user (>1.5× search radius)` : ""}; place rejected from Walk Mode`,
          twoSignal,
        );
      }
    } else if (addrR || nameR) {
      // Only one probe type returned a result — single-probe evaluation.
      // Guard: when only a namedPlaceR was set and it already passed the
      // mismatch check above, both addrR and nameR are undefined here.
      // Without this guard `(addrR ?? nameR)!` is `undefined` at runtime
      // and `r.mismatchMeters` throws TypeError. The named-place case needs
      // no further action — the place is accepted.
      const r = (addrR ?? nameR)!;
      const label = addrR ? "Address" : `Name street reference "${r.probe}"`;
      if (r.mismatchMeters <= COHERENCE_THRESHOLD_M) {
        p.addressCoherence = {
          storedLat: p.latitude,
          storedLon: p.longitude,
          geocodedLat: r.geocodedLat,
          geocodedLon: r.geocodedLon,
          mismatchMeters: Math.round(r.mismatchMeters),
          geocodedDistFromUserMeters: Math.round(r.geocodedDistFromUser),
          address: r.probe,
          status: "ok",
          reason: `mismatch ${Math.round(r.mismatchMeters)}m within tolerance`,
        };
      } else {
        const twoSignal = r.geocodedDistFromUser > searchRadius * 1.5;
        applyRejection(
          p,
          r.probe,
          r.mismatchMeters,
          r.geocodedDistFromUser,
          r.geocodedLat,
          r.geocodedLon,
          `${label}↔coordinate mismatch ${Math.round(r.mismatchMeters)}m (>${COHERENCE_THRESHOLD_M}m threshold)${twoSignal ? `; geocoded ${Math.round(r.geocodedDistFromUser)}m from user (>1.5× search radius)` : ""}; place rejected from Walk Mode`,
          twoSignal,
        );
      }
    }
  }
}

async function postProcessPlaces(
  places: any[],
  userLat: number,
  userLng: number,
  searchRadius: number,
  options: { skipVerification?: boolean } = {},
): Promise<any[]> {
  const validConfidence = new Set(["high", "medium", "low"]);
  const maxDist = searchRadius * 1.1;

  let processed = places.filter((p: any) => {
    if (typeof p.latitude !== "number" || typeof p.longitude !== "number")
      return false;
    if (!p.name || typeof p.name !== "string") return false;
    if (!p.summary || typeof p.summary !== "string") return false;
    if (!Array.isArray(p.facts) || p.facts.length === 0) return false;
    if (p.confidence && !validConfidence.has(p.confidence)) {
      p.confidence = "low";
    }
    return true;
  });

  if (!options.skipVerification) {
    await verifyPlaceCoordinates(processed, userLat, userLng, searchRadius);
    await verifyAddressCoherence(processed, userLat, userLng, searchRadius);
  }

  processed = processed.filter((p: any) => {
    // Drop places where Nominatim confirmed the address is outside the search
    // area.  This catches LLM hallucinations where real historical knowledge
    // about a distant street is pinned at the user's query coordinates: the
    // LLM assigns the place to W 38th when it actually belongs on W 48th.
    if (p._rejectOutOfArea) return false;
    const dist = haversineDistance(userLat, userLng, p.latitude, p.longitude);
    p.distanceMeters = Math.round(dist);
    return dist <= maxDist;
  });

  const seen = new Map<string, any>();
  processed = processed.filter((p: any) => {
    const normName = normalizeText(p.name);
    for (const [existingName, existingPlace] of seen) {
      if (normName === existingName) return false;
      if (normName.includes(existingName) || existingName.includes(normName))
        return false;
      const coordDist = haversineDistance(
        p.latitude,
        p.longitude,
        existingPlace.latitude,
        existingPlace.longitude,
      );
      if (coordDist < 10) return false;
    }
    seen.set(normName, p);
    return true;
  });

  // Strip raw GPS coordinates from summary and facts — a common LLM failure
  // mode where the model writes "at 39.96507,-75.17780" verbatim into text.
  // The user is standing there; they don't need to read back their own coords.
  const COORD_PATTERN = /-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/g;
  for (const p of processed) {
    if (typeof p.summary === "string") {
      p.summary = p.summary.replace(COORD_PATTERN, "this location").trim();
    }
    if (Array.isArray(p.facts)) {
      p.facts = p.facts
        .filter((f: unknown) => typeof f === "string")
        .map((f: string) => f.replace(COORD_PATTERN, "this location").trim());
    }
  }

  processed = processed.filter((p: any) => {
    const vague = [
      "interesting history",
      "rich history",
      "long history",
      "has a story",
      "worth a visit",
      "notable building",
      "historic building",
      "old building",
    ];
    const summaryLower = p.summary.toLowerCase();
    const isVague = vague.some(
      (v) => summaryLower === v || summaryLower === v + ".",
    );
    if (isVague) return false;
    const allFactsGeneric = p.facts.every(
      (f: string) =>
        f.length < 20 ||
        /^(this|the) (place|building|site) (is|was|has)/i.test(f),
    );
    if (allFactsGeneric) return false;
    return true;
  });

  const ratingsMap = await fetchRatingsMap(processed);
  applyRatingSortWithMap(processed, ratingsMap);

  return processed;
}

// ---------------------------------------------------------------------------
// Discovery classification
// ---------------------------------------------------------------------------

import {
  classifyDiscovery,
  computeEmptyReason,
  filterDeniedPlaces,
  filterExploreTier4,
  filterGenericCommercial,
  suppressApproxDuplicates,
} from "../../lib/productionFilter";
export {
  classifyDiscovery,
  computeEmptyReason,
  filterDeniedPlaces,
  filterExploreTier4,
  filterGenericCommercial,
  suppressApproxDuplicates,
};
import { applyDiscoveryTier } from "../../lib/discoveryTier";
import { deriveHistoricalForce } from "../../lib/historicalForceMap";
import { computeOrientation } from "../../lib/orientation";

// ---------------------------------------------------------------------------
// LLM precision claim detection
// ---------------------------------------------------------------------------

import { applyLlmPrecisionFilter } from "../../lib/spatialTrustFilter";
import { resolveEffectiveHint } from "../../lib/areaContext";
import { isBoringResidentialBuilding } from "../../lib/residentialBuildingFilter";
export { applyLlmPrecisionFilter };

// ---------------------------------------------------------------------------
// Wikipedia / Wikimedia photo fetching
// ---------------------------------------------------------------------------

const photoCache = new Map<string, { url: string | null; ts: number }>();
const PHOTO_CACHE_HIT_TTL = 60 * 60 * 1000; // 1 hour for successful lookups
const PHOTO_CACHE_MISS_TTL = 5 * 60 * 1000; // 5 minutes for misses (timeout/404 — retry sooner)

// ---------------------------------------------------------------------------
// Wikipedia summary cache — in-memory, keyed wiki:v2:{lang}:{encoded_title}
// ---------------------------------------------------------------------------
// v2: switched from REST /page/summary/ (lead paragraph only) to the action
// API (prop=extracts&explaintext=1) which returns the full article text,
// including named sections like "History and architecture".  This gives the
// copy LLM access to story-bearing content (brewery history, notable events,
// family narratives) rather than only architectural metadata.

/** 4-hour TTL applied to both successful fetches and permanent failures
 *  (404, empty extract, malformed JSON) so a bad OSM tag doesn't hammer
 *  Wikipedia on every detail request.  Transient errors (timeout, abort)
 *  are NOT cached — they may succeed on the next attempt. */
const WIKIPEDIA_SUMMARY_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

const wikipediaSummaryCache = new Map<
  string,
  { data: WikipediaSummary | null; ts: number }
>();

/**
 * Fetch a Wikipedia article's full plain-text extract via the action API
 * (prop=extracts&explaintext=1).  Returns the complete article body rather
 * than only the lead paragraph, so named sections such as "History and
 * architecture" are available to the copy LLM.
 *
 * Cache key: wiki:v2:{lang}:{encoded_title}
 *
 * Only called when `osmTags.wikipedia` is well-formed — never guesses from
 * place names.  Always falls back gracefully: any failure returns null so
 * the detail endpoint continues with Phase-A (OSM-only) behaviour.
 */
async function fetchWikipediaSummary(
  lang: string,
  title: string,
  signal?: AbortSignal,
): Promise<WikipediaSummary | null> {
  const encodedTitle = encodeURIComponent(title);
  const cacheKey = `wiki:v2:${lang}:${encodedTitle}`;

  const cached = wikipediaSummaryCache.get(cacheKey);
  if (
    cached !== undefined &&
    Date.now() - cached.ts < WIKIPEDIA_SUMMARY_CACHE_TTL_MS
  ) {
    return cached.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const fetchSignal = signal
    ? AbortSignal.any([controller.signal, signal])
    : controller.signal;

  try {
    const params = new URLSearchParams({
      action: "query",
      prop: "extracts",
      explaintext: "1",
      redirects: "1",
      titles: title,
      format: "json",
    });
    const url = `https://${lang}.wikipedia.org/w/api.php?${params.toString()}`;
    const resp = await fetch(url, {
      signal: fetchSignal,
      headers: {
        "User-Agent": "UrbanExplorer/1.0 (walking-tour app)",
        Accept: "application/json",
      },
    });
    clearTimeout(timer);

    if (!resp.ok) {
      // Permanent failure — cache null to avoid hammering Wikipedia.
      wikipediaSummaryCache.set(cacheKey, { data: null, ts: Date.now() });
      logger.info(
        { lang, title, status: resp.status },
        "[wikipedia] action-api fetch non-ok — caching null",
      );
      return null;
    }

    let raw: {
      query?: {
        pages?: Record<
          string,
          { pageid?: number; title?: string; extract?: string }
        >;
      };
    };
    try {
      raw = (await resp.json()) as typeof raw;
    } catch {
      // Malformed JSON — cache null.
      wikipediaSummaryCache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    const pages = raw.query?.pages;
    const page = pages ? Object.values(pages)[0] : undefined;

    // pageid === -1 means the article was not found (missing page).
    if (!page || page.pageid === -1 || !page.extract) {
      wikipediaSummaryCache.set(cacheKey, { data: null, ts: Date.now() });
      logger.info(
        { lang, title },
        "[wikipedia] action-api page missing or empty — caching null",
      );
      return null;
    }

    const extract = page.extract.trim();
    if (extract.length === 0) {
      wikipediaSummaryCache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    const canonicalTitle = page.title ?? title;
    const summary: WikipediaSummary = {
      title: canonicalTitle,
      extract,
      lang,
      articleUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(canonicalTitle)}`,
    };

    wikipediaSummaryCache.set(cacheKey, { data: summary, ts: Date.now() });
    logger.info(
      { lang, title, extractLen: extract.length },
      "[wikipedia] fetched full extract",
    );
    return summary;
  } catch {
    clearTimeout(timer);
    // Timeout / network error — do NOT cache null (transient).
    return null;
  }
}

/**
 * Attempt to find a representative photo for a place name via the Wikipedia
 * REST summary API. Returns the thumbnail URL or null when none is available.
 *
 * Cache hierarchy:
 *   L1 — in-process Map (fast, lost on restart)
 *   L2 — database `place_photos` table (survives restarts / new instances)
 *
 * On a cold L1 miss the DB is checked first. If the DB also misses, a fresh
 * Wikipedia request is made and the result is written back to both layers.
 * Negative results (null) are also persisted so repeated missing-photo lookups
 * skip the network entirely after the first attempt.
 */
async function fetchWikipediaPhoto(
  placeName: string,
  externalSignal?: AbortSignal,
  articleTitle?: string,
  articleLang?: string,
): Promise<string | null> {
  // When an explicit OSM wikipedia article title is provided, use a separate
  // cache key so a stale/wrong placeName-guessed photo cannot bleed through.
  const cacheKey =
    articleTitle && articleLang
      ? `wiki:photo:v1:${articleLang}:${articleTitle.toLowerCase().replace(/ /g, "_")}`
      : placeName.toLowerCase().trim();

  // --- L1: in-process cache ---
  const cached = photoCache.get(cacheKey);
  if (cached) {
    const ttl = cached.url ? PHOTO_CACHE_HIT_TTL : PHOTO_CACHE_MISS_TTL;
    if (Date.now() - cached.ts < ttl) return cached.url;
  }

  // --- L2: database cache ---
  try {
    const rows = await db
      .select({
        photoUrl: placePhotos.photoUrl,
        fetchedAt: placePhotos.fetchedAt,
      })
      .from(placePhotos)
      .where(eq(placePhotos.placeKey, cacheKey))
      .limit(1);

    if (rows.length > 0) {
      const row = rows[0];
      const ageMs = Date.now() - new Date(row.fetchedAt).getTime();
      const ttl = row.photoUrl ? PHOTO_CACHE_HIT_TTL : PHOTO_CACHE_MISS_TTL;
      if (ageMs < ttl) {
        // Warm the L1 cache from DB so subsequent calls in this process skip the DB too.
        photoCache.set(cacheKey, { url: row.photoUrl, ts: Date.now() - ageMs });
        return row.photoUrl;
      }
    }
  } catch (err) {
    // DB unavailable — fall through to live fetch.
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      "[photo-cache] DB read failed, falling back to live fetch",
    );
  }

  // --- Live fetch from Wikipedia ---
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const fetchSignal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;

  let photoUrl: string | null = null;
  try {
    const fetchTitle = articleTitle ?? placeName;
    const fetchLang = articleLang ?? "en";
    const encoded = encodeURIComponent(fetchTitle.replace(/ /g, "_"));
    const url = `https://${fetchLang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    const resp = await fetch(url, {
      signal: fetchSignal,
      headers: {
        "User-Agent": "UrbanExplorer/1.0 (walking-tour app)",
        Accept: "application/json",
      },
    });
    clearTimeout(timer);
    if (resp.ok) {
      const data = (await resp.json()) as { thumbnail?: { source?: string } };
      photoUrl = data.thumbnail?.source ?? null;
    }
  } catch {
    clearTimeout(timer);
  }

  // Write back to L1.
  photoCache.set(cacheKey, { url: photoUrl, ts: Date.now() });

  // Write back to L2 (fire-and-forget — never delay the response on a DB write).
  db.insert(placePhotos)
    .values({ placeKey: cacheKey, photoUrl, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: placePhotos.placeKey,
      set: { photoUrl, fetchedAt: new Date() },
    })
    .catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        "[photo-cache] DB write failed",
      );
    });

  return photoUrl;
}

/**
 * Fetch photos for all places in parallel, annotating each with a `photoUrl`
 * field. Races against a hard wall-clock timeout so slow Wikipedia responses
 * never delay the discover reply significantly.
 */
async function fetchPhotosForPlaces(places: any[]): Promise<void> {
  if (places.length === 0) return;
  // Tight wall-clock cap so a slow Wikipedia response can't delay the discover
  // reply on cold-cache requests. Photos are best-effort; the cache-hit path
  // (see /explore/discover above) automatically backfills any places that
  // returned without artwork on the next request for the same area.
  const WALL_TIMEOUT_MS = 1500;
  const shared = new AbortController();
  const wallTimer = setTimeout(() => shared.abort(), WALL_TIMEOUT_MS);
  try {
    await Promise.all(
      places.map(async (p) => {
        if (shared.signal.aborted) return;
        const url = await fetchWikipediaPhoto(p.name, shared.signal);
        if (url) p.photoUrl = url;
      }),
    );
  } catch {
    // Photo fetch is best-effort — never break discovery.
  } finally {
    clearTimeout(wallTimer);
    shared.abort();
  }
}

// ---------------------------------------------------------------------------
// Lightweight rating enrichment + sort — called on both fresh and cached results
// ---------------------------------------------------------------------------

function placeIdFor(place: {
  name: string;
  latitude: number;
  longitude: number;
}): string {
  return `${place.name}-${place.latitude}-${place.longitude}`;
}

const RATING_BOOST_M = 80;
const MAX_BOOST_M = 400;

interface PlaceRatingEntry {
  up: number;
  down: number;
  netScore: number;
}

/**
 * Batch-fetch ratings from the database for a set of places.
 * Returns a Map of placeId -> { up, down, netScore }.
 * Silently returns an empty Map on database errors so discovery still works.
 */
async function fetchRatingsMap(
  places: any[],
): Promise<Map<string, PlaceRatingEntry>> {
  if (places.length === 0) return new Map();
  const ids = places.map(placeIdFor);
  try {
    const rows = await db
      .select({
        placeId: placeRatings.placeId,
        up: placeRatings.up,
        down: placeRatings.down,
      })
      .from(placeRatings)
      .where(inArray(placeRatings.placeId, ids));
    const map = new Map<string, PlaceRatingEntry>();
    for (const row of rows) {
      map.set(row.placeId, {
        up: row.up,
        down: row.down,
        netScore: row.up - row.down,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Annotates each place with its current `netScore` and `communityRating` (from the
 * pre-fetched ratingsMap), then sorts the array in-place by effective distance
 * (distance minus rating boost). Callers must pass a cloned array when the source
 * is a cached object.
 */
function applyRatingSortWithMap(
  places: any[],
  ratingsMap: Map<string, PlaceRatingEntry>,
): void {
  for (const p of places) {
    const rating = ratingsMap.get(placeIdFor(p)) ?? {
      up: 0,
      down: 0,
      netScore: 0,
    };
    p.netScore = rating.netScore;
    p.communityRating = rating;
  }
  places.sort((a: any, b: any) => {
    const aBoost = Math.max(
      -MAX_BOOST_M,
      Math.min(MAX_BOOST_M, (a.netScore ?? 0) * RATING_BOOST_M),
    );
    const bBoost = Math.max(
      -MAX_BOOST_M,
      Math.min(MAX_BOOST_M, (b.netScore ?? 0) * RATING_BOOST_M),
    );
    return a.distanceMeters - aBoost - (b.distanceMeters - bBoost);
  });
}

router.post("/explore/discover", async (req, res) => {
  const requestStartTime = Date.now();
  const parsed = DiscoverPlacesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const {
    latitude,
    longitude,
    radius,
    mode,
    includeBuildingTypes,
    addressHint,
    walkMode,
    osmAnchor,
  } = parsed.data;
  const isQuick = mode === "quick";
  const requestedRadius = radius ?? (isQuick ? 500 : 300);
  const searchRadius = Math.max(50, Math.min(1000, requestedRadius));

  const radiusFeet = Math.round(searchRadius * 3.281);

  // Compute the effective denylist: start from the module-level set and
  // remove any types the user has opted into. Normalise to lowercase.
  const userIncludes = new Set(
    (includeBuildingTypes ?? []).map((t) => t.toLowerCase()),
  );
  const effectiveDenylist = new Set(
    [...BORING_BUILDING_TYPES].filter((t: string) => !userIncludes.has(t)),
  );

  // ±100m cache grid: snap to the nearest 0.002° step (≈222m per step →
  // ±111m from the grid centre). Any two queries within ~100m of the same
  // grid point share the same cache entry — the historical places on the
  // same block are the same regardless of exactly where you stood.
  // When the user has unlocked specific building types we append a sorted
  // suffix so their preference gets its own LLM-cache slot.
  const snapGrid = (v: number) => (Math.round(v * 500) / 500).toFixed(3);
  const modeKey = isQuick ? "quick" : "full";
  const includesSuffix =
    userIncludes.size > 0 ? `:inc=${[...userIncludes].sort().join(",")}` : "";
  // @prompt-region discover
  const discoverCacheKey = osmAnchor
    ? `${modeKey}:v68:${searchRadius}:${snapGrid(latitude)},${snapGrid(longitude)}${includesSuffix}:osm`
    : `${modeKey}:v63:${searchRadius}:${snapGrid(latitude)},${snapGrid(longitude)}${includesSuffix}`;
  // @end-prompt-region discover

  // Fire the neighbourhood label lookup immediately. On a cache-warm revgeo
  // call this resolves in microseconds (in-memory Map lookup). On a cold
  // first-ever request for this grid cell it has a 4 s hard ceiling (its own
  // AbortController — see fetchNeighborhoodLabel), not the ~1 s this comment
  // used to claim. In the osmAnchor branch this promise is awaited BEFORE the
  // Overpass fetch starts (sequential, not overlapping), so its full ceiling
  // is additive to the Overpass fetch's own 12 s ceiling — see the worst-case
  // accounting in WalkModeContext.tsx's discoverTimeout comment. We ALWAYS
  // override data.location with this result — never the LLM's (potentially
  // hallucinated) value.
  const nbhdLabelPromise = fetchNeighborhoodLabel(latitude, longitude);

  const cachedDiscover = getLLMCache<{ places?: any[]; [key: string]: any }>(
    discoverCacheKey,
  );
  if (cachedDiscover) {
    // Re-apply current ratings on every cache hit so newly-submitted ratings
    // immediately affect the sort order and communityRating display without
    // waiting for cache expiry. Clone places so we never mutate the cached object.
    if (
      Array.isArray(cachedDiscover.places) &&
      cachedDiscover.places.length > 0
    ) {
      let allCachedPlaces = cachedDiscover.places.map((p: any) => ({ ...p }));
      // Re-apply production filters on every cache hit so that a deny-list
      // expansion after a cache entry was written cannot let banned categories
      // through. Classification is cheap (O(n), no external calls).
      classifyDiscovery(allCachedPlaces);
      // Apply discovery tier on every cache hit so pre-change cached entries
      // receive tier classification on the way out (no cache bump needed).
      applyDiscoveryTier(allCachedPlaces);
      // historicalForce is derived on every read (fresh + cached), same
      // pattern as discoveryTier above — table edits take effect without a
      // cache-version bump. Tag-attachment only; not consumed anywhere yet.
      for (const p of allCachedPlaces) {
        const hf = deriveHistoricalForce(p.osmTags ?? {});
        if (hf) p.historicalForce = hf;
      }
      applyLlmPrecisionFilter(allCachedPlaces);
      suppressApproxDuplicates(allCachedPlaces);
      allCachedPlaces = filterDeniedPlaces(allCachedPlaces);
      const preQualityFilterCount = allCachedPlaces.length;
      // Generic commercial businesses (chains) are excluded from both Explore
      // and Walk Mode candidate pools/pins — confirmed product decision. The
      // cache holds the full classified set — this runs on the cloned array only.
      // Rubric: artifacts/urban-explorer/docs/discovery-ranking-rubric.md — "Suppress from auto-surface".
      allCachedPlaces = filterGenericCommercial(allCachedPlaces);
      // Tier-4 (metadata-only) suppression remains Explore-only. Walk Mode
      // handles T4 suppression in walkEligibility.ts ("lowQuality") —
      // narration-eligibility only; pins remain visible.
      if (!walkMode) {
        allCachedPlaces = filterExploreTier4(allCachedPlaces);
      }
      // Both Explore and Walk require external coordinate verification.
      // Unverified LLM-coordinate places must not reach the UI in either mode.
      const refreshedPlaces = allCachedPlaces.filter(
        (p: any) => p.coordSource !== undefined,
      );
      const ratingsMap = await fetchRatingsMap(refreshedPlaces);
      applyRatingSortWithMap(refreshedPlaces, ratingsMap);
      // Override location with Nominatim reverse-geocode of the actual search
      // centre — never use the LLM-generated value from the cache.
      const nbhdLabel = await nbhdLabelPromise;
      const cachedEmptyReason = walkMode
        ? undefined
        : computeEmptyReason(preQualityFilterCount, refreshedPlaces.length);
      res.json({
        ...cachedDiscover,
        places: refreshedPlaces,
        location: nbhdLabel.label,
        locationSrc: nbhdLabel.src,
        // Cached path always derives area context from Nominatim (the cache
        // was written on a fresh path, which already enforced Nominatim-wins).
        effectiveAddressHintSrc:
          nbhdLabel.src === "nominatim" ? "nominatim" : "absent",
        ...(cachedEmptyReason ? { emptyReason: cachedEmptyReason } : {}),
      });

      // Background: if any cached places are missing photos (e.g. the original
      // request hit the wall-clock timeout before Wikipedia responded), try again
      // now and update the cache so the next hit gets artwork.
      const missingPhotos = cachedDiscover.places.filter(
        (p: any) => !p.photoUrl,
      );
      if (missingPhotos.length > 0) {
        (async () => {
          try {
            await fetchPhotosForPlaces(missingPhotos);
            // Only update cache if we actually found any new photos.
            if (missingPhotos.some((p: any) => p.photoUrl)) {
              setLLMCache(discoverCacheKey, cachedDiscover);
            }
          } catch {
            // Best-effort — never break the cached response.
          }
        })();
      }
    } else {
      const nbhdLabel = await nbhdLabelPromise;
      res.json({
        ...cachedDiscover,
        location: nbhdLabel.label,
        locationSrc: nbhdLabel.src,
        effectiveAddressHintSrc:
          nbhdLabel.src === "nominatim" ? "nominatim" : "absent",
      });
    }
    return;
  }

  // ── OSM-ANCHOR WALK MODE ─────────────────────────────────────────────────
  // When osmAnchor is true, Overpass is the definitive candidate source.
  // The LLM writes copy only — it cannot invent place names, addresses, or
  // coordinates. Zero Overpass results → return empty with noVerifiedPlacesNearby.
  // If Overpass is unavailable (IP-blocked, network error), return empty with
  // overpassFallback: true. osmAnchor: true means "grounded or nothing" — there
  // is no LLM fallback path regardless of Overpass availability.
  //
  // overpassFallbackMode is retained below for historical reference but is now
  // permanently false on this path; its downstream guards are dead code.
  const overpassFallbackMode = false;
  if (osmAnchor) {
    const nbhdLabel = await nbhdLabelPromise;

    // 1. Fetch OSM candidates — generous timeout, no brainstorm race needed.
    // null = Overpass errored or timed out (transient); [] = genuinely sparse.
    // The outer 8 s race guards against fetchNearbyOSMPlaces stalling after
    // its own internal abort fires (e.g. slow TLS teardown).
    let overpassErrored = false;
    const osmRaceResult = await Promise.race([
      fetchNearbyOSMPlaces(
        latitude,
        longitude,
        Math.min(searchRadius, 500),
        false,
        80,
      ).catch((): null => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
    ]);
    if (osmRaceResult === null) {
      overpassErrored = true;
    }
    let osmCandidates: OSMPlace[] = osmRaceResult ?? [];

    // Apply boring-building denylist
    if (effectiveDenylist.size > 0) {
      osmCandidates = osmCandidates.filter((p) => {
        const building = (p.tags["building"] ?? "").toLowerCase();
        return !building || !effectiveDenylist.has(building);
      });
    }
    // Suppress plain residential buildings with no story-bearing OSM tags.
    // Applied after the denylist so the two filters compose cleanly.
    osmCandidates = osmCandidates.filter(
      (p) => !isBoringResidentialBuilding(p.tags),
    );

    // 2. Density counts at three radius tiers (before any radius filter)
    const countWithin = (r: number) =>
      osmCandidates.filter(
        (p) => haversineDistance(latitude, longitude, p.lat, p.lon) <= r,
      ).length;
    const osmCandidateCount = {
      r150: countWithin(150),
      r300: countWithin(300),
      r500: countWithin(500),
    };
    const searchBucket: "r150" | "r300" | "r500" =
      searchRadius <= 150 ? "r150" : searchRadius <= 300 ? "r300" : "r500";

    // 3. Zero density → return empty. osmAnchor: true means "grounded or nothing":
    // both a genuine sparse area and an Overpass outage produce an empty response.
    // No LLM fallback in either sub-case.
    if (osmCandidateCount[searchBucket] === 0) {
      if (overpassErrored) {
        // Overpass is unavailable (IP-blocked, network error, timeout).
        // Return an empty result — do not fall through to the LLM path.
        // overpassFallback: true lets the client and logs distinguish this
        // from a genuine sparse area (noVerifiedPlacesNearby: true).
        // Short TTL so the client retries promptly once Overpass recovers.
        req.log.warn(
          { tile: `${snapGrid(latitude)},${snapGrid(longitude)}` },
          "[osmAnchor] Overpass unavailable — returning empty (grounded-only policy)",
        );
        const unavailableResp = {
          places: [],
          location: nbhdLabel.label,
          locationSrc: nbhdLabel.src,
          effectiveAddressHintSrc:
            nbhdLabel.src === "nominatim" ? "nominatim" : "absent",
          osmCandidateCount,
          overpassFallback: true,
        };
        const SHORT_TTL_MS = 30 * 1000;
        llmCache.set(discoverCacheKey, {
          data: unavailableResp,
          timestamp: Date.now() - (LLM_CACHE_TTL_MS - SHORT_TTL_MS),
        });
        res.json(unavailableResp);
        return;
      }
      // Genuine sparse area: cache with a short 30 s TTL so the next walk
      // session can retry promptly without hammering Overpass on every tick.
      const emptyResp = {
        places: [],
        location: nbhdLabel.label,
        locationSrc: nbhdLabel.src,
        effectiveAddressHintSrc:
          nbhdLabel.src === "nominatim" ? "nominatim" : "absent",
        osmCandidateCount,
        noVerifiedPlacesNearby: true,
        ...(!walkMode ? { emptyReason: "no_candidates" as const } : {}),
      };
      const SHORT_TTL_MS = 30 * 1000;
      llmCache.set(discoverCacheKey, {
        data: emptyResp,
        timestamp: Date.now() - (LLM_CACHE_TTL_MS - SHORT_TTL_MS),
      });
      res.json(emptyResp);
      return;
    }

    // 4. Limit to candidates within the search radius (10% headroom)
    const candidates = osmCandidates.filter(
      (p) =>
        haversineDistance(latitude, longitude, p.lat, p.lon) <=
        searchRadius * 1.1,
    );

    // Helpers for address and copy formatting
    const buildOsmAddr = (tags: Record<string, string>): string => {
      const num = tags["addr:housenumber"] ?? "";
      const street = tags["addr:street"] ?? "";
      if (num && street) return `${num} ${street}`.trim();
      if (street) return street;
      return "";
    };

    const HINT_TAGS = [
      "historic",
      "description",
      "heritage:description",
      "start_date",
      "wikidata",
      "wikipedia",
      "operator",
      "denomination",
      "alt_name",
      "architect",
      "building:material",
      "building:levels",
    ] as const;

    const formatForCopy = (
      p: OSMPlace,
      wikiSummary?: WikipediaSummary | null,
    ): Record<string, unknown> => {
      const obj: Record<string, unknown> = {
        id: p.osmId,
        name: p.name,
        type: p.type,
        trustLevel: computeOsmTrustLevel(p.tags),
      };
      const addr = buildOsmAddr(p.tags);
      if (addr) obj.address = addr;
      for (const key of HINT_TAGS) {
        const val = p.tags[key];
        if (val) obj[key] = sanitizeOSMText(val, 120);
      }
      // Inject the first 1,000 chars of the Wikipedia extract when available.
      // The copy LLM uses this as factual grounding (rule 11 in the system
      // prompt). 1,000 chars is enough to capture full named sections (e.g.
      // "History and architecture") that carry story-bearing content such as
      // family history, notable events, or contextual narrative — content the
      // REST /page/summary/ lead-paragraph never included.
      if (wikiSummary?.extract) {
        obj.wikipediaContent = wikiSummary.extract.slice(0, 1_000);
      }
      return obj;
    };

    // 5. Call LLM for copy-only (summary, facts, tags, yearBuilt, confidence)
    type CopyResult = {
      id: string;
      summary: string;
      facts: string[];
      tags?: string[];
      yearBuilt?: string;
      confidence?: string;
    };
    let copyResults: CopyResult[] = [];
    const copyAbort = new AbortController();
    // max_completion_tokens is 3000 here (vs ~1200-1800 on the non-anchor
    // discover path's 35 s timeout) to cover copy for up to ~26-30 candidates
    // in one call, so worst-case generation can plausibly run 35-40 s. 45 s
    // leaves real headroom above that, and stays inside the client's 70 s
    // discoverTimeout (WalkModeContext.tsx) — see that comment for the full
    // worst-case accounting (nbhd-label + Overpass + this timer).
    // copyAbort.signal can fire from either cause below — track which one
    // actually happened so the diagnostic log doesn't misattribute a client
    // disconnect as a server-side timeout.
    let copyAbortCause: "timer" | "client-close" | undefined;
    const abortCopy = (cause: "timer" | "client-close") => {
      if (!copyAbort.signal.aborted) {
        copyAbortCause = cause;
        copyAbort.abort();
      }
    };
    const copyTimer = setTimeout(() => abortCopy("timer"), 45_000);
    res.on("close", () => abortCopy("client-close"));
    // Elapsed time before the copy-generation LLM call starts — covers the
    // nbhd-label wait, the Overpass race (up to 12 s), and candidate
    // filtering. Logged alongside the timer outcome below to distinguish
    // pre-LLM latency from the LLM call itself.
    const preCopyElapsedMs = Date.now() - requestStartTime;

    // 5a. Pre-fetch Wikipedia summaries for OSM candidates that carry a
    // wikipedia= tag. Fetches run in parallel (Promise.all) and are backed by
    // the shared in-memory cache (wiki-v2, keyed by lang/title) also used by the
    // detail-page Phase B path — a subsequent detail-page tap for the same
    // place is a free cache hit with no second Wikipedia API call.
    // Total added latency: ~200–400 ms for the slowest single fetch, which is
    // negligible before the 3–30 s copy LLM call that follows. If any fetch
    // times out or fails, the candidate silently falls through to the
    // thin-copy path unchanged.
    const wikiMap = new Map<string, WikipediaSummary>();
    {
      type WikiJob = { osmId: string; lang: string; title: string };
      const jobs: WikiJob[] = candidates
        .map((c): WikiJob | null => {
          const tag = c.tags["wikipedia"];
          if (!tag) return null;
          const parsed = parseWikipediaOsmTag(tag);
          if (!parsed) return null;
          return { osmId: c.osmId, lang: parsed.lang, title: parsed.title };
        })
        .filter((x): x is WikiJob => x !== null);

      if (jobs.length > 0) {
        req.log.debug(
          { count: jobs.length },
          "[osm-anchor] pre-fetching Wikipedia summaries",
        );
        const settled = await Promise.all(
          jobs.map(({ osmId, lang, title }) =>
            fetchWikipediaSummary(lang, title, copyAbort.signal).then((s) => ({
              osmId,
              summary: s,
            })),
          ),
        );
        for (const { osmId, summary } of settled) {
          if (summary) wikiMap.set(osmId, summary);
        }
        if (wikiMap.size > 0) {
          req.log.info(
            { enriched: wikiMap.size, total: jobs.length },
            "[osm-anchor] Wikipedia enrichment ready",
          );
        }
      }
    }

    const locationHint = nbhdLabel.label || `${latitude}, ${longitude}`;
    // @prompt-region discover
    const copyMaxCompletionTokens = 3000;
    // @end-prompt-region discover
    // Diagnostic-only fields populated as soon as the raw response is
    // available (before JSON.parse), so they're still captured in the catch
    // block below even when parsing itself throws (e.g. the "Unterminated
    // string" failures we're currently investigating). Does not affect
    // timeout, prompt, retry, or fallback behavior.
    let copyResponseLength: number | undefined;
    let copyFinishReason: string | undefined;
    let copyCompletionTokens: number | undefined;
    try {
      // @prompt-region discover
      const copyResponse = await openai.chat.completions.create(
        {
          model: "gpt-4.1-mini",
          max_completion_tokens: copyMaxCompletionTokens,
          messages: [
            {
              role: "system",
              content: `You are a hyper-local urban historian writing brief copy for real places sourced from OpenStreetMap.

MANDATORY RULES:
1. Return exactly the same number of results as candidates provided.
2. The "id" in each result MUST exactly match the "id" in the corresponding candidate. Do NOT change, reorder, add, or remove any place.
3. Do NOT modify the name, latitude, longitude, or address of any place.
4. Do NOT invent a place that was not in the candidates list.
5–8. COPY RULES — apply based on the "trustLevel" field on each candidate:

${OSM_COPY_RULES.osm_enriched}

${OSM_COPY_RULES.osm_standard}

${OSM_COPY_RULES.osm_bare}

Flag any claim not directly supported by the candidate's tags with "Reportedly" or "According to local accounts."
9. NEVER write raw GPS coordinates in any text field.
10. DISPLAY TAGS — the "tags" array must contain only short, human-readable descriptor phrases a general audience would understand (e.g. "historic mansion", "place of worship", "Victorian building", "art deco", "immigrant heritage"). NEVER put raw database identifiers, Wikidata IDs (e.g. Q4891444), Wikipedia slugs, OSM field names (wikidata, wikipedia, building:levels, denomination, operator), key:value pairs, or any technical metadata in tags. Tags are user-visible copy, not metadata echo.
11. WIKIPEDIA CONTENT — when a candidate includes a "wikipediaContent" field, use it as factual grounding for the summary and facts. Write from it directly: you may quote or paraphrase. Do not invent claims beyond what it states. Do not mention Wikipedia or the article by name in the copy — just write good historical prose informed by the content. Standalone attribution facts — "designed by architect X", "built in year Y", "listed on the National Register", "in a Beaux Arts style" — are NOT sufficient on their own for a discovery-worthy summary. Only use them to anchor a broader story: explain why the architect matters, what else they built, who commissioned the building and why, or what notable events occurred here. If the Wikipedia content contains only architectural metadata with no narrative context (no notable people, no events, no transformation over time), reflect that in a lower-confidence summary rather than dressing up dry facts as a compelling discovery.

Respond in JSON: {"results":[{"id":"...","summary":"One sentence.","facts":["...","..."],"tags":["3-5 relevant tags"],"yearBuilt":"1920s or omit","confidence":"high|medium|low"}]}`,
            },
            {
              role: "user",
              content: `Write historical copy for these real nearby places from OpenStreetMap near ${locationHint}:\n${JSON.stringify(candidates.map((c) => formatForCopy(c, wikiMap.get(c.osmId))))}`,
            },
          ],
          response_format: { type: "json_object" },
        },
        // @end-prompt-region discover
        { signal: copyAbort.signal },
      );
      clearTimeout(copyTimer);
      const copyContent = copyResponse.choices[0]?.message?.content;
      copyResponseLength = copyContent?.length;
      copyFinishReason = copyResponse.choices[0]?.finish_reason;
      copyCompletionTokens = copyResponse.usage?.completion_tokens;
      if (copyContent) {
        const copyData = JSON.parse(copyContent) as { results?: unknown[] };
        if (Array.isArray(copyData?.results)) {
          copyResults = copyData.results as CopyResult[];
        }
      }
      req.log.info(
        {
          reqId: req.id,
          branch: "osm-anchor",
          maxCompletionTokens: copyMaxCompletionTokens,
          responseLength: copyResponseLength,
          finishReason: copyFinishReason,
          completionTokens: copyCompletionTokens,
        },
        "[osm-anchor] copy generation succeeded",
      );
    } catch (err: any) {
      clearTimeout(copyTimer);
      if (
        copyAbort.signal.aborted &&
        !res.headersSent &&
        res.socket?.writable
      ) {
        req.log.warn(
          {
            reqId: req.id,
            branch: "osm-anchor",
            abortCause: copyAbortCause,
            timeoutMs: 45_000,
            radius: searchRadius,
            preCopyElapsedMs,
            totalElapsedMs: Date.now() - requestStartTime,
            maxCompletionTokens: copyMaxCompletionTokens,
          },
          "[osm-anchor] copyAbort fired — returning 503",
        );
        res.status(503).json({
          error: "Discovery service temporarily unavailable. Please try again.",
        });
        return;
      }
      // Copy failure is non-fatal: OSM coordinates are still correct
      req.log.warn(
        {
          reqId: req.id,
          branch: "osm-anchor",
          radius: searchRadius,
          preCopyElapsedMs,
          totalElapsedMs: Date.now() - requestStartTime,
          maxCompletionTokens: copyMaxCompletionTokens,
          responseLength: copyResponseLength,
          finishReason: copyFinishReason,
          completionTokens: copyCompletionTokens,
          err,
        },
        "[osm-anchor] LLM copy generation failed — returning bare OSM candidates",
      );
    }

    // 6. Merge LLM copy onto OSM objects
    const copyMap = new Map<string, CopyResult>(
      copyResults.map((r) => [r.id, r]),
    );
    let mergedPlaces: any[] = candidates.map((p) => {
      const copy = copyMap.get(p.osmId);
      const addr = buildOsmAddr(p.tags);
      const placeTrustLevel = computeOsmTrustLevel(p.tags);
      const placeOsmTags: Record<string, string> = {};
      for (const key of HINT_TAGS) {
        const val = p.tags[key];
        if (val) placeOsmTags[key] = sanitizeOSMText(val, 120);
      }
      return {
        id: p.osmId.replace("/", "-"),
        name: p.name,
        category: p.type,
        latitude: p.lat,
        longitude: p.lon,
        address: addr || undefined,
        coordSource: "osm",
        osmId: p.osmId,
        candidateSource: "osm",
        trustLevel: placeTrustLevel,
        osmTags:
          Object.keys(placeOsmTags).length > 0 ? placeOsmTags : undefined,
        distanceMeters: Math.round(
          haversineDistance(latitude, longitude, p.lat, p.lon),
        ),
        summary: copy?.summary ?? "A notable place in this area.",
        facts: copy?.facts ?? [],
        tags: sanitizeDisplayTags(copy?.tags),
        yearBuilt: copy?.yearBuilt,
        confidence: copy?.confidence ?? "low",
        orientation: computeOrientation(
          {
            osmId: p.osmId,
            name: p.name,
            lat: p.lat,
            lon: p.lon,
            address: addr || undefined,
          },
          candidates,
        ),
      };
    });

    // 7. Standard post-processing filters (no Nominatim — coords are from OSM)
    classifyDiscovery(mergedPlaces);
    applyDiscoveryTier(mergedPlaces);
    // historicalForce is derived on every read (fresh + cached), same
    // pattern as discoveryTier above. Tag-attachment only; not consumed
    // anywhere yet.
    for (const p of mergedPlaces) {
      const hf = deriveHistoricalForce(p.osmTags ?? {});
      if (hf) p.historicalForce = hf;
    }
    applyLlmPrecisionFilter(mergedPlaces);
    suppressApproxDuplicates(mergedPlaces);
    mergedPlaces = filterDeniedPlaces(mergedPlaces);

    // 8. Wikipedia photos (best-effort)
    await fetchPhotosForPlaces(mergedPlaces);

    // 9. Community ratings sort
    const anchorRatingsMap = await fetchRatingsMap(mergedPlaces);
    applyRatingSortWithMap(mergedPlaces, anchorRatingsMap);

    const anchorResp = {
      places: mergedPlaces,
      location: nbhdLabel.label,
      locationSrc: nbhdLabel.src,
      effectiveAddressHintSrc:
        nbhdLabel.src === "nominatim" ? "nominatim" : "absent",
      osmCandidateCount,
      noVerifiedPlacesNearby: false,
    };
    setLLMCache(discoverCacheKey, anchorResp);
    // Generic commercial businesses (chains) are excluded from both Explore
    // and Walk Mode candidate pools/pins — confirmed product decision. The
    // cache (above) retains the full classified set; this runs on the way
    // out only.
    // Rubric: artifacts/urban-explorer/docs/discovery-ranking-rubric.md — "Suppress from auto-surface".
    const anchorGenericFiltered = filterGenericCommercial(mergedPlaces);
    // Tier-4 (metadata-only) suppression remains Explore-only. Walk Mode
    // handles T4 suppression in walkEligibility.ts ("lowQuality") —
    // narration-eligibility only; pins remain visible.
    const anchorResponsePlaces = walkMode
      ? anchorGenericFiltered
      : filterExploreTier4(anchorGenericFiltered);
    const anchorEmptyReason = walkMode
      ? undefined
      : computeEmptyReason(mergedPlaces.length, anchorResponsePlaces.length);
    res.json({
      ...anchorResp,
      places: anchorResponsePlaces,
      ...(anchorEmptyReason ? { emptyReason: anchorEmptyReason } : {}),
    });
    return;
  }

  // Fresh (non-cached) path: await the neighbourhood label now — before the
  // brainstorm and OSM promises fire — so we can pass the Nominatim-derived
  // address as the effective addressHint for the LLM.  On a warm revgeo cache
  // this is free.  On a cold first request the ~1 s delay is negligible
  // compared to the 3–10 s LLM call that follows.
  const nbhdLabel = await nbhdLabelPromise;

  // Nominatim is always authoritative over any client-supplied addressHint.
  // The device OS geocoder (Expo Location.reverseGeocodeAsync) can return an
  // incorrect neighbourhood — e.g. "University City" for coordinates firmly
  // inside Fairmount — causing the LLM to generate wrong-neighbourhood content
  // that then gets cached and served for the correct coordinates.
  const { hint: effectiveAddressHint, src: effectiveAddressHintSrc } =
    resolveEffectiveHint(nbhdLabel.label, nbhdLabel.src, addressHint);

  // Log when a client hint was present but overridden, so field reports can
  // confirm the fix is working.
  if (addressHint && effectiveAddressHintSrc !== "client-hint") {
    req.log.debug(
      { clientHint: addressHint, nominatimLabel: nbhdLabel.label },
      "[area-context] Client addressHint suppressed — Nominatim label is authoritative",
    );
  }

  const osmTimeLimit = isQuick ? 3000 : 4000;
  const osmPromise: Promise<OSMPlace[]> = Promise.race([
    fetchNearbyOSMPlaces(latitude, longitude, searchRadius, isQuick)
      .then((r) => r ?? ([] as OSMPlace[]))
      .catch(() => [] as OSMPlace[]),
    new Promise<OSMPlace[]>((resolve) =>
      setTimeout(() => resolve([]), osmTimeLimit),
    ),
  ]);

  // Place count and token budget scale inversely with radius for full mode.
  // At 150 m the post-filter (radius × 1.1 = 165 m cutoff) can discard several
  // AI-generated places whose coordinates land just outside the ring, so we
  // request more up front to guarantee a dense result set in dense areas.
  //   Close  (≤150 m): 8-12 places, 2500 tokens  (matches quick-mode budget)
  //   Medium (≤300 m): 6-9  places, 2000 tokens
  //   Wide   (>300 m): 5-7  places, 1800 tokens
  // Quick mode (map pan) keeps its own 8-12 / 2500 budget unchanged.
  // @prompt-region discover
  let placeCount: string;
  let maxTokens: number;
  if (isQuick) {
    placeCount = "8-12";
    maxTokens = 2500;
  } else if (searchRadius <= 150) {
    placeCount = "8-12";
    maxTokens = 2500;
  } else if (searchRadius <= 300) {
    placeCount = "6-9";
    maxTokens = 2000;
  } else {
    placeCount = "5-7";
    maxTokens = 1800;
  }
  const modelName = "gpt-4.1-mini";
  // @end-prompt-region discover

  // Two-step discovery for full mode: brainstorm freely, then format.
  // Run the brainstorm IN PARALLEL with the Overpass fetch — both only need the
  // raw coordinates, so there's no reason to serialize them. The brainstorm's
  // job is to surface obscure coordinate-anchored historical knowledge that
  // OSM data doesn't contain anyway. The main LLM call below still gets the
  // full OSM context. This eliminates ~3-5 s of serial wait on cold full-mode
  // requests (the most common new-user path).
  const brainstormPromise: Promise<string> = (async () => {
    if (isQuick) return "";
    try {
      const BRAINSTORM_TIMEOUT_MS = 8000;
      const brainstormAbort = new AbortController();
      const brainstormTimer = setTimeout(
        () => brainstormAbort.abort(),
        BRAINSTORM_TIMEOUT_MS,
      );
      try {
        // @prompt-region discover
        const brainstormResponse = await openai.chat.completions.create(
          {
            model: "gpt-4.1-mini",
            max_completion_tokens: 1400,
            messages: [
              {
                role: "system",
                content:
                  "You are a hyper-local urban historian with encyclopedic knowledge of streets, buildings, and blocks. When given GPS coordinates, brainstorm freely — without worrying about format — everything you know about the immediate surroundings: historical occupants, architectural details, former uses, local figures, infrastructure oddities, buried waterways, ghost signs, community organizations, scandals, events, transitions. Include obscure and surprising facts. Name names and dates when you know them. This is an internal brainstorm; quality and specificity matter more than completeness.\n\nWork through the area in ERAS — name at least one specific building, person, or event per era where you can: (1) pre-1900 — original land use, early industry, immigrant communities, street-grid changes; (2) 1900–1940 — tenement era, industrial peak, Prohibition speakeasies, Great Migration, labor organizing, political machines; (3) 1940–1970 — urban renewal demolitions, ethnic succession, postwar boom or decline, highway construction, redlining effects; (4) 1970–present — disinvestment, community organizing, gentrification waves, notable demolitions or salvage.\n\nCRITICAL: Never invent street names. If you are unsure of an exact address, refer to the nearest known intersection or cross-streets instead. A place anchored to a real intersection is always better than one with a fabricated street name.",
              },
              {
                role: "user",
                content: `Brainstorm everything you know about the immediate area around ${latitude}, ${longitude}${effectiveAddressHint ? ` (${effectiveAddressHint})` : ""} (within roughly ${radiusFeet} feet). Think out loud — what are the most surprising, specific, or overlooked historical facts about this exact block or intersection?`,
              },
            ],
          },
          // @end-prompt-region discover
          { signal: brainstormAbort.signal },
        );
        return brainstormResponse.choices[0]?.message?.content ?? "";
      } finally {
        clearTimeout(brainstormTimer);
      }
    } catch {
      // Brainstorm failure or timeout is non-fatal — proceed with single-step generation.
      return "";
    }
  })();

  const [osmPlacesRaw, brainstormContext] = await Promise.all([
    osmPromise,
    brainstormPromise,
  ]);
  let osmPlaces: OSMPlace[] = osmPlacesRaw;

  // Apply boring-building denylist now that we have the user's preferences.
  if (effectiveDenylist.size > 0) {
    osmPlaces = osmPlaces.filter((p) => {
      const building = (p.tags["building"] ?? "").toLowerCase();
      return !building || !effectiveDenylist.has(building);
    });
  }
  // Suppress plain residential buildings with no story-bearing OSM tags.
  // Applied after the denylist so the two filters compose cleanly.
  osmPlaces = osmPlaces.filter((p) => !isBoringResidentialBuilding(p.tags));

  const osmContext = formatOSMContext(osmPlaces, latitude, longitude);

  // @prompt-region discover
  const systemPrompt = `You are a hyper-local urban historian surfacing obscure, overlooked, and forgotten stories about specific streets, buildings, and spaces — the kind locals and architecture nerds know but tourists never find.

Given GPS coordinates, identify real places within roughly ${radiusFeet} feet (${searchRadius} m). Think small and specific.

CORE PHILOSOPHY: A discovery should change how someone perceives the visible world around them. The goal is not obscure trivia. The goal is to make the place feel layered, inhabited, and shaped by overlapping human lives across time. After hearing it, the user should be more likely to NOTICE something physically present right now — a slope in the street, a sealed doorway, an odd setback, a row of cornices, the absence of a building that used to stand here.

PRIORITIZE discoveries that:
- Explain something visible right now: street geometry, building features, odd layouts, reused spaces, neighbourhood boundaries, lingering physical traces, infrastructure with a present-day footprint.
- Connect a specific historical event to a specific visible location — not the neighbourhood, this corner.
- Reveal how ordinary people lived, worked, gathered, travelled, adapted, or survived in this exact place. Named figures are welcome but not required.
- Surface grounded local texture and neighbourhood memory — the kind of thing older residents still remember.
- Use restrained sensory imagery when it is earned and tied to this exact spot. Good: "this block used to smell like roasting coffee" / "people slept on rooftops here during summer heat waves" / "musicians spilled into the street after late-night sessions". Keep sensory detail concise and observational, never flowery, theatrical, or atmospheric for its own sake.
- Show continuity between past and present.

DEPRIORITIZE discoveries that:
- Are obscure but perceptually inert — buried tracks, hidden streams, sealed tunnels with NO visible or experiential trace today.
- Could apply equally to many neighbourhoods or cities.
- Lean primarily on celebrity adjacency ("X briefly lived here").
- Read like generic trivia or a Wikipedia summary.
- Use "hidden gem" framing or shame the reader for not already knowing.
- Overstate significance or feel detached from the physical place around the user.
- Require the user to hunt for a small, faded, or ambiguous visual detail — see PRECISION FLOOR below.

WEAK vs STRONG framing — apply this transformation aggressively:
- Weak: "There's a buried stream under this block." Strong: "This oddly sloped street follows the path of a buried stream that once flooded nearby basements."
- Weak: "A famous actor briefly lived here." Strong: "This building housed dozens of aspiring actors in the seventies, including a young [name], long before the neighbourhood became expensive."
A buried-thing or celebrity-adjacent fact only earns a slot when it is tied to a visible trace, lived experience, or present-day geography.

DIFFICULT HISTORY: Don't avoid labour struggles, crime, tragedy, disasters, displacement, political conflict, or corruption — these are part of the layered life of places. Treat them grounded and humane. No sensationalism, no trauma-tourism framing, no "dark secrets" tone.

LOCAL LORE: Semi-documented stories and neighbourhood memory are welcome IF uncertainty is framed honestly ("Older residents long claimed…", "According to neighbourhood accounts…") and the lore meaningfully contributes to the texture of the place. Never present speculation as confirmed fact.

PRECISION FLOOR — CRITICAL: Discoveries must not require the user to locate a fragile, small, faded, or hard-to-find visual object. Exclude the following as the primary discovery subject: ghost signs, faded painted wall advertisements, old painted building ads, vintage painted signage, faded commercial signage, faded wall ads. These are historically interesting but currently too fragile for the app — they require very precise visual positioning that walking-mode narration cannot reliably support, and they undermine user trust when spatial precision is already improving. This is not a permanent exclusion; they are a future category. WHAT TO KEEP: if a wall happens to carry a ghost sign but the building itself has a strong anchored story, surface the building story — do not lead with the sign. Always keep discoveries involving: official historical plaques or markers, carved stone building inscriptions, surviving original storefronts with a clear address and business history, visible architectural lettering that explains the building, building names in terra cotta or cast iron.

QUALITY OVER QUANTITY: A strong discovery with a plain summary is better than a weak discovery dressed up. Every place must anchor to one specific building, corner, wall, or doorway.

SPECIFICITY RULES — every fact must include at least one: specific year/decade, person's name, verifiable detail, or concrete event. BAD: "This building has a rich history." GOOD: "The Italianate cornice was added in 1887 when dry-goods merchant Samuel Hewitt converted the ground floor from a livery stable." Social history needs an address: BAD: "The Westies controlled Hell's Kitchen." GOOD: "596 10th Ave was the Westies' base — Jimmy Coonan ran the crew from this corner through the late 1970s."

COORDINATES: 5 decimal places (±1 m). Coordinates and address must agree. Never describe a multi-building phenomenon without picking one surviving example. NEVER write raw GPS coordinates (e.g. "39.96507, -75.17780") in any text field — not in summary, not in facts. The user is standing there; they don't need to read numbers. If you reference a location in text, use the street address or cross-street intersection.

INTERPRETIVE CATEGORIES — COORDINATE RULE: For places of category "waterway remnant", "buried waterway", "transportation remnant", or "subsurface": you MUST set confidence to "low". Do NOT invent a house-number address — use the nearest cross-street intersection only (e.g. "W 48th St & 9th Ave"). Place the pin at the center of the requested area, not at a specific building corner. Write summaries in area-relative language: "beneath this neighborhood", "runs under this block", "in this vicinity". Never claim a specific doorstep for a phenomenon that spans multiple blocks.

NAME–LOCATION COHERENCE — CRITICAL: The place's display name MUST NOT reference a street, avenue, or landmark the place is not actually on. NEVER use patterns like "X near 8th Avenue", "Y on Broadway", "Z at the Hudson piers" unless the place's coordinates are within ~100 m of that street/landmark. If you cannot place the entity on the named street within the search radius, either (a) rename it to use a feature it IS adjacent to, or (b) drop it entirely. This rule exists because narration reads the name aloud — a name claiming the wrong street produces a confusing experience for a user standing somewhere else. Generic descriptive names ("Unmarked Speakeasy Site", "Former Garment Loft") are preferable to a name that lies about location.

HONESTY: Flag uncertain claims ("Local lore holds…", "According to neighborhood accounts…"). Fewer verified places beats more invented ones.

OSM DATA: The user message includes nearby OpenStreetMap features. Use each named feature as a prompt — what non-obvious story lies beneath what OSM calls "commercial"? Do not re-describe the OSM data; surface the obscure layer underneath.

Respond in JSON:
{"location":"specific area name","places":[{"id":"kebab-case","name":"Real or historical name","category":"building|storefront|alley|corner|infrastructure|former site|architectural detail|park|church|residential|vault sidewalk|subsurface|waterway remnant|transportation remnant","yearBuilt":"1920s","tags":["3-5 tags: speakeasy, labor history, immigrant history, art deco, tenement, gang territory, political machine, vault sidewalk, buried waterway, etc."],"summary":"One vivid sentence — the most surprising detail.","facts":["Fact with year/name/detail","Second distinct fact"],"latitude":40.12345,"longitude":-73.12345,"address":"157 W 48th St or W 48th St & 8th Ave","confidence":"high|medium|low"}]}

Return ${placeCount} places. Quality beats quantity — 5 genuine discoveries beat 10 weak ones.`;
  // @end-prompt-region discover

  // Hard cap the main discovery call. Parallel phase (Overpass + brainstorm)
  // takes up to 8 s (brainstorm timeout). With the ~3 000-token system prompt,
  // gpt-4.1-mini needs ~15-25 s to generate 1 200-1 800 output tokens. 35 s
  // gives comfortable headroom; total worst-case is ~43 s, well within the
  // client's 70 s cap (discoverTimeout in WalkModeContext.tsx). Note: this
  // "full" (non-osmAnchor) branch is not currently reachable from the
  // shipped client, which always sends osmAnchor: true.
  const DISCOVER_LLM_TIMEOUT_MS = 35_000;
  const discoverAbort = new AbortController();
  // discoverAbort.signal can fire from either cause below — track which one
  // actually happened so the diagnostic log doesn't misattribute a client
  // disconnect as a server-side timeout.
  let discoverAbortCause: "timer" | "client-close" | undefined;
  const abortDiscover = (cause: "timer" | "client-close") => {
    if (!discoverAbort.signal.aborted) {
      discoverAbortCause = cause;
      discoverAbort.abort();
    }
  };
  const discoverTimer = setTimeout(
    () => abortDiscover("timer"),
    DISCOVER_LLM_TIMEOUT_MS,
  );
  // Cancel in-flight call immediately when the client navigates away.
  res.on("close", () => abortDiscover("client-close"));

  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    // @prompt-region discover
    response = await openai.chat.completions.create(
      {
        model: modelName,
        max_completion_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `I'm standing at exactly ${latitude}, ${longitude}. What obscure, overlooked, or forgotten history is within ${radiusFeet} feet of me right now?${osmContext}${brainstormContext ? `\n\n---\nPRE-RESEARCH (use this to surface deeper or more obscure facts — do not copy verbatim, but let it inform your selections):\n${brainstormContext}` : ""}`,
          },
        ],
        response_format: { type: "json_object" },
      },
      // @end-prompt-region discover
      { signal: discoverAbort.signal },
    );
  } catch (err: any) {
    if (discoverAbort.signal.aborted) {
      // The abort is most often triggered by the client closing the connection
      // (res.on("close")), so the socket may already be gone.  Only attempt a
      // response write when headers haven't been sent and the socket is still
      // open — otherwise we'd produce a write-after-close log noise.
      req.log.warn(
        {
          reqId: req.id,
          branch: "full",
          abortCause: discoverAbortCause,
          timeoutMs: DISCOVER_LLM_TIMEOUT_MS,
          radius: searchRadius,
          totalElapsedMs: Date.now() - requestStartTime,
          headersSent: res.headersSent,
        },
        "[discover] discoverAbort fired — returning 503 if possible",
      );
      if (!res.headersSent && res.socket?.writable) {
        res.status(503).json({
          error: "Discovery service temporarily unavailable. Please try again.",
        });
      }
      return;
    }
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    req.log.warn(
      {
        reqId: req.id,
        branch: "full",
        radius: searchRadius,
        totalElapsedMs: Date.now() - requestStartTime,
        status,
        errStatus: err?.status,
      },
      "[discover] LLM call failed (non-timeout) — returning error",
    );
    res.status(status).json({
      error: "Discovery service temporarily unavailable. Please try again.",
    });
    return;
  } finally {
    clearTimeout(discoverTimer);
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    res.status(500).json({ error: "Failed to generate discoveries" });
    return;
  }

  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    res.status(500).json({ error: "Failed to parse discovery results" });
    return;
  }

  if (data.places && Array.isArray(data.places)) {
    // Explore Mode: skip Nominatim on the critical path and verify in the
    // background so the next cache hit gets corrected coordinates.
    //
    // Walk Mode: run Nominatim synchronously now. The caller has consented to
    // the additional latency (raised client timeout) in exchange for coordinates
    // that are confirmed by an external source before any pin is rendered.
    data.places = await postProcessPlaces(
      data.places,
      latitude,
      longitude,
      searchRadius,
      {
        skipVerification: false,
      },
    );

    // In Overpass-fallback mode, places whose coordinates Nominatim couldn't
    // confirm (coordSource:"llm") were proactively blocked from narration by
    // verifyPlaceCoordinates. Clear that flag so they can auto-narrate when
    // the user walks within range — the hot-path ordinal check below will
    // still block any place whose numbered street doesn't match the user's
    // current block, providing a meaningful quality filter even without OSM.
    if (overpassFallbackMode) {
      for (const p of data.places) {
        if ((p as any).coordSource === "llm") {
          (p as any).autoNarrationBlocked = false;
        }
      }
    }

    // Classify each place's spatial trust level from signals already on the
    // object — no external calls, runs in O(n).
    classifyDiscovery(data.places);
    applyDiscoveryTier(data.places);
    // historicalForce is derived on every read (fresh + cached), same
    // pattern as discoveryTier above. Tag-attachment only; not consumed
    // anywhere yet.
    for (const p of data.places) {
      const hf = deriveHistoricalForce(p.osmTags ?? {});
      if (hf) p.historicalForce = hf;
    }

    // Second pass: downgrade any non-interpretive place whose name/summary
    // contains a specific street reference but has no verified coordinate
    // (coordSource=undefined). Prevents LLM-fabricated coordinates from
    // rendering as verified discoveries when they claim a precise location.
    applyLlmPrecisionFilter(data.places);

    // Hard-drop denied categories: ghost signs, buried waterways, subsurface
    // infrastructure, and all other INTERPRETIVE_OVERLAY places. Applies to
    // both Explore and Walk — prompt-only exclusions are insufficient.
    data.places = filterDeniedPlaces(data.places);

    // Spatial trust gate: drop any place that Nominatim could not confirm.
    // A missing coordSource means coordinates are pure LLM output and must
    // not reach the UI in either mode. Return fewer results rather than
    // inaccurate ones.
    const beforeCoord = data.places.length;
    data.places = data.places.filter((p: any) => p.coordSource !== undefined);
    if (beforeCoord !== data.places.length) {
      logger.info(
        {
          dropped: beforeCoord - data.places.length,
          kept: data.places.length,
          mode: walkMode ? "walk" : "explore",
          tile: `${snapGrid(latitude)},${snapGrid(longitude)}`,
        },
        "[production-filter] dropped unverifiable places — coordSource undefined",
      );
    }
    // Fetch Wikipedia photos in parallel for all places. Runs concurrently with
    // ratings enrichment (below) and races a wall-clock timeout so it never
    // materially slows down a response that's already taken time for LLM calls.
    await fetchPhotosForPlaces(data.places);

    // Hot-path coordinate plausibility check — zero external API calls.
    // Catches the LLM hallucination pattern: a place whose description is
    // drawn from a distant street (e.g. "36th Street Trolley") but whose
    // coordinates were placed near the user (either directly at the user's
    // GPS position or moved there by verifyPlaceCoordinates matching on an
    // address token rather than the place entity itself).
    //
    // Algorithm:
    //   1. Extract ordinal street numbers from the user's reverse-geocoded
    //      location string (addressHint) — e.g. "22nd St" → {"22nd"}.
    //   2. For each place within the search radius of the user, extract
    //      ordinal street numbers from its address + name.
    //   3. If the place references numbered streets that are ALL absent from
    //      the user's location hint, the coordinates are almost certainly
    //      hallucinated — flag autoNarrationBlocked immediately so the first
    //      response already carries the flag and the client can hide the pin.
    //
    // Previously this only checked places within 50 m. That gate was too tight:
    // verifyPlaceCoordinates can move a hallucinated pin up to searchRadius away
    // (by matching on an address token), placing it outside the 50 m window
    // and allowing it to bypass this check entirely.  The threshold is now
    // searchRadius so any place that could reach the narration queue is covered.
    //
    // Guard: only run when addressHint contains at least one ordinal (non-grid
    // areas like named avenues produce no ordinals, so comparisons are
    // meaningless and would produce false positives).
    if (effectiveAddressHint) {
      const ORDINAL_RX = /\b(\d{1,3}(?:st|nd|rd|th))\b/gi;
      const hintOrdinals = new Set(
        [...effectiveAddressHint.matchAll(ORDINAL_RX)].map((m) =>
          m[1].toLowerCase(),
        ),
      );
      if (hintOrdinals.size > 0) {
        for (const p of data.places) {
          if (p.autoNarrationBlocked) continue;
          const distToUser = haversineDistance(
            latitude,
            longitude,
            p.latitude,
            p.longitude,
          );
          if (distToUser > searchRadius) continue; // outside the narration search area
          const addrText = `${p.address ?? ""} ${p.name ?? ""}`;
          const placeOrdinals = [...addrText.matchAll(ORDINAL_RX)].map((m) =>
            m[1].toLowerCase(),
          );
          if (placeOrdinals.length === 0) continue; // no numbered streets
          const hasMatch = placeOrdinals.some((s) => hintOrdinals.has(s));
          if (!hasMatch) {
            p.autoNarrationBlocked = true;
            p.addressCoherence ??= {
              status: "mismatch",
              reason: `Hot-path: address "${p.address}" has numbered streets not present in user location "${effectiveAddressHint}"`,
              storedLat: p.latitude,
              storedLon: p.longitude,
            };
            logger.warn(
              {
                placeName: p.name,
                placeAddress: p.address,
                effectiveAddressHint,
                distToUser: Math.round(distToUser),
              },
              "[address-coherence] HOT-PATH: numbered-street mismatch — blocked from walk narration",
            );
          }
        }
      }
    }
  }

  // Cache zero-result responses for only 2 min so the user can retry after moving slightly.
  // Normal results get the full 15-min TTL.
  const isEmpty = !Array.isArray(data.places) || data.places.length === 0;
  if (isEmpty) {
    const SHORT_TTL_MS = 2 * 60 * 1000;
    llmCache.set(discoverCacheKey, {
      data,
      timestamp: Date.now() - (LLM_CACHE_TTL_MS - SHORT_TTL_MS),
    });
  } else {
    setLLMCache(discoverCacheKey, data);
  }

  // Always set location from the Nominatim reverse-geocode of the actual search
  // centre — never from the LLM's (potentially hallucinated) value.  We do NOT
  // store this in the discover cache so each response derives it freshly from
  // the revgeo-nbhd cache keyed to the actual coordinates.
  data.location = nbhdLabel.label;
  data.locationSrc = nbhdLabel.src;
  data.effectiveAddressHintSrc = effectiveAddressHintSrc;
  // Signal to the client that this response used the LLM path because
  // Overpass was unavailable. The client relaxes its candidateSource gate
  // so coordSource:"llm" places (real but unindexed in Nominatim) can
  // enter the Walk pool instead of being silently dropped.
  if (overpassFallbackMode) data.overpassFallback = true;
  // Generic commercial businesses (chains) are excluded from both Explore
  // and Walk Mode candidate pools/pins — confirmed product decision. The
  // cache (above) retains the full classified set; this runs on the way
  // out only.
  // Rubric: artifacts/urban-explorer/docs/discovery-ranking-rubric.md — "Suppress from auto-surface".
  const rawPlacesCount = data.places.length;
  const genericFilteredPlaces = filterGenericCommercial(data.places);
  if (walkMode) {
    res.json({ ...data, places: genericFilteredPlaces });
  } else {
    // Tier-4 (metadata-only) suppression remains Explore-only. Walk Mode
    // handles T4 suppression in walkEligibility.ts ("lowQuality") —
    // narration-eligibility only; pins remain visible.
    const explorePlaces = filterExploreTier4(genericFilteredPlaces);
    const emptyReason = computeEmptyReason(
      rawPlacesCount,
      explorePlaces.length,
    );
    res.json({
      ...data,
      places: explorePlaces,
      ...(emptyReason ? { emptyReason } : {}),
    });
  }
});

router.post("/explore/suggest-locations", async (req, res) => {
  const parsed = SuggestLocationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { query, nearLocation } = parsed.data;

  if (query.trim().length < 2) {
    res.json({ suggestions: [] });
    return;
  }

  const nearTrimmed = (nearLocation ?? "").trim().slice(0, 200);
  const suggestCacheKey = `suggest:v12:${query.trim().toLowerCase()}|near:${nearTrimmed.toLowerCase()}`;
  const cachedSuggest = getLLMCache(suggestCacheKey);
  if (cachedSuggest) {
    res.json(cachedSuggest);
    return;
  }

  // Try Nominatim first — it returns real coordinates we can embed in the suggestion,
  // so walk-plan can skip the separate geocode round-trip when the user picks one.
  // When nearLocation is provided, geocode it to get coordinates and bias Nominatim
  // results using a viewbox + bounded=1 so that queries like "53rd and 6th" without
  // an explicit city name still return local results rather than random global ones.
  // Fallback: free-text query with nearLocation appended (original behaviour).
  const shouldTryNominatim =
    nearTrimmed.length > 0 || query.trim().length >= 15;

  let nominatimResults: NominatimResult[] = [];
  if (shouldTryNominatim) {
    if (nearTrimmed.length > 0) {
      const nearCoords = await geocodeNearLocation(nearTrimmed);
      if (nearCoords) {
        // Build a viewbox ~0.15 degrees (~17 km) around the near-location coordinates.
        const delta = 0.15;
        const viewbox = [
          nearCoords.lon - delta,
          nearCoords.lat + delta,
          nearCoords.lon + delta,
          nearCoords.lat - delta,
        ].join(",");
        nominatimResults = await nominatimSearch(query, 5, {
          viewbox,
          bounded: "1",
        });
        // If viewbox search yields nothing useful, fall back to free-text with city context.
        if (nominatimResults.length === 0) {
          nominatimResults = await nominatimSearch(
            `${query}, ${nearTrimmed}`,
            5,
          );
        }
      } else {
        nominatimResults = await nominatimSearch(`${query}, ${nearTrimmed}`, 5);
      }
    } else {
      nominatimResults = await nominatimSearch(query, 5);
    }
  }

  const nominatimSuggestions = nominatimResults.map((r) => ({
    name: formatNominatimDisplayName(r.display_name),
    description: nominatimTypeLabel(r),
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
  }));

  if (nominatimSuggestions.length >= 2) {
    const data = { suggestions: nominatimSuggestions };
    setLLMCache(suggestCacheKey, data);
    res.json(data);
    return;
  }

  // LLM fallback (no coordinates) when Nominatim returns < 2 results.
  const nearClause = nearTrimmed
    ? `\n\nIMPORTANT — LOCATION CONTEXT: The user has already entered another address: "${nearTrimmed}". Strongly prefer suggestions in the SAME city / metropolitan area as that address, unless the user's query explicitly references a different city or country. Walking routes only make sense within one city.`
    : "";

  let llmData: any = { suggestions: [] };
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are a location autocomplete assistant. Given a partial location query, suggest 5 real places that match. Prioritize:
- Neighborhoods and districts known for interesting history or architecture
- Historic intersections or streets
- Cities and towns with rich urban exploration potential

Respond in JSON format:
{
  "suggestions": [
    { "name": "Greenwich Village, New York", "description": "Historic bohemian neighborhood in Manhattan" },
    { "name": "Greenpoint, Brooklyn", "description": "Polish-American neighborhood with industrial heritage" }
  ]
}

Return exactly 5 suggestions. Each name should be specific enough to geocode. Keep descriptions under 10 words.${nearClause}`,
        },
        {
          role: "user",
          content: nearTrimmed
            ? `Suggest locations matching: "${query}" — context: near "${nearTrimmed}"`
            : `Suggest locations matching: "${query}"`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      try {
        llmData = JSON.parse(content);
      } catch {
        // keep existing llmData with any nominatim results
      }
    }
  } catch {
    // fall through with any nominatim results already collected
  }

  const merged = [
    ...nominatimSuggestions,
    ...(Array.isArray(llmData?.suggestions) ? llmData.suggestions : []).slice(
      0,
      5 - nominatimSuggestions.length,
    ),
  ];
  const result = { suggestions: merged };
  setLLMCache(suggestCacheKey, result);
  res.json(result);
});

router.post("/explore/geocode", async (req, res) => {
  const parsed = GeocodeLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { query } = parsed.data;

  const geocodeCacheKey = `geocode:v4:${query.trim().toLowerCase()}`;
  const cachedGeocode = getLLMCache(geocodeCacheKey);
  if (cachedGeocode) {
    res.json(cachedGeocode);
    return;
  }

  // Nominatim first — more reliable than LLM for real addresses/intersections.
  const nominatimResults = await nominatimSearch(query.trim(), 1);
  if (nominatimResults.length > 0) {
    const r = nominatimResults[0];
    const data = {
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      displayName: formatNominatimDisplayName(r.display_name),
    };
    setLLMCache(geocodeCacheKey, data);
    res.json(data);
    return;
  }

  // LLM fallback — handles ambiguous or obscure queries Nominatim can't resolve.
  let data: any;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      max_completion_tokens: 256,
      messages: [
        {
          role: "system",
          content: `You are a geocoding assistant. Given a location name (city, neighborhood, intersection, address, or landmark), return its approximate latitude and longitude coordinates and a clean display name.

Respond in JSON format:
{
  "latitude": number,
  "longitude": number,
  "displayName": "Clean, readable location name (e.g., 'Greenwich Village, New York' or 'Shibuya, Tokyo')"
}

Be as accurate as possible with coordinates. For neighborhoods, use the center point. For intersections, use the exact intersection coordinates.`,
        },
        {
          role: "user",
          content: `Geocode this location: "${query}"`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "Failed to geocode location" });
      return;
    }
    try {
      data = JSON.parse(content);
    } catch {
      res.status(500).json({ error: "Failed to parse geocode results" });
      return;
    }
  } catch (err: any) {
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    res.status(status).json({
      error: "Geocoding service temporarily unavailable. Please try again.",
    });
    return;
  }

  setLLMCache(geocodeCacheKey, data);
  res.json(data);
});

router.post("/explore/reverse-geocode", async (req, res) => {
  const { latitude, longitude } = req.body;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    res.status(400).json({ error: "latitude and longitude are required" });
    return;
  }
  if (latitude < -90 || latitude > 90) {
    res.status(400).json({ error: "latitude must be between -90 and 90" });
    return;
  }
  if (longitude < -180 || longitude > 180) {
    res.status(400).json({ error: "longitude must be between -180 and 180" });
    return;
  }

  const cacheKey = `revgeo:v12:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const cached = getLLMCache(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
      signal: controller.signal,
      headers: NOMINATIM_HEADERS,
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error("Nominatim error");
    const data = (await resp.json()) as Record<string, any>;
    const addr = data.address || {};
    const parts: string[] = [];
    if (addr.house_number && addr.road) {
      parts.push(`${addr.house_number} ${addr.road}`);
    } else if (addr.road) {
      parts.push(addr.road);
    } else {
      parts.push((data.display_name || "").split(",")[0].trim());
    }
    const neighborhood =
      addr.neighbourhood || addr.suburb || addr.city_district || addr.quarter;
    if (neighborhood) parts.push(neighborhood);
    const displayName = parts.filter(Boolean).join(", ");
    const result = { displayName: displayName || data.display_name };
    setLLMCache(cacheKey, result);
    res.json(result);
  } catch {
    clearTimeout(timer);
    res.status(503).json({ error: "Reverse geocode temporarily unavailable" });
  }
});

router.post("/explore/investigate-address", async (req, res) => {
  const parsed = InvestigateAddressBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const {
    address,
    latitude: providedLat,
    longitude: providedLng,
  } = parsed.data;
  const trimmedAddress = address.trim();

  // Geocode if no coords supplied. Use Nominatim — authoritative for real addresses.
  let lat = providedLat;
  let lng = providedLng;
  let canonicalAddress = trimmedAddress;
  if (typeof lat !== "number" || typeof lng !== "number") {
    // Use the shared Nominatim slot scheduler so this request respects the
    // global 1 req/sec rate limit alongside any concurrent discover or
    // verifyPlaceCoordinates calls.
    //
    // Guard with inFlightGeocode so concurrent requests for the same address
    // share a single pending Nominatim call instead of each issuing their own.
    const geocodeCacheKey = `geocode:v4:${trimmedAddress.toLowerCase()}`;
    let results: NominatimResult[];
    try {
      const cachedGeocode = getLLMCache<NominatimResult[]>(geocodeCacheKey);
      if (cachedGeocode) {
        results = cachedGeocode;
      } else {
        const existingGeocodeFlight = inFlightGeocode.get(geocodeCacheKey);
        if (existingGeocodeFlight) {
          results = await existingGeocodeFlight;
        } else {
          const geocodePromise = scheduleNominatimCall(() =>
            nominatimSearch(trimmedAddress, 1, { addressdetails: "1" }),
          );
          inFlightGeocode.set(geocodeCacheKey, geocodePromise);
          geocodePromise.finally(() => inFlightGeocode.delete(geocodeCacheKey));
          results = await geocodePromise;
          if (results.length > 0) {
            setLLMCache(geocodeCacheKey, results);
          }
        }
      }
    } catch {
      res.status(503).json({
        error: "Address lookup temporarily unavailable. Please try again.",
      });
      return;
    }
    if (results.length === 0) {
      // Attempt a broader fuzzy search to surface 1-2 nearby-landmark suggestions
      // so the user has concrete alternatives to try instead of a bare error.
      const suggestionCacheKey = `suggest404:v5:${trimmedAddress.toLowerCase()}`;
      const cachedSuggestions = getLLMCache<string[]>(suggestionCacheKey);
      let suggestions: string[] = cachedSuggestions ?? [];
      if (!cachedSuggestions) {
        const existingSuggestionFlight =
          inFlightSuggestion.get(suggestionCacheKey);
        if (existingSuggestionFlight) {
          try {
            suggestions = await existingSuggestionFlight;
          } catch {
            // Fuzzy search is best-effort; proceed without suggestions.
          }
        } else {
          const suggestionPromise = (async () => {
            // Strip leading house number to broaden the query (e.g. "123 Main St, NYC" → "Main St, NYC").
            const strippedQuery = trimmedAddress.replace(/^\d+\s+/, "");
            const fuzzyQuery =
              strippedQuery.length >= 3 && strippedQuery !== trimmedAddress
                ? strippedQuery
                : trimmedAddress;
            const fuzzyResults = await scheduleNominatimCall(() =>
              nominatimSearch(fuzzyQuery, 3),
            );
            const resolved = fuzzyResults
              .slice(0, 2)
              .map((r) => formatNominatimDisplayName(r.display_name))
              .filter(Boolean);
            setLLMCache(suggestionCacheKey, resolved);
            return resolved;
          })();
          inFlightSuggestion.set(suggestionCacheKey, suggestionPromise);
          suggestionPromise.finally(() =>
            inFlightSuggestion.delete(suggestionCacheKey),
          );
          try {
            suggestions = await suggestionPromise;
          } catch {
            // Fuzzy search is best-effort; proceed without suggestions.
          }
        }
      }
      res.status(404).json({
        error:
          "Couldn't find that address. Try including a city or zip (e.g., '538 W 38th St, New York, NY').",
        suggestions,
      });
      return;
    }
    const r = results[0];
    lat = parseFloat(r.lat);
    lng = parseFloat(r.lon);
    canonicalAddress =
      formatNominatimDisplayName(r.display_name) || trimmedAddress;
  }

  // Cache key: normalized address + coord bucket. Investigations are deterministic
  // per-building so a longer TTL is fine; share the LLM cache.
  const investigateCacheKey = `investigate:v7:${trimmedAddress.toLowerCase()}:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = getLLMCache(investigateCacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  // Pull a small ring of nearby OSM landmarks for neighborhood context.
  // Keep the radius tight (120m) so the AI doesn't drift to famous landmarks
  // a few blocks away — the whole point is to focus on THIS building.
  //
  // Before calling Overpass, check the coordinate-bucket suggestions cache
  // (osmSuggestionsCache, 30-min TTL). A prior investigate request at the same
  // location will have already populated it, so if the LLM cache expires and
  // the same empty-result address is searched again we can skip the Overpass
  // call entirely and reuse the cached OSMPlace[] for both osmContext and
  // suggestion derivation.
  let osmContext = "";
  // Distinguish cache miss (null) from a cached empty array so we don't issue
  // a fresh Overpass call when a previous probe for this coordinate bucket
  // already confirmed there are no nearby OSM landmarks.
  const cachedOSMPlaces = getCachedOSMPlaces(lat, lng);
  let nearbyOSMPlaces: OSMPlace[];
  if (cachedOSMPlaces !== null) {
    // Cache hit — use stored places (may be an empty array for landmark-free areas).
    nearbyOSMPlaces = cachedOSMPlaces;
  } else {
    // Cache miss — query Overpass. Only persist the result when the fetch
    // succeeds (including a genuine empty result) so transient Overpass errors
    // don't negative-cache the bucket for 30 minutes and suppress suggestions
    // during upstream outages.
    nearbyOSMPlaces = [];
    let osmFetchSucceeded = false;
    try {
      const osmFetchResult = await fetchNearbyOSMPlaces(lat, lng, 120);
      if (osmFetchResult !== null) {
        nearbyOSMPlaces = osmFetchResult;
        osmFetchSucceeded = true;
      }
    } catch {
      // Non-fatal — proceed without OSM context.
    }
    if (osmFetchSucceeded) {
      setCachedOSMPlaces(lat, lng, nearbyOSMPlaces);
    }
  }
  if (nearbyOSMPlaces.length > 0) {
    osmContext = nearbyOSMPlaces
      .slice(0, 8)
      .map((p) => {
        const dist = Math.round(haversineDistance(lat, lng, p.lat, p.lon));
        const built = p.tags["start_date"] || p.tags["construction_date"] || "";
        return `- ${p.name} (${p.type}${built ? `, built ${built}` : ""}, ${dist}m away)`;
      })
      .join("\n");
  }

  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 2400,
      messages: [
        {
          role: "system",
          content: `You are a meticulous urban historian investigating ONE SPECIFIC building at the user's request. The user is standing in front of this building and wants to know its story.

CRITICAL RULES — these override everything else:
1. FOCUS ON THE EXACT ADDRESS PROVIDED. Do NOT drift to famous landmarks nearby. Do NOT substitute a more famous building from a few blocks away. If the user asks about 538 W 38th St, your answer is about 538 W 38th St — not the Javits Center, not Hudson Yards, not the Lincoln Tunnel.
2. PRIORITIZE PHYSICAL EVIDENCE the user could verify by looking: brick patterns, ghost signs, segmental arch windows, corbeled cornices, loading bay openings, hayloft doors, horse-stall ventilation, original signage, etc. Tell them what to LOOK FOR.
3. Use neighborhood and era to reason about likely original use. A wide ground-floor opening with a hayloft door above on a side street between 10th and 11th in the 1880s-1890s = almost certainly a livery stable. Be confident about TYPE inferences from physical/contextual evidence; be cautious about specific NAMES, OWNERS, and DATES.
4. If the building is currently a livery stable for Central Park horses, NYC carriage horse stables, or similar working horse facility, MENTION THAT — it's a continuity worth highlighting.

HONESTY RULES — follow these strictly, without exception:
1. DOCUMENTED HISTORY: If something is a matter of historical record, state it directly and specifically.
2. LOCAL LORE / ORAL TRADITION: If something is neighborhood folklore, an oral account, or local tradition rather than documented record, you MUST frame it explicitly every time: "Local lore holds...", "Neighborhood accounts suggest...", "Oral tradition in this area says...", "Old-timers in the neighborhood recall...", "Community memory has it that...", etc. Never present oral tradition as fact.
3. ARCHITECTURAL INFERENCE: You may describe architectural features that are physically observable and note what era or style they suggest, but frame it as inference: "The corbeled brickwork suggests...", "This appears to date from...", "The facade is consistent with..."
4. OMIT rather than invent: If you do not have reliable knowledge about this specific address, say so in the "uncertainty" field or omit the detail. NEVER fill gaps with plausible-sounding invented content — no invented names, dates, owners, or architectural movements. A shorter honest response is always better than a longer fabricated one.

ARCHITECTURAL STYLE RULE:
Only populate architecturalStyle if the location is a permanent physical structure with genuine, observable architectural character — a building, bridge, monument, or similar. For vacant lots, parking structures with no architectural distinction, temporary spaces, open land, or any non-permanent or non-architectural location, return an empty string for architecturalStyle.

Respond in JSON:
{
  "buildingName": "Common name if known, else empty string",
  "yearBuilt": "Year/era like '1887' or 'late 1880s', or empty string if unknown",
  "architecturalStyle": "For permanent structures only: specific observable details and what they reveal about the era or intent (e.g., 'Romanesque Revival brick — segmental-arch windows, corbeled cornice, wide ground-floor stable doorway'). Return empty string for vacant lots, non-buildings, or locations without distinct architectural character.",
  "originalUse": "What it was originally built for (1-2 sentences, evidence-based). Frame any speculation explicitly.",
  "currentUse": "What it appears to be today (1 sentence)",
  "history": "2-3 paragraph narrative about THIS specific building. Lead with documented history where it exists. Use explicit lore-framing language for any unverified neighborhood accounts (see HONESTY RULES). If documented history for this specific address is sparse, say so plainly — then share what IS known about the broader block, neighborhood, or era. Do not invent specifics to fill gaps.",
  "facts": ["4-6 specific facts. Each fact is either documented (state directly) or labeled as lore/inference ('reportedly', 'local accounts say', 'the facade suggests'). Each should be something the user could verify or look for."],
  "neighborhoodContext": "How this building fits into the historical fabric of THIS block (1-2 sentences)",
  "uncertainty": "Honest disclosure of what's unknown vs documented. Empty string only if you have high confidence in everything stated."
}

NEVER invent: names, dates, architectural movements, organizations, or events that you cannot support with documented history or explicitly labeled lore. Presenting speculation as fact is always worse than acknowledging uncertainty.`,
        },
        {
          role: "user",
          content: `Investigate this specific building for a curious pedestrian standing in front of it.

ADDRESS: ${canonicalAddress}
COORDINATES: ${lat.toFixed(6)}, ${lng.toFixed(6)}

${osmContext ? `Nearby landmarks for neighborhood context (do NOT make these the focus of your answer):\n${osmContext}\n` : "No named landmarks within 120m — this is likely a vernacular/non-landmark building, so focus extra hard on architectural and contextual reasoning.\n"}
What is this building? What was it originally? What should I look at?`,
        },
      ],
      response_format: { type: "json_object" },
    });
  } catch (err: any) {
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    res.status(status).json({
      error: "Investigation service temporarily unavailable. Please try again.",
    });
    return;
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    res.status(500).json({ error: "Failed to generate investigation" });
    return;
  }

  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    res.status(500).json({ error: "Failed to parse investigation results" });
    return;
  }

  const facts = Array.isArray(data.facts)
    ? data.facts.filter((f: unknown) => typeof f === "string")
    : [];
  const buildingName =
    typeof data.buildingName === "string" ? data.buildingName : "";
  const history = typeof data.history === "string" ? data.history : "";

  // Derive 1-2 search suggestions from nearby OSM places when the result is
  // empty — i.e. the LLM couldn't find meaningful information about the address.
  // Suggestions are the closest named landmarks the user could search for instead.
  //
  // nearbyOSMPlaces is already populated from either the suggestions cache or a
  // fresh Overpass fetch (see above), so no further cache lookup is needed here.
  const isEmptyResult = !buildingName && !history && facts.length === 0;
  let searchSuggestions: string[] = [];
  if (isEmptyResult && nearbyOSMPlaces.length > 0) {
    searchSuggestions = nearbyOSMPlaces
      .map((p) => ({
        name: p.name,
        dist: haversineDistance(lat, lng, p.lat, p.lon),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
      .map((p) => p.name);
  }

  const result = {
    address: canonicalAddress,
    latitude: lat,
    longitude: lng,
    buildingName,
    yearBuilt: typeof data.yearBuilt === "string" ? data.yearBuilt : "",
    architecturalStyle:
      typeof data.architecturalStyle === "string"
        ? data.architecturalStyle
        : "",
    originalUse: typeof data.originalUse === "string" ? data.originalUse : "",
    currentUse: typeof data.currentUse === "string" ? data.currentUse : "",
    history,
    facts,
    neighborhoodContext:
      typeof data.neighborhoodContext === "string"
        ? data.neighborhoodContext
        : "",
    uncertainty: typeof data.uncertainty === "string" ? data.uncertainty : "",
    searchSuggestions,
  };

  setLLMCache(investigateCacheKey, result);
  res.json(result);
});

/**
 * Build the user-turn content for /explore/place-detail.
 *
 * When the request carries OSM trust metadata (collected during discover),
 * a verified OSM data block is appended so the model can ground its response
 * in confirmed tag data rather than relying solely on training memory.
 *
 * Anti-hallucination rules are NOT relaxed: the block is labelled as the
 * *only* confirmed source for factual claims. Wikidata/Wikipedia tags are
 * treated as source pointers only — the model must not claim to have fetched
 * article or entity content.
 */
export function buildDetailUserTurn(
  placeName: string,
  category: string | undefined,
  latitude: number,
  longitude: number,
  trustLevel?: string,
  osmTags?: Record<string, string>,
  wikipediaSummary?: WikipediaSummary,
): string {
  const base = `Tell me everything interesting about "${placeName}" — category: ${category || "place"} — located in this area of ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;

  const wikiBlock = wikipediaSummary
    ? `\n\n${buildWikiPromptBlock(wikipediaSummary)}`
    : "";

  if (!trustLevel || !osmTags || Object.keys(osmTags).length === 0) {
    return wikiBlock ? `${base}${wikiBlock}` : base;
  }

  const tagLines = Object.entries(osmTags)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  if (trustLevel === "osm_enriched") {
    const osmSection = `VERIFIED SOURCE TAGS (from OpenStreetMap — use as factual anchors for documented history):\n${tagLines}`;
    if (wikiBlock) {
      // Wikipedia content was actually fetched — drop the source-pointer warning
      // (which exists to prevent the LLM from *claiming* it fetched content it
      // didn't). Here it genuinely did, so the warning would be misleading.
      return `${base}\n\n${osmSection}${wikiBlock}`;
    }
    const hasPointer = osmTags.wikidata || osmTags.wikipedia;
    const pointerNote = hasPointer
      ? `\n\nSOURCE POINTER NOTE: The wikidata and/or wikipedia values above are external record identifiers — they confirm a documented source exists for this place. Do NOT claim to have read the Wikipedia article or fetched Wikidata content. You may note that a Wikipedia or Wikidata record exists if directly relevant, but do not describe content from those sources as if you retrieved it.`
      : "";
    return `${base}\n\n${osmSection}${pointerNote}`;
  }

  if (trustLevel === "osm_standard") {
    return (
      `${base}\n\nVERIFIED TAG DATA (from OpenStreetMap — use only these confirmed facts):\n${tagLines}\n\n` +
      `Do NOT invent founding dates, architectural styles, historical roles, or community claims beyond what these tags explicitly state. If start_date is absent from this block, omit any date or founding-year claim entirely.` +
      wikiBlock
    );
  }

  return `${base}${wikiBlock}`;
}

router.post("/explore/place-detail", async (req, res) => {
  const parsed = GetPlaceDetailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { placeName, latitude, longitude, category, trustLevel, osmTags } =
    parsed.data;

  const detailController = new AbortController();
  const detailTimeout = setTimeout(() => detailController.abort(), 20_000);
  res.on("close", () => detailController.abort());

  // detail:v9: invalidates entries cached before Wikipedia summary enrichment was added.
  const detailCacheKey = `detail:v9:${placeName.toLowerCase()}:${(category || "place").toLowerCase()}:${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cachedDetail = getLLMCache(detailCacheKey);
  if (cachedDetail) {
    clearTimeout(detailTimeout);
    res.json(cachedDetail);
    return;
  }

  // Coalesce concurrent requests for the same key onto a single LLM call.
  const existingDetailFlight = inFlightDetail.get(detailCacheKey);
  if (existingDetailFlight) {
    clearTimeout(detailTimeout);
    try {
      const data = await existingDetailFlight;
      if (!res.headersSent) res.json(data);
    } catch {
      if (!res.headersSent && res.socket?.writable)
        res.status(503).json({
          error:
            "Place detail service temporarily unavailable. Please try again.",
        });
    }
    return;
  }

  // Build the full detail object in a single sharable promise so that any
  // concurrent miss for the same key waits on this one call instead of
  // making a duplicate request.
  const buildDetail = async (): Promise<any> => {
    // Fetch Wikipedia summary before the LLM call so it can be injected into
    // the prompt. Only follows an explicit OSM wikipedia tag — never guesses
    // an article title from placeName.
    let wikiSummary: WikipediaSummary | undefined;
    if (osmTags?.wikipedia) {
      const parsed = parseWikipediaOsmTag(osmTags.wikipedia);
      if (parsed) {
        const result = await fetchWikipediaSummary(
          parsed.lang,
          parsed.title,
          detailController.signal,
        );
        wikiSummary = result ?? undefined;
      }
    }

    const response = await openai.chat.completions.create(
      {
        model: "gpt-4.1-mini",
        max_completion_tokens: 2048,
        messages: [
          {
            role: "system",
            content: `You are a hyper-local urban historian. Your role is to share real, grounded knowledge about places — and to be scrupulously honest when that knowledge is limited.

HARD FORMATTING RULES — these apply to every text field, no exceptions:
- NEVER write raw GPS coordinates (e.g. "39.96533, -75.17239") in any field. The user is standing there; they don't need coordinates.
- NEVER write AI-meta phrases like "at the given coordinates", "around these coordinates", "at this location's coordinates", or similar. Write about the place, not about coordinate data.
- NEVER write "there is no widely documented historical record", "no documented history exists for", "little is known about this specific", or similar disclaimers about your knowledge limits in the main text fields. If documented history is sparse, OMIT — then pivot directly to what IS known about the block, building type, or era. Spare the user the AI's self-narration.

HONESTY RULES — follow these strictly, without exception:
1. DOCUMENTED HISTORY: If something is a matter of historical record, state it directly and specifically.
2. LOCAL LORE / ORAL TRADITION: If something is neighborhood folklore, an oral account, or local tradition rather than documented record, you MUST frame it explicitly every time: "Local lore holds...", "Neighborhood accounts suggest...", "Oral tradition in this area says...", "Old-timers in the neighborhood recall...", "Community memory has it that...", etc. Never present oral tradition as fact.
3. ARCHITECTURAL INFERENCE: You may describe architectural features that are physically observable and note what era or style they suggest, but frame it as inference: "The corbeled brickwork suggests...", "This appears to date from...", "The facade is consistent with..."
4. OMIT rather than pad: If you do not have reliable knowledge about this specific place, write shorter — don't pad with neighborhood-wide generalities ("known for its rich architectural heritage", "a hub for small family-owned storefronts") that could apply to any block in any city. Every sentence must be anchored to THIS address, this building type, or a named person or event connected to this spot.

CURRENT USE: Note that a business or use named in the request may no longer be operating. Focus on what the building's history reveals — not on praising a current tenant that may have closed. If current use is uncertain, say "current use unknown" rather than describing a potentially defunct business.

ARCHITECTURAL STYLE RULE:
Only populate architecturalStyle if the place is a permanent physical structure with genuine, observable architectural character — a building, bridge, monument, or similar. For markets, parks, outdoor venues, vacant lots, temporary spaces, institutions without a distinct permanent building, event spaces, or any non-architectural place, return an empty string for architecturalStyle.

FUN FACTS RULE — strict:
Each fact in funFacts must be SPECIFIC to this address — it must contain at least one of: a person's name, a specific year or decade, a verifiable event, or a concrete detail about this building or corner that a visitor could look up or look for. Generic observations about naming conventions ("places with 'Philly' in their name celebrate Philly food culture"), neighborhood patterns ("this corridor has had small storefronts for decades"), or broad cultural commentary do NOT qualify as fun facts. If no specific fun facts exist for this place, return an empty array — do NOT pad with generalities.

Respond in JSON format:
{
  "name": "Place Name",
  "fullHistory": "2-3 paragraph narrative. Lead with documented history where it exists. Use explicit lore-framing language (see rules above) for any unverified neighborhood accounts or oral tradition. If documented history for this specific location is sparse, pivot directly to what IS known about the block, building type, or era — no disclaimers about knowledge limits. Do not invent specifics to fill gaps. No raw coordinates. No AI-meta phrases.",
  "architecturalStyle": "For permanent structures only: specific observable details and what they reveal about the era or intent. Return empty string for non-buildings, outdoor venues, markets, parks, institutions, etc.",
  "notableEvents": ["Documented event with year — or label as 'reportedly' / 'local accounts say' if unverified. Omit entirely if you have nothing grounded."],
  "funFacts": ["Specific verified fact or clearly labeled lore — must name a person, date, event, or verifiable detail unique to THIS address. Return empty array if none exist."],
  "nearbyRelated": [{"name": "Related Place Name", "latitude": 40.12345, "longitude": -73.12345, "category": "building"}]
}

NEVER invent: names, dates, architectural movements, organizations, or events that you cannot support with documented history or explicitly labeled lore. Presenting speculation as fact is always worse than acknowledging uncertainty.`,
          },
          {
            role: "user",
            content: buildDetailUserTurn(
              placeName,
              category,
              latitude,
              longitude,
              trustLevel,
              osmTags,
              wikiSummary,
            ),
          },
        ],
        response_format: { type: "json_object" },
      },
      { signal: detailController.signal },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("empty_content");

    let data: any;
    try {
      data = JSON.parse(content);
    } catch {
      throw new Error("parse_error");
    }

    // Safety filter: strip funFacts that slipped through the prompt guardrails.
    // These patterns are the most common LLM failure modes:
    //   1. Raw GPS coordinates written verbatim into a fact
    //   2. "Around these coordinates" / AI-meta location language
    //   3. Admission-of-ignorance phrases that belong in the uncertainty field
    //   4. Pure generic observations with no specific anchor (no year, name, or event)
    if (Array.isArray(data.funFacts)) {
      const COORD_RE = /-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/;
      const META_RE =
        /these coordinates|at the given coord|no widely documented|no documented hist|little is known about this specific|no historical record/i;
      const GENERIC_RE =
        /^(local lore holds that |community memory has it that |neighborhood accounts suggest that ).{0,120}$/i;
      const hasAnchor = (s: string) =>
        /\b(18|19|20)\d{2}\b/.test(s) || /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(s);
      data.funFacts = data.funFacts.filter((f: unknown) => {
        if (typeof f !== "string") return false;
        if (COORD_RE.test(f)) return false;
        if (META_RE.test(f)) return false;
        if (GENERIC_RE.test(f) && !hasAnchor(f)) return false;
        return true;
      });
    }
    // Strip raw coordinates from the fullHistory narrative as a safety net.
    if (typeof data.fullHistory === "string") {
      data.fullHistory = data.fullHistory
        .replace(/-?\d{1,3}\.\d{5,},\s*-?\d{1,3}\.\d{5,}/g, "this location")
        .replace(
          /\b(there is no widely documented|no documented historical record|little is known about this specific|no historical record specific to)[^.]*\.\s*/gi,
          "",
        )
        .trim();
    }

    // Lock anchor fields: always use the canonical request values, never the
    // LLM's version. The model can paraphrase or subtly rewrite names; the
    // client sent a verified OSM name that must not be altered.
    data.name = placeName;

    // Filter nearbyRelated to entries within 2 km of the request coordinates.
    // LLM-generated coordinates are unreliable and can land in a different
    // neighbourhood or city entirely.
    const MAX_NEARBY_DIST_M = 2000;
    if (Array.isArray(data.nearbyRelated)) {
      data.nearbyRelated = data.nearbyRelated.filter((r: unknown) => {
        if (
          typeof r !== "object" ||
          r === null ||
          typeof (r as Record<string, unknown>).latitude !== "number" ||
          typeof (r as Record<string, unknown>).longitude !== "number"
        )
          return false;
        const { latitude: rLat, longitude: rLng } = r as {
          latitude: number;
          longitude: number;
        };
        return (
          haversineDistance(latitude, longitude, rLat, rLng) <=
          MAX_NEARBY_DIST_M
        );
      });
    }

    const photoUrl = await fetchWikipediaPhoto(
      placeName,
      undefined,
      wikiSummary?.title,
      wikiSummary?.lang,
    );
    if (photoUrl) data.photoUrl = photoUrl;
    return data;
  };

  const detailPromise = buildDetail();
  inFlightDetail.set(detailCacheKey, detailPromise);
  detailPromise.finally(() => inFlightDetail.delete(detailCacheKey));

  let data: any;
  try {
    data = await detailPromise;
  } catch (err: any) {
    clearTimeout(detailTimeout);
    if (detailController.signal.aborted) {
      if (!res.headersSent && res.socket?.writable)
        res
          .status(504)
          .json({ error: "Place detail request timed out. Please try again." });
      return;
    }
    if (err?.message === "parse_error") {
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to parse place detail results" });
      return;
    }
    if (err?.message === "empty_content") {
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to generate place details" });
      return;
    }
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    if (!res.headersSent)
      res.status(status).json({
        error:
          "Place detail service temporarily unavailable. Please try again.",
      });
    return;
  }

  clearTimeout(detailTimeout);
  setLLMCache(detailCacheKey, data);
  res.json(data);
});

router.post("/explore/place-timeline", async (req, res) => {
  const parsed = GetPlaceTimelineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { placeName, latitude, longitude, category, yearBuilt } = parsed.data;
  const yearContext = yearBuilt ? ` It was built around ${yearBuilt}.` : "";

  // v2: versioned to bust cache entries generated before the honesty-rule prompt update (Task #270)
  const timelineCacheKey = `timeline:v2:${placeName.toLowerCase()}:${(category || "place").toLowerCase()}:${yearBuilt || ""}:${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cachedTimeline = getLLMCache(timelineCacheKey);
  if (cachedTimeline) {
    res.json(cachedTimeline);
    return;
  }

  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 3000,
      messages: [
        {
          role: "system",
          content: `You are a vivid urban historian who specializes in bringing places to life across different time periods. Given a place, create a chronological timeline showing how it transformed through history — what someone standing on this exact spot would have seen, heard, and experienced in each era.

HONESTY RULES — follow these strictly, without exception:
1. DOCUMENTED HISTORY: If something is a matter of historical record, state it directly and specifically.
2. LOCAL LORE / ORAL TRADITION: If something is neighborhood folklore, an oral account, or local tradition rather than documented record, you MUST frame it explicitly every time: "Local lore holds...", "Neighborhood accounts suggest...", "Oral tradition in this area says...", "Old-timers in the neighborhood recall...", "reportedly", "Community memory has it that...", etc. Never present oral tradition as fact.
3. ARCHITECTURAL INFERENCE: You may describe architectural features that are physically observable and note what era or style they suggest, but frame it as inference: "The building's proportions suggest...", "This appears to date from...", "The facade is consistent with..."
4. OMIT rather than invent: If you do not have reliable knowledge about a specific era or detail, say so briefly or omit it. NEVER fill gaps with plausible-sounding invented content — no invented names, dates, owners, organizations, or events. A shorter honest response is always better than a longer fabricated one.

For each era, paint a vivid picture using only what can be documented, inferred, or explicitly labeled as lore:
- What did the building/space physically look like? Materials, colors, signage, condition
- What was the street life like? Who walked past? What sounds and smells?
- What was the building being used for? By whom?
- What was the neighborhood context? Was it thriving, declining, transforming?

QUALITY RULES:
- Make each era feel cinematically different — the reader should sense the passage of time
- Don't repeat the same information across eras
- Start from the earliest relevant period (before the current structure if possible)
- End with the present day
- The "atmosphere" field should be sensory and evocative — but must not invent specific names, dates, or events; it can describe textures, sounds, light, and mood drawn from the documented or inferred era
- The "visualDescription" should be what a time-traveler would see looking at this exact spot, based on documented or architecturally-inferred evidence
- "keyFigures" must only include people with a documented or explicitly-labeled-as-lore connection to this specific place; omit this field or return an empty array if no such people are known

Respond in JSON format:
{
  "placeName": "Place Name",
  "eras": [
    {
      "period": "1850s-1870s",
      "title": "Short evocative era title (e.g., 'Before the Building', 'The Gilded Age', 'Wartime')",
      "description": "2-3 sentences describing what was happening here during this period. Documented facts stated directly; unverified accounts explicitly framed as lore or inference.",
      "visualDescription": "1-2 sentences describing exactly what you'd see standing here in this era. Architecture, signage, street activity, materials — based on documented or inferred evidence.",
      "keyFigures": ["Only include if there is a documented or explicitly-labeled-as-lore connection to this place. Omit or return [] if unknown."],
      "atmosphere": "One sensory, evocative sentence — what it felt like to be here. Evoke mood, texture, sound. Do not invent specific names, dates, or events."
    }
  ]
}

Create 4-6 eras spanning the full history. Each era should feel distinct and alive.

NEVER invent: names, dates, organizations, or events that you cannot support with documented history or explicitly labeled lore. Presenting speculation as fact is always worse than acknowledging uncertainty.`,
        },
        {
          role: "user",
          content: `Create a historical timeline for "${placeName}" (${category || "place"}) located near ${latitude}, ${longitude}.${yearContext} Show me how this exact spot transformed through time.`,
        },
      ],
      response_format: { type: "json_object" },
    });
  } catch (err: any) {
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    res.status(status).json({
      error: "Timeline service temporarily unavailable. Please try again.",
    });
    return;
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    res.status(500).json({ error: "Failed to generate timeline" });
    return;
  }

  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    res.status(500).json({ error: "Failed to parse timeline results" });
    return;
  }

  if (data.eras && Array.isArray(data.eras)) {
    data.eras = data.eras.filter(
      (era: any) =>
        era.period && era.title && era.description && era.atmosphere,
    );
  }

  const timelinePhotoUrl = await fetchWikipediaPhoto(placeName);
  if (timelinePhotoUrl) {
    data.photoUrl = timelinePhotoUrl;
  }
  setLLMCache(timelineCacheKey, data);
  res.json(data);
});

router.post("/explore/walk-narration", async (req, res) => {
  // Server-side timing boundary (design mirrors the /explore/discover
  // instrumentation): starts as close to true request receipt as this
  // handler allows, ends the moment a response is sent/return is taken on
  // every exit path below. This measures server processing time only — it
  // is deliberately independent of the client's own fetch-latency
  // measurement (see WalkModeContext.tsx's fetchStartedAt / DiagNarrationFetch
  // .durationMs), which can differ (e.g. client gives up before this
  // finishes, or vice versa). No shared request ID is threaded through to
  // the client-side breadcrumb here — the client has no way to learn this
  // request's req.id, and adding that plumbing would mean touching the
  // narration request/response contract, which is out of scope. The two
  // sides are correlated only loosely, by place name and rough time, same
  // as a human reading two separate log streams would.
  const requestStartTime = Date.now();
  const parsed = GetWalkNarrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { placeName, category, summary, facts, address, crossStreets } =
    parsed.data;

  // @prompt-region walk-narration
  const factsKeyPart = (facts || [])
    .map((f) => f.slice(0, 80).toLowerCase())
    .sort()
    .join("|");
  const narrationCacheKey = `narration:v20:${placeName.toLowerCase()}|${(category || "").toLowerCase()}|${summary.slice(0, 80).toLowerCase()}|${factsKeyPart}`;
  // @end-prompt-region walk-narration
  const cachedNarration = getLLMCache<{ narration: string }>(narrationCacheKey);
  if (cachedNarration) {
    req.log.info(
      {
        reqId: req.id,
        route: "walk-narration",
        outcome: "success",
        cacheHit: true,
        durationMs: Date.now() - requestStartTime,
      },
      "[walk-narration] served from cache",
    );
    res.json(cachedNarration);
    return;
  }

  // Coalesce concurrent requests for the same key onto a single LLM call.
  const existingNarrationFlight = inFlightNarration.get(narrationCacheKey);
  if (existingNarrationFlight) {
    try {
      const text = await existingNarrationFlight;
      req.log.info(
        {
          reqId: req.id,
          route: "walk-narration",
          outcome: "success",
          cacheHit: false,
          durationMs: Date.now() - requestStartTime,
        },
        "[walk-narration] coalesced onto in-flight LLM call — success",
      );
      res.json({ narration: text });
    } catch {
      req.log.warn(
        {
          reqId: req.id,
          route: "walk-narration",
          outcome: "failure",
          cacheHit: false,
          durationMs: Date.now() - requestStartTime,
        },
        "[walk-narration] coalesced onto in-flight LLM call — failure",
      );
      if (!res.headersSent && res.socket?.writable)
        res.status(503).json({
          error: "Narration service temporarily unavailable. Please try again.",
        });
    }
    return;
  }

  // @prompt-region walk-narration
  // Build the location context string for the user message. Priority:
  //   address (specific street number) > crossStreets (block context) > none.
  const locationContext = address
    ? ` Address: ${address}.`
    : crossStreets
      ? ` Nearby: ${crossStreets}.`
      : "";

  // Anchor-data block injected at the top of the system prompt so the model
  // cannot rewrite the place name or address in the spoken narration.
  const narrationAnchorBlock = [
    `VERIFIED ANCHOR DATA — these values are authoritative. Use them verbatim; do not alter, paraphrase, abbreviate, or "correct" them:`,
    `- Place name: "${placeName}"`,
    address ? `- Address: ${address}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const narrationPromise = openai.chat.completions
    .create({
      model: "gpt-4.1-nano",
      max_completion_tokens: 256,
      messages: [
        {
          role: "system",
          content: `${narrationAnchorBlock}

You are a knowledgeable, observant local — someone who has spent years paying close attention to this city and speaks plainly about what they know. You're not performing enthusiasm. Something caught your eye, and you're sharing it.

Your words will be read aloud by a text-to-speech engine. That means every word choice affects how natural it sounds.

How to write for speech:
- Target 2 to 3 sentences. Roughly 30 to 45 words total. Short is better.
- Write in fragments and incomplete thoughts the way people actually speak. "Built in the eighteen eighties. Went through three different owners before the city took it over." That rhythm is good.
- Use contractions always: it's, don't, they'd, you'll, wasn't, couldn't.
- Spell out every number, year, decade, ordinal, and acronym as words: "eighteen eighty-two" not "1882", "the nineteenth century" not "the 19th century", "the eighteen eighties" not "the 1880s", "the seventies" not "the 70s", "World War Two" not "World War II", "New York City" not "NYC", "the United States" not "the US", "three stories tall" not "3-story".
- No abbreviations, no acronyms, no symbols, no quotes, no parentheses, no dashes used as parentheses.
- Use a comma where you'd naturally pause for breath. A period where you'd stop completely. Nothing else for punctuation structure.
- MANDATORY FIRST CLAUSE — every narration MUST begin with a spatial anchor that orients the listener in physical space. This is non-negotiable: a narration that omits the spatial opener is wrong. Choose the strongest signal you have, in this priority order:
  1. If a specific street-number address is provided (e.g. "610 8th Ave"), open with it: "That's six-ten Eighth Avenue —" or "Right at six-ten Eighth Avenue —".
  2. If a nearby cross-street or block context is provided (e.g. "W 49th St, Hell's Kitchen"), open with a phrase tied to it: "Here on West Forty-ninth —" or "Just off Eighth, in Hell's Kitchen —".
  3. If only a broader area or landmark reference is provided, open with a directional phrase tied to it: "Just back from the piers —" or "Across from the park —".
  4. If nothing is provided, open with a generic spatial phrase: "Right at this corner —", "Just ahead on your left —", "The building across the street —". Never skip the opener.
  Spell out all numbers, directions, and abbreviations as full words: "West" not "W", "Street" not "St", "Avenue" not "Ave", "Northeast" not "NE", "forty-nine" not "49".
- After the location opener, surface the most place-specific thing you have. Prefer details that change how the listener sees what's physically around them right now — a visible architectural feature, an odd street layout, a reused space, a building's earlier use, something that happened on this exact block, a human moment older residents still remember. Vary the angle so consecutive narrations don't all share the same shape.
- Avoid generic trivia, celebrity-adjacent name-drops, and "hidden" facts with no visible or experiential trace today (buried tracks, sealed tunnels, underground streams) — unless you can tie them to something the listener can actually perceive: a slope in the street, a sunken basement, a missing block, a remaining wall.
- If the place is a ghost sign, faded painted wall advertisement, or similar fragile visual artifact, do NOT lead with the sign's appearance or ask the listener to find it. Lead instead with the building's or block's history. The app cannot currently give precise enough visual guidance for the listener to reliably locate a faded sign while walking. Anchor to the structure, not the fading paint.
- Restrained sensory imagery is welcome when earned and specific. "This block used to smell like roasting coffee." "People slept on the rooftops during summer heat waves." Keep it short and observational. Never flowery, theatrical, or atmospheric for its own sake.
- Never use exclamation points. Avoid rhetorical questions. Never say "hidden gem," "fascinating," "incredible," "amazing," or "you won't believe." Don't oversell what you're pointing at.
- When the history involves difficulty — displacement, labor, disaster, tragedy, crime — be candid and matter-of-fact. Give the people involved their dignity. Don't frame hard history as exotic or as dark tourism.
- End without a moral lesson, emotional coaching, or invitation to reflect. A specific fact, a small contrast, a human-scaled detail is enough. Let it land without commentary.
- If you're not certain of a detail, say "supposedly" or "according to local accounts" rather than stating it as fact.`,
        },
        {
          role: "user",
          content: `I'm walking past "${placeName}" (${category || "place"}).${locationContext} Here's what's interesting: ${summary}${(facts || []).length ? ` Also: ${(facts || []).join(" ")}` : ""}. Give me a brief, natural narration.`,
        },
      ],
    })
    // @end-prompt-region walk-narration
    .then((r) => {
      const text = r.choices[0]?.message?.content;
      if (!text) throw new Error("empty_content");
      return text.trim();
    });

  inFlightNarration.set(narrationCacheKey, narrationPromise);
  narrationPromise.finally(() => inFlightNarration.delete(narrationCacheKey));

  let narrationText: string;
  try {
    narrationText = await narrationPromise;
  } catch (err: any) {
    req.log.warn(
      {
        reqId: req.id,
        route: "walk-narration",
        outcome: "failure",
        cacheHit: false,
        durationMs: Date.now() - requestStartTime,
        errStatus: err?.status,
      },
      "[walk-narration] live LLM call failed",
    );
    if (err?.message === "empty_content") {
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to generate narration" });
      return;
    }
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    if (!res.headersSent)
      res.status(status).json({
        error: "Narration service temporarily unavailable. Please try again.",
      });
    return;
  }

  req.log.info(
    {
      reqId: req.id,
      route: "walk-narration",
      outcome: "success",
      cacheHit: false,
      durationMs: Date.now() - requestStartTime,
    },
    "[walk-narration] live LLM call succeeded",
  );
  const result = { narration: narrationText };
  setLLMCache(narrationCacheKey, result);
  res.json(result);
});

// --- Audio narration cache --------------------------------------------------
// Audio bytes can be 50-200 KB each; cap at ~50 entries (~10 MB) to bound RAM.
interface AudioCacheEntry {
  bytes: Buffer;
  timestamp: number;
}
const audioCache = new Map<string, AudioCacheEntry>();
// Maximum number of audio rows to keep in the DB. Each row is 30–200 KB of
// base64-encoded MP3, so 100 rows ≈ 5–20 MB. Rows are ranked by expires_at
// DESC (most-recently-written first) so the freshest entries are preserved.
// Configurable via the AUDIO_DB_MAX_ENTRIES environment variable (positive integer).
// Parsed and validated by the centralised config module at startup.
async function getAudioCache(key: string): Promise<Buffer | null> {
  const entry = audioCache.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp > AUDIO_CACHE_TTL_MS) {
      audioCache.delete(key);
      void deleteCacheEntry("audio", key);
    } else {
      return entry.bytes;
    }
  }
  // In-memory miss — check DB for persisted audio bytes that survived a restart.
  try {
    const rows = await db
      .select()
      .from(apiCache)
      .where(
        and(
          eq(apiCache.namespace, "audio"),
          eq(apiCache.cacheKey, key),
          gt(apiCache.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (rows.length > 0) {
      const row = rows[0]!;
      const base64 = (row.data as { bytes: string }).bytes;
      const bytes = Buffer.from(base64, "base64");
      const remainingMs = row.expiresAt.getTime() - Date.now();
      // Re-warm the in-memory cache so subsequent requests are instant.
      if (audioCache.size >= AUDIO_CACHE_MAX_SIZE) {
        const oldest = audioCache.keys().next().value;
        if (oldest) audioCache.delete(oldest);
      }
      audioCache.set(key, {
        bytes,
        timestamp: Date.now() - (AUDIO_CACHE_TTL_MS - remainingMs),
      });
      return bytes;
    }
  } catch (err) {
    logger.warn({ err, key }, "Failed to look up audio cache in DB");
  }
  return null;
}
function setAudioCache(key: string, bytes: Buffer): void {
  if (audioCache.size >= AUDIO_CACHE_MAX_SIZE) {
    const oldest = audioCache.keys().next().value;
    if (oldest) audioCache.delete(oldest);
  }
  audioCache.set(key, { bytes, timestamp: Date.now() });
  // Persist to DB so audio survives server restarts for the full TTL window.
  // After persisting, evict rows beyond the cap so large audio blobs don't
  // accumulate unboundedly in the database.
  void persistCacheEntry(
    "audio",
    key,
    { bytes: bytes.toString("base64") },
    AUDIO_CACHE_TTL_MS,
  ).then(() => evictExcessAudioDbEntries());
}

// POST /explore/walk-narration-audio — returns natural-voice MP3 audio for a place.
// Generates the same narration text as /walk-narration (and shares its cache),
// then runs it through OpenAI's gpt-audio TTS so the phone can play a real
// human-sounding voice instead of the iOS robotic system speech engine.
router.post("/explore/walk-narration-audio", async (req, res) => {
  // See the timing-boundary comment on /explore/walk-narration above — same
  // discipline applies here: server-only processing time, independent of
  // the client's own fetch-latency measurement, no shared request ID.
  const requestStartTime = Date.now();
  const parsed = GetWalkNarrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { placeName, category, summary, facts, address, crossStreets } =
    parsed.data;

  // Abort controller wired to the response close event so that any in-flight
  // audio conversion (e.g. ffmpeg via ensureCompatibleFormat) is cancelled
  // immediately if the client disconnects, preventing orphaned temp files.
  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  // Voice is configurable via query param so we can A/B test without redeploying.
  // Defaults to "nova" — warm, conversational, energetic. Other good options for
  // walking-tour narration: "shimmer" (calm female), "fable" (British storyteller).
  const requestedVoice =
    typeof req.query["voice"] === "string" ? req.query["voice"] : "nova";
  const allowedVoices = [
    "alloy",
    "echo",
    "fable",
    "onyx",
    "nova",
    "shimmer",
  ] as const;
  type Voice = (typeof allowedVoices)[number];
  const voice: Voice = (allowedVoices as readonly string[]).includes(
    requestedVoice,
  )
    ? (requestedVoice as Voice)
    : "nova";

  // Re-use the text narration cache so we don't double-generate text + audio.
  // @prompt-region walk-narration-audio
  const factsKeyPart = (facts || [])
    .map((f) => f.slice(0, 80).toLowerCase())
    .sort()
    .join("|");
  const narrationCacheKey = `narration:v20:${placeName.toLowerCase()}|${(category || "").toLowerCase()}|${summary.slice(0, 80).toLowerCase()}|${factsKeyPart}`;
  const audioCacheKey = `${narrationCacheKey}|voice:${voice}`;
  // @end-prompt-region walk-narration-audio

  const cachedAudio = await getAudioCache(audioCacheKey);
  if (cachedAudio) {
    req.log.info(
      {
        reqId: req.id,
        route: "walk-narration-audio",
        outcome: "success",
        cacheHit: true,
        durationMs: Date.now() - requestStartTime,
      },
      "[walk-narration-audio] served from audio cache",
    );
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=900");
    res.setHeader("X-Narration-Cache", "hit");
    res.send(cachedAudio);
    return;
  }

  // Step 1: get narration text (from cache if possible).
  // Pass the abort signal so the LLM call is cancelled immediately if the
  // client disconnects — avoiding wasted tokens on a response nobody will read.
  let narrationText: string;
  const cachedNarration = getLLMCache<{ narration: string }>(narrationCacheKey);
  if (cachedNarration) {
    narrationText = cachedNarration.narration;
  } else {
    // Coalesce concurrent LLM narration calls for the same key — shared with
    // the /walk-narration text endpoint via the same inFlightNarration map.
    const existingNarrationFlight = inFlightNarration.get(narrationCacheKey);
    if (existingNarrationFlight) {
      try {
        narrationText = await existingNarrationFlight;
      } catch (err: any) {
        req.log.warn(
          {
            reqId: req.id,
            route: "walk-narration-audio",
            outcome: abortController.signal.aborted ? "cancelled" : "failure",
            cacheHit: false,
            durationMs: Date.now() - requestStartTime,
          },
          "[walk-narration-audio] coalesced narration text call failed",
        );
        if (abortController.signal.aborted) return;
        const status =
          err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
        if (!res.headersSent)
          res.status(status).json({
            error:
              "Narration service temporarily unavailable. Please try again.",
          });
        return;
      }
    } else {
      // @prompt-region walk-narration-audio
      // Build the location context string — same priority as /walk-narration.
      const audioLocationContext = address
        ? ` Address: ${address}.`
        : crossStreets
          ? ` Nearby: ${crossStreets}.`
          : "";

      // Same anchor-data block as /walk-narration so the audio path also locks
      // the canonical name and address against LLM rewriting.
      const audioAnchorBlock = [
        `VERIFIED ANCHOR DATA — these values are authoritative. Use them verbatim; do not alter, paraphrase, abbreviate, or "correct" them:`,
        `- Place name: "${placeName}"`,
        address ? `- Address: ${address}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const audioNarrationPromise = openai.chat.completions
        .create(
          {
            model: "gpt-4.1-nano",
            max_completion_tokens: 256,
            messages: [
              {
                role: "system",
                content: `${audioAnchorBlock}

You are a knowledgeable, observant local — someone who has spent years paying close attention to this city and speaks plainly about what they know. You're not performing enthusiasm. Something caught your eye, and you're sharing it.

Your words will be read aloud by a text-to-speech engine. That means every word choice affects how natural it sounds.

How to write for speech:
- Target 2 to 3 sentences. Roughly 30 to 45 words total. Short is better.
- Write in fragments and incomplete thoughts the way people actually speak. "Built in the eighteen eighties. Went through three different owners before the city took it over." That rhythm is good.
- Use contractions always: it's, don't, they'd, you'll, wasn't, couldn't.
- Spell out every number, year, decade, ordinal, and acronym as words: "eighteen eighty-two" not "1882", "the nineteenth century" not "the 19th century", "the eighteen eighties" not "the 1880s", "the seventies" not "the 70s", "World War Two" not "World War II", "New York City" not "NYC", "the United States" not "the US", "three stories tall" not "3-story".
- No abbreviations, no acronyms, no symbols, no quotes, no parentheses, no dashes used as parentheses.
- Use a comma where you'd naturally pause for breath. A period where you'd stop completely. Nothing else for punctuation structure.
- MANDATORY FIRST CLAUSE — every narration MUST begin with a spatial anchor that orients the listener in physical space. This is non-negotiable: a narration that omits the spatial opener is wrong. Choose the strongest signal you have, in this priority order:
  1. If a specific street-number address is provided (e.g. "610 8th Ave"), open with it: "That's six-ten Eighth Avenue —" or "Right at six-ten Eighth Avenue —".
  2. If a nearby cross-street or block context is provided (e.g. "W 49th St, Hell's Kitchen"), open with a phrase tied to it: "Here on West Forty-ninth —" or "Just off Eighth, in Hell's Kitchen —".
  3. If only a broader area or landmark reference is provided, open with a directional phrase tied to it: "Just back from the piers —" or "Across from the park —".
  4. If nothing is provided, open with a generic spatial phrase: "Right at this corner —", "Just ahead on your left —", "The building across the street —". Never skip the opener.
  Spell out all numbers, directions, and abbreviations as full words: "West" not "W", "Street" not "St", "Avenue" not "Ave", "Northeast" not "NE", "forty-nine" not "49".
- After the location opener, surface the most place-specific thing you have. Prefer details that change how the listener sees what's physically around them right now — a visible architectural feature, an odd street layout, a reused space, a building's earlier use, something that happened on this exact block, a human moment older residents still remember. Vary the angle so consecutive narrations don't all share the same shape.
- Avoid generic trivia, celebrity-adjacent name-drops, and "hidden" facts with no visible or experiential trace today (buried tracks, sealed tunnels, underground streams) — unless you can tie them to something the listener can actually perceive: a slope in the street, a sunken basement, a missing block, a remaining wall.
- If the place is a ghost sign, faded painted wall advertisement, or similar fragile visual artifact, do NOT lead with the sign's appearance or ask the listener to find it. Lead instead with the building's or block's history. The app cannot currently give precise enough visual guidance for the listener to reliably locate a faded sign while walking. Anchor to the structure, not the fading paint.
- Restrained sensory imagery is welcome when earned and specific. "This block used to smell like roasting coffee." "People slept on the rooftops during summer heat waves." Keep it short and observational. Never flowery, theatrical, or atmospheric for its own sake.
- Never use exclamation points. Avoid rhetorical questions. Never say "hidden gem," "fascinating," "incredible," "amazing," or "you won't believe." Don't oversell what you're pointing at.
- When the history involves difficulty — displacement, labor, disaster, tragedy, crime — be candid and matter-of-fact. Give the people involved their dignity. Don't frame hard history as exotic or as dark tourism.
- End without a moral lesson, emotional coaching, or invitation to reflect. A specific fact, a small contrast, a human-scaled detail is enough. Let it land without commentary.
- If you're not certain of a detail, say "supposedly" or "according to local accounts" rather than stating it as fact.`,
              },
              {
                role: "user",
                content: `I'm walking past "${placeName}" (${category || "place"}).${audioLocationContext} Here's what's interesting: ${summary}${(facts || []).length ? ` Also: ${(facts || []).join(" ")}` : ""}. Give me a brief, natural narration.`,
              },
            ],
          },
          { signal: abortController.signal },
        )
        // @end-prompt-region walk-narration-audio
        .then((r) => {
          const text = r.choices[0]?.message?.content;
          if (!text) throw new Error("empty_content");
          return text.trim();
        });

      inFlightNarration.set(narrationCacheKey, audioNarrationPromise);
      audioNarrationPromise.finally(() =>
        inFlightNarration.delete(narrationCacheKey),
      );

      try {
        narrationText = await audioNarrationPromise;
      } catch (err: any) {
        req.log.warn(
          {
            reqId: req.id,
            route: "walk-narration-audio",
            outcome: abortController.signal.aborted ? "cancelled" : "failure",
            cacheHit: false,
            durationMs: Date.now() - requestStartTime,
            errStatus: err?.status,
          },
          "[walk-narration-audio] live narration text call failed",
        );
        if (abortController.signal.aborted) return;
        if (err?.message === "empty_content") {
          if (!res.headersSent)
            res.status(500).json({ error: "Failed to generate narration" });
          return;
        }
        const status =
          err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
        if (!res.headersSent)
          res.status(status).json({
            error:
              "Narration service temporarily unavailable. Please try again.",
          });
        return;
      }
      setLLMCache(narrationCacheKey, { narration: narrationText });
    }
  }

  // Cheap sub-timing split (no flow restructuring): everything above this
  // point is the "chat" phase (cache lookup, coalesced wait, or a live LLM
  // call); everything below is the "TTS" phase. Only reached on a chat-phase
  // success, so chatMs below always reflects real elapsed time whether the
  // text came from cache or a live call.
  const chatDoneAt = Date.now();

  // Step 2: render narration text to natural-voice MP3 via OpenAI TTS.
  // Coalesce concurrent requests for the same audio key so only one TTS call
  // is made. Pass the abort signal so a lone caller's disconnect still cancels;
  // if a second caller is waiting, the signal is irrelevant to them but they
  // get a 503 (retryable) if the first caller's abort kills the promise.
  let audioBytes: Buffer;
  const existingAudioFlight = inFlightAudio.get(audioCacheKey);
  if (existingAudioFlight) {
    try {
      audioBytes = await existingAudioFlight;
      if (audioBytes.length === 0) throw new Error("TTS returned empty audio");
    } catch (err: any) {
      req.log.warn(
        {
          reqId: req.id,
          route: "walk-narration-audio",
          outcome: abortController.signal.aborted ? "cancelled" : "failure",
          cacheHit: false,
          durationMs: Date.now() - requestStartTime,
          chatMs: chatDoneAt - requestStartTime,
        },
        "[walk-narration-audio] coalesced TTS call failed",
      );
      if (abortController.signal.aborted) return;
      logger.error({ err, placeName, voice }, "TTS generation failed (waiter)");
      const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
      if (!res.headersSent)
        res.status(status).json({
          error: "Voice synthesis temporarily unavailable. Please try again.",
        });
      return;
    }
  } else {
    const audioPromise = textToSpeech(
      narrationText,
      voice,
      "mp3",
      abortController.signal,
    );
    inFlightAudio.set(audioCacheKey, audioPromise);
    audioPromise.finally(() => inFlightAudio.delete(audioCacheKey));
    try {
      audioBytes = await audioPromise;
    } catch (err: any) {
      req.log.warn(
        {
          reqId: req.id,
          route: "walk-narration-audio",
          outcome: abortController.signal.aborted ? "cancelled" : "failure",
          cacheHit: false,
          durationMs: Date.now() - requestStartTime,
          chatMs: chatDoneAt - requestStartTime,
        },
        "[walk-narration-audio] live TTS call failed",
      );
      if (abortController.signal.aborted) return;
      logger.error({ err, placeName, voice }, "TTS generation failed");
      const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
      if (!res.headersSent)
        res.status(status).json({
          error: "Voice synthesis temporarily unavailable. Please try again.",
        });
      return;
    }
    if (!audioBytes || audioBytes.length === 0) {
      req.log.warn(
        {
          reqId: req.id,
          route: "walk-narration-audio",
          outcome: "failure",
          cacheHit: false,
          durationMs: Date.now() - requestStartTime,
          chatMs: chatDoneAt - requestStartTime,
        },
        "[walk-narration-audio] TTS returned empty audio",
      );
      if (!res.headersSent)
        res.status(500).json({ error: "TTS returned empty audio" });
      return;
    }
    setAudioCache(audioCacheKey, audioBytes);
  }

  req.log.info(
    {
      reqId: req.id,
      route: "walk-narration-audio",
      outcome: "success",
      cacheHit: false,
      durationMs: Date.now() - requestStartTime,
      chatMs: chatDoneAt - requestStartTime,
      ttsMs: Date.now() - chatDoneAt,
    },
    "[walk-narration-audio] request completed",
  );
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "private, max-age=900");
  res.setHeader("X-Narration-Cache", "miss");
  res.send(audioBytes);
});

router.post("/explore/deep-narration", async (req, res) => {
  const parsed = GetWalkNarrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { placeName, category, summary, facts, address } = parsed.data;
  const yearBuilt =
    typeof (req.body as any)?.yearBuilt === "string"
      ? (req.body as any).yearBuilt
      : undefined;

  // Abort controller wired to the response close event so that the in-flight
  // LLM call is cancelled immediately if the client disconnects, avoiding
  // wasted tokens and preventing the response from being sent to a gone client.
  const abortController = new AbortController();
  const deepTimeout = setTimeout(() => abortController.abort(), 20_000);
  res.on("close", () => abortController.abort());

  const factsKeyPart = (facts || [])
    .map((f) => f.slice(0, 80).toLowerCase())
    .sort()
    .join("|");
  const deepCacheKey = `deep-narration:v14:${placeName.toLowerCase()}|${(category || "").toLowerCase()}|${(yearBuilt || "").toLowerCase()}|${summary.slice(0, 80).toLowerCase()}|${factsKeyPart}`;
  const cachedDeep = getLLMCache<{ narration: string }>(deepCacheKey);
  if (cachedDeep) {
    clearTimeout(deepTimeout);
    res.json(cachedDeep);
    return;
  }

  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    response = await openai.chat.completions.create(
      {
        model: "gpt-4.1-mini",
        max_completion_tokens: 700,
        messages: [
          {
            role: "system",
            content: `You are a warm, knowledgeable friend giving someone a proper deep-dive on a single place as they walk toward it. You know a lot, you're genuinely excited about this particular spot, and you talk like a person, not a tour pamphlet. Your words will be read aloud by a text-to-speech engine, so every choice you make about words and rhythm directly affects how natural it sounds.

How to write for speech:
- Target 150 to 220 words. That's roughly sixty to ninety seconds spoken aloud.
- Speak in a natural, conversational flow. Mix short sentences and longer ones. Use fragments when they sound right. "Built around eighteen ninety. Nobody's quite sure who commissioned it." That kind of rhythm.
- Use contractions throughout: it's, wasn't, they'd, you'll, couldn't, hadn't. Never use the formal version when the contraction is available.
- Spell out every number, year, decade, ordinal, and acronym as words: "eighteen ninety-two" not "1892", "the nineteenth century" not "the 19th century", "the eighteen eighties" not "the 1880s", "the seventies" not "the 70s", "World War Two" not "World War II", "New York City" not "NYC", "the United States" not "the US", "four stories" not "4-story". TTS engines mispronounce digits, ordinal suffixes, Roman numerals, and initialisms badly.
- No abbreviations, acronyms, symbols, bullet points, headings, quotes, parentheses, or asterisks of any kind.
- Use commas where you'd naturally pause for breath. Periods where you'd fully stop. No ellipses or dashes as structure.
- If an address is provided, begin with a single natural spoken phrase naming the location — for example, "That's four twenty-three West Forty-eighth Street —" or "Right here at the corner of Fifth and Fifty-third —". Spell all numbers, directions, and abbreviations as full words: "West" not "W", "Street" not "St", "Avenue" not "Ave". Then follow immediately with your hook.
- Open with a hook: a vivid sensory detail, an unexpected fact, a specific person, or a question. Don't start with the place's name and date — that's the least interesting thing about it.
- Weave in: when and why it was built, who used it, one or two specific human moments connected to it, what makes it distinctive, and how it sits in the neighborhood now. Prioritise details that recontextualise what the listener can see right now — visible features, street geometry, reused space, lingering traces of an earlier use.
- Avoid generic trivia, celebrity-adjacent name-drops, and "hidden" facts with no perceptible trace today (buried tracks, sealed tunnels, underground streams) unless you tie them to something present and visible. Restrained sensory imagery is welcome when earned and specific — never flowery or atmospheric for its own sake.
- If the place is a ghost sign, faded painted wall advertisement, or similar fragile visual artifact: do NOT describe the sign or ask the listener to look for it. Pivot to the building's or block's structural or social history instead — the sign can be mentioned briefly but must not be the hook or the focus. Fragile visual objects require precise positioning the app cannot currently provide.
- When the history involves difficulty — displacement, labour, disaster, tragedy, crime — be candid and humane. Avoid sensationalism and dark-tourism framing.
- If a detail is uncertain, say so naturally: "the story goes," "supposedly," "nobody's quite sure, but."
- End with something concrete — a detail to notice right now, a question to carry, a before-and-after that lands. No moral lesson or invitation to reflect.`,
          },
          {
            role: "user",
            content: `Give me a deep-dive narration for "${placeName}"${category ? ` (a ${category})` : ""}${yearBuilt ? `, dating to roughly ${yearBuilt}` : ""}${address ? `\nAddress: ${address}` : ""}.\n\nWhat we already know: ${summary}${(facts || []).length ? `\nAlso noted: ${(facts || []).join(" ")}` : ""}\n\nWrite the spoken narration only — no preamble, no closing remarks.`,
          },
        ],
      },
      { signal: abortController.signal },
    );
  } catch (err: any) {
    clearTimeout(deepTimeout);
    if (abortController.signal.aborted) {
      if (!res.headersSent && res.socket?.writable)
        res.status(504).json({
          error: "Deep narration request timed out. Please try again.",
        });
      return;
    }
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    res.status(status).json({
      error:
        "Deep narration service temporarily unavailable. Please try again.",
    });
    return;
  }

  clearTimeout(deepTimeout);
  const content = response.choices[0]?.message?.content;
  if (!content) {
    res.status(500).json({ error: "Failed to generate deep narration" });
    return;
  }

  const result = { narration: content.trim() };
  setLLMCache(deepCacheKey, result);
  res.json(result);
});

// Public OSRM endpoints. The official demo (`router.project-osrm.org`) has
// been unreliable (frequent timeouts as of 2026-04-21), so we try the FOSSGIS
// foot router first, then fall back to the demo, then to a generic OSRM
// instance. Each provider gets a short timeout so a single failure can't stall
// the whole request — total worst-case is ~3 * PROVIDER_TIMEOUT_MS.
const OSRM_PROVIDERS = [
  {
    name: "fossgis-foot",
    base: "https://routing.openstreetmap.de/routed-foot",
  },
  { name: "osrm-demo", base: "https://router.project-osrm.org" },
] as const;
const PROVIDER_TIMEOUT_MS = 4500;

interface OsrmStep {
  distance: number;
  duration: number;
  name?: string;
  maneuver: {
    location: [number, number]; // [lng, lat]
    type?: string;
    modifier?: string;
  };
}

interface OsrmLeg {
  steps?: OsrmStep[];
}

interface OsrmResponse {
  routes?: Array<{
    geometry: { coordinates: [number, number][] };
    distance: number;
    duration: number;
    legs?: OsrmLeg[];
  }>;
}

// Convert an OSRM maneuver into a short, human-readable instruction string.
// OSRM does NOT supply natural-language instructions itself — only the
// structured maneuver type/modifier and the street name — so we synthesize a
// short cue here suitable for both visual display and TTS.
function osrmStepToInstruction(step: OsrmStep): string {
  const type = step.maneuver.type || "";
  const mod = step.maneuver.modifier || "";
  const name = (step.name || "").trim();
  const onto = name ? ` onto ${name}` : "";

  switch (type) {
    case "depart":
      return name ? `Head out on ${name}` : "Head out";
    case "arrive":
      return "Arrive at your destination";
    case "turn":
    case "end of road":
    case "fork":
    case "merge":
    case "on ramp":
    case "off ramp":
    case "continue":
      return mod
        ? `${capitalize(mod)} turn${onto}`
        : name
          ? `Continue onto ${name}`
          : "Continue";
    case "new name":
      return name ? `Continue onto ${name}` : "Continue";
    case "roundabout":
    case "rotary":
      return name ? `Take the roundabout${onto}` : "Take the roundabout";
    default:
      if (mod) return `${capitalize(mod)}${onto}`;
      return name ? `Continue onto ${name}` : "Continue";
  }
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

async function fetchRouteFromProvider(
  base: string,
  coords: string,
): Promise<OsrmResponse | null> {
  const url = `${base}/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    return (await resp.json()) as OsrmResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

router.post("/explore/route", async (req, res) => {
  const parsed = GetRouteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { start, end, waypoints } = parsed.data;

  const safeWaypoints = (waypoints || []).slice(0, 10);
  const points = [
    { lat: start.latitude, lng: start.longitude },
    ...safeWaypoints.map((w: { latitude: number; longitude: number }) => ({
      lat: w.latitude,
      lng: w.longitude,
    })),
    { lat: end.latitude, lng: end.longitude },
  ];

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");

  // Race all providers simultaneously — first successful response wins.
  // This eliminates the sequential timeout penalty (up to 4.5 s per provider)
  // when the primary server is slow or temporarily unavailable.
  // Track raw results so we can distinguish 404 (provider reachable, no route)
  // from 502 (all providers unreachable/failed) in the fallback path.
  const providerResults: (OsrmResponse | null)[] = [];
  let json: OsrmResponse;
  let providerUsed: string;
  try {
    const winner = await Promise.any(
      OSRM_PROVIDERS.map(async (provider, i) => {
        const result = await fetchRouteFromProvider(provider.base, coords);
        providerResults[i] = result;
        if (!result?.routes?.[0]) throw new Error("no_route");
        return { json: result, name: provider.name };
      }),
    );
    json = winner.json;
    providerUsed = winner.name;
  } catch {
    // AggregateError — all providers either failed or returned no route.
    // If at least one provider responded (non-null result), there are no
    // walkable routes between the points → 404. If all returned null the
    // service itself is unavailable → 502.
    const anyReachable = providerResults.some((r) => r !== null);
    if (anyReachable) {
      res.status(404).json({
        error: "No walking route could be found between those points",
      });
    } else {
      res.status(502).json({ error: "Routing service unavailable" });
    }
    return;
  }

  const route = json.routes![0];

  const geometry = route.geometry.coordinates.map(
    ([lng, lat]) => [lat, lng] as [number, number],
  );

  // Flatten OSRM legs into a single sequential list of turn-by-turn steps so
  // the client can render a directions list and fire turn cues as the user
  // walks. The OSRM "arrive" step at the end of every leg has zero distance
  // and is informational; we keep it for the final leg only.
  const allLegs = route.legs ?? [];
  const steps: Array<{
    instruction: string;
    distanceMeters: number;
    durationSeconds: number;
    location: [number, number];
    maneuverType: string;
  }> = [];
  for (let li = 0; li < allLegs.length; li++) {
    const legSteps = allLegs[li].steps ?? [];
    for (const s of legSteps) {
      const isArrive = s.maneuver.type === "arrive";
      // Drop intermediate-leg "arrive" markers (waypoint pass-throughs); only
      // keep the very final arrival step.
      if (isArrive && li !== allLegs.length - 1) continue;
      const [lng, lat] = s.maneuver.location;
      steps.push({
        instruction: osrmStepToInstruction(s),
        distanceMeters: Math.round(s.distance),
        durationSeconds: Math.round(s.duration),
        location: [lat, lng],
        maneuverType: s.maneuver.type ?? "continue",
      });
    }
  }

  res.setHeader("X-Routing-Provider", providerUsed ?? "unknown");
  res.json({
    geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    steps,
  });
});

function projectToMeters(
  lat: number,
  lng: number,
  originLat: number,
  originLng: number,
): { x: number; y: number } {
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  const x = (lng - originLng) * 111320 * cosLat;
  const y = (lat - originLat) * 111320;
  return { x, y };
}

function pointToRouteDistance(
  geometry: [number, number][],
  lat: number,
  lng: number,
): { distance: number; progress: number } {
  if (geometry.length === 0) return { distance: Infinity, progress: 0 };
  const [originLat, originLng] = geometry[0];

  const projected = geometry.map(([la, ln]) =>
    projectToMeters(la, ln, originLat, originLng),
  );
  const target = projectToMeters(lat, lng, originLat, originLng);

  let bestDist = Infinity;
  let bestProgress = 0;
  let cumulative = 0;

  for (let i = 0; i < projected.length - 1; i++) {
    const a = projected[i];
    const b = projected[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen2 = dx * dx + dy * dy;
    let t = 0;
    if (segLen2 > 0) {
      t = ((target.x - a.x) * dx + (target.y - a.y) * dy) / segLen2;
      t = Math.max(0, Math.min(1, t));
    }
    const closestX = a.x + t * dx;
    const closestY = a.y + t * dy;
    const distX = target.x - closestX;
    const distY = target.y - closestY;
    const dist = Math.sqrt(distX * distX + distY * distY);
    const segLen = Math.sqrt(segLen2);

    if (dist < bestDist) {
      bestDist = dist;
      bestProgress = cumulative + t * segLen;
    }
    cumulative += segLen;
  }

  return { distance: bestDist, progress: bestProgress };
}

function routeBoundingBox(
  geometry: [number, number][],
  paddingMeters: number,
): { south: number; west: number; north: number; east: number } | null {
  if (geometry.length === 0) return null;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const [la, ln] of geometry) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (ln < minLng) minLng = ln;
    if (ln > maxLng) maxLng = ln;
  }
  const latPad = paddingMeters / 111320;
  const lngPad =
    paddingMeters /
    (111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  return {
    south: minLat - latPad,
    west: minLng - lngPad,
    north: maxLat + latPad,
    east: maxLng + lngPad,
  };
}

async function fetchOSMPlacesInBoundingBox(
  bbox: { south: number; west: number; north: number; east: number },
  corridorMeters: number = 70,
  routeLengthKm?: number,
): Promise<{
  places: OSMPlace[];
  osmCandidatesCap: number;
  corridorCap: number;
  lengthCap: number;
}> {
  const { south, west, north, east } = bbox;

  // Scale the Overpass result limit and candidate cap with corridor width.
  // Narrow/packed corridors (≈70 m) benefit from a larger pool because many
  // candidates are clustered close to the route centre-line.
  // Wide/relaxed corridors (≈300 m) cast a broader geographic net so fewer
  // results are needed to give good spacing coverage.
  //   t = 0  →  corridor = 70 m  (narrow / packed)
  //   t = 1  →  corridor = 300 m (wide  / relaxed)
  const t = Math.min(1, Math.max(0, (corridorMeters - 70) / 230));
  const overpassLimit = Math.round(300 - 150 * t); // 300 → 150
  const corridorCap = Math.round(100 - 60 * t); // 100 → 40
  // Also constrain by route length: ~15 candidates per km, min 15, max 75.
  // Take the minimum so both density and length constraints are respected.
  const lengthCap =
    routeLengthKm !== undefined
      ? Math.min(75, Math.max(15, Math.round(routeLengthKm * 15)))
      : corridorCap;
  const osmCandidatesCap = Math.min(corridorCap, lengthCap);

  const query = `
[out:json][timeout:10];
(
  nwr["historic"](${south},${west},${north},${east});
  nwr["heritage"](${south},${west},${north},${east});
  nwr["tourism"~"^(attraction|artwork|memorial|museum|gallery|viewpoint)$"](${south},${west},${north},${east});
  nwr["name"]["building"](${south},${west},${north},${east});
  nwr["name"]["landuse"~"^(industrial|railway)$"](${south},${west},${north},${east});
  nwr["amenity"~"^(theatre|library|cinema|townhall|courthouse|university|college|school|place_of_worship|marketplace)$"]["name"](${south},${west},${north},${east});
  nwr["memorial"](${south},${west},${north},${east});
  nwr["man_made"~"^(tower|bridge|obelisk|water_tower|lighthouse)$"]["name"](${south},${west},${north},${east});
);
out center body ${overpassLimit};
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const fetchOpts = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "UrbanExplorer/1.0 (walking-tour app)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: controller.signal,
  };

  try {
    const { resp, provider } = await Promise.any(
      OVERPASS_PROVIDERS.map((url) =>
        fetch(url, fetchOpts).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return { resp: r, provider: url };
        }),
      ),
    );
    clearTimeout(timeout);
    logger.info({ provider }, "[overpass] route-bbox provider responded");

    const json = (await resp.json()) as { elements?: any[] };
    if (!json.elements)
      return { places: [], osmCandidatesCap, corridorCap, lengthCap };

    const seen = new Set<string>();
    const results: OSMPlace[] = [];
    for (const el of json.elements) {
      const name = el.tags?.name;
      if (!name) continue;
      const normKey = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(normKey)) continue;
      const buildingTag = el.tags?.building as string | undefined;
      if (buildingTag && BORING_BUILDING_TYPES.has(buildingTag.toLowerCase()))
        continue;
      seen.add(normKey);
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (typeof elLat !== "number" || typeof elLon !== "number") continue;
      const osmType =
        el.tags?.historic ||
        el.tags?.tourism ||
        el.tags?.amenity ||
        el.tags?.building ||
        el.tags?.man_made ||
        "place";
      results.push({
        osmId: `${el.type}/${el.id}`,
        name,
        lat: elLat,
        lon: elLon,
        type: osmType === "yes" ? "building" : osmType,
        tags: el.tags || {},
      });
    }

    // Score each place by OSM tag richness so higher-quality entries
    // are kept when we apply the cap.
    //   4 – historic or heritage: highest cultural value
    //   3 – tourism attraction/artwork/museum etc.
    //   2 – civic amenity or man_made landmark with a name
    //   1 – plain named building (lowest priority)
    const osmScore = (p: OSMPlace): number => {
      const t = p.tags;
      if (t.historic || t.heritage) return 4;
      if (t.tourism) return 3;
      if (t.amenity || t.man_made || t.memorial) return 2;
      return 1;
    };

    if (results.length > osmCandidatesCap) {
      results.sort((a, b) => osmScore(b) - osmScore(a));
      results.splice(osmCandidatesCap);
    }

    return { places: results, osmCandidatesCap, corridorCap, lengthCap };
  } catch {
    clearTimeout(timeout);
    return { places: [], osmCandidatesCap, corridorCap, lengthCap };
  }
}

router.post("/explore/places-along-route", async (req, res) => {
  const parsed = GetPlacesAlongRouteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { geometry, maxPlaces, corridorMeters } = parsed.data;

  const rawGeom = (geometry as unknown[]).slice(0, 500);
  const geom = rawGeom.filter(
    (c): c is [number, number] =>
      Array.isArray(c) &&
      c.length === 2 &&
      typeof c[0] === "number" &&
      typeof c[1] === "number",
  );
  if (geom.length < 2) {
    res.status(400).json({
      error: "Route geometry must have at least 2 valid coordinate pairs",
    });
    return;
  }

  const corridor = Math.min(corridorMeters ?? 70, 300);
  const cap = Math.min(maxPlaces ?? 12, 20);

  const bbox = routeBoundingBox(geom, corridor);
  if (!bbox) {
    res.json({ places: [] });
    return;
  }

  // Hash a sampled signature of the geometry so different routes between the
  // same endpoints (e.g. with different waypoints) don't collide in cache.
  const sampleCount = Math.min(8, geom.length);
  const step = (geom.length - 1) / Math.max(1, sampleCount - 1);
  const sig: string[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const idx = Math.round(i * step);
    const [la, ln] = geom[idx];
    sig.push(`${la.toFixed(4)},${ln.toFixed(4)}`);
  }
  const cacheKey = `places-route:v28:${sig.join("|")}:${corridor}:${cap}`;
  const cached = getLLMCache<{ places: any[] }>(cacheKey);
  if (cached) {
    classifyDiscovery(cached.places);
    applyDiscoveryTier(cached.places);
    // historicalForce is derived on every read (fresh + cached), same
    // pattern as discoveryTier above. Tag-attachment only; not consumed
    // anywhere yet.
    for (const p of cached.places as any[]) {
      const hf = deriveHistoricalForce(p.osmTags ?? {});
      if (hf) p.historicalForce = hf;
    }
    // Generic commercial businesses (chains) are excluded from the Walk
    // Mode route-planning pool — same product decision as the live discover
    // path. Rubric: artifacts/urban-explorer/docs/discovery-ranking-rubric.md
    // — "Suppress from auto-surface".
    const filteredCached = filterGenericCommercial(
      filterDeniedPlaces(cached.places),
    );
    res.json({ places: filteredCached });
    return;
  }

  // Compute total route length in km so fetchOSMPlacesInBoundingBox can
  // scale the candidates cap proportionally alongside the corridor-based cap.
  let routeLengthKm = 0;
  for (let i = 1; i < geom.length; i++) {
    routeLengthKm +=
      haversineDistance(
        geom[i - 1][0],
        geom[i - 1][1],
        geom[i][0],
        geom[i][1],
      ) / 1000;
  }

  const {
    places: osmPlaces,
    osmCandidatesCap,
    corridorCap,
    lengthCap,
  } = await fetchOSMPlacesInBoundingBox(bbox, corridor, routeLengthKm);
  logger.info(
    {
      geomPoints: geom.length,
      corridorM: corridor,
      routeLengthKm: routeLengthKm.toFixed(2),
      corridorCap,
      lengthCap,
      osmCandidatesCap,
      osmPlaces: osmPlaces.length,
    },
    "[places-along-route] OSM fetch",
  );

  const candidates = osmPlaces
    .map((p) => {
      const { distance, progress } = pointToRouteDistance(geom, p.lat, p.lon);
      return {
        place: p,
        offsetMeters: Math.round(distance),
        progressMeters: Math.round(progress),
      };
    })
    .filter((c) => c.offsetMeters <= corridor)
    .sort((a, b) => a.progressMeters - b.progressMeters);

  // Space-out: skip places that are too close (along the route) to one already chosen.
  // Smaller spacing = more density of stories along the walk.
  const minSpacing = 45;
  const spaced: typeof candidates = [];
  let lastProgress = -Infinity;
  for (const c of candidates) {
    if (c.progressMeters - lastProgress >= minSpacing) {
      spaced.push(c);
      lastProgress = c.progressMeters;
    }
    if (spaced.length >= cap * 2) break;
  }

  const finalCandidates = spaced.slice(0, cap);
  logger.info(
    {
      candidates: candidates.length,
      spaced: spaced.length,
      final: finalCandidates.length,
    },
    "[places-along-route] filtered",
  );

  if (finalCandidates.length === 0) {
    res.json({ places: [] });
    return;
  }

  const formatCandidateLine = (
    c: (typeof finalCandidates)[number],
    i: number,
  ) => {
    const t = c.place.tags;
    const details: string[] = [];
    if (t["addr:street"]) {
      const num = sanitizeOSMText(t["addr:housenumber"] || "", 10);
      const street = sanitizeOSMText(t["addr:street"], 60);
      details.push(`address: ${num} ${street}`.trim());
    }
    if (t.start_date)
      details.push(`built: ${sanitizeOSMText(t.start_date, 20)}`);
    if (t.architect)
      details.push(`architect: ${sanitizeOSMText(t.architect, 60)}`);
    if (t.heritage) details.push(`heritage site`);
    if (t.historic)
      details.push(`historic: ${sanitizeOSMText(t.historic, 30)}`);
    const extra = details.length ? ` (${details.join(", ")})` : "";
    return `  ${i + 1}. "${sanitizeOSMText(c.place.name, 100)}" [${sanitizeOSMText(c.place.type, 30)}] at ${c.place.lat.toFixed(5)},${c.place.lon.toFixed(5)}${extra}`;
  };

  const systemPrompt = `You are a hyper-local urban historian writing brief, vivid blurbs for a walking tour app.

You will be given a list of REAL places (verified from OpenStreetMap) along a planned walking route. For EACH place, write a captivating one-sentence summary and 2 specific historical facts.

QUALITY STANDARDS:
- Each fact MUST include a year, person's name, or concrete verifiable detail.
- Prioritise facts that change how the walker perceives the visible place — explain a building feature, an odd street layout, a reused space, an earlier use, a specific human moment that happened here. Surface lived human texture (who worked, gathered, lived, adapted here) over generic significance.
- Deprioritise generic trivia, celebrity-adjacent name-drops, "hidden gem" framing, and obscure-but-invisible facts (buried tracks, sealed tunnels) unless tied to a visible trace or present-day geography.
- Do NOT surface ghost signs, faded painted wall advertisements, or similar fragile visual artifacts as the primary discovery. These require precise visual positioning that walking-tour audio cannot reliably support. If a place also has a ghost sign, lead with its structural or social history instead.
- Restrained sensory detail is welcome when specific and earned ("this block used to smell like roasting coffee") — keep it brief and observational, never flowery.
- Avoid generic statements like "has rich history" or "notable building".
- Be honest: if you're uncertain, frame as "Local lore holds that..." rather than invent.
- When difficult history applies (labour, displacement, tragedy, crime), be grounded and humane — no sensationalism or dark-tourism framing.
- ATTRIBUTION CONSTRAINT: Every fact and the summary sentence must attach to the specific building or structure at the given coordinates. Do not present facts about an adjacent park, square, plaza, district, or historic event as if they describe the candidate place itself. Nearby context is permitted only when it is explicitly framed as nearby — for example: "Steps from Rittenhouse Square, which was…" or "One block north of the 1850 market site…". A year or name that belongs to a neighbouring landmark does not count as historical depth for this building. If you have no place-specific history, write a brief neutral description — "A mid-century commercial building at this corner, current use hotel" — and omit the facts array or leave it empty. Do not invent, borrow, or inherit significance.
- Use the EXACT name and coordinates provided — do not rename or move places.

Respond in JSON format:
{
  "places": [
    {
      "id": "unique-kebab-case-id",
      "name": "Exact place name from input",
      "category": "building|monument|memorial|church|park|landmark|museum|gallery|infrastructure",
      "yearBuilt": "1920s" or "circa 1850" or omit if unknown,
      "tags": ["2-3 short descriptive tags"],
      "summary": "One captivating sentence with the most surprising or vivid detail",
      "facts": ["Specific fact with year/name/detail", "Second specific fact"],
      "latitude": exact_input_latitude,
      "longitude": exact_input_longitude,
      "address": "Street address if known, or empty string"
    }
  ]
}

Return one entry per input place, in the same order. Be concise — these blurbs are read aloud while walking.`;

  // Split candidates into chunks and run LLM calls in parallel — drops total
  // latency from ~30s (one big call) to ~5-8s (slowest chunk).
  const CHUNK_SIZE = 4;
  const chunks: { offset: number; items: typeof finalCandidates }[] = [];
  for (let i = 0; i < finalCandidates.length; i += CHUNK_SIZE) {
    chunks.push({ offset: i, items: finalCandidates.slice(i, i + CHUNK_SIZE) });
  }

  const t0 = Date.now();
  // Pre-allocate the slot array so each chunk writes into the right candidate
  // index even if the LLM returns fewer items than requested for some chunks.
  const llmPlaces: any[] = new Array(finalCandidates.length).fill(null);

  // Use allSettled so a single chunk failure doesn't wipe out the entire response —
  // successful chunks still contribute their places; failed chunks fall back to OSM defaults.
  const chunkResults = await Promise.allSettled(
    chunks.map(async ({ offset, items }) => {
      const ctx = items.map((c, j) => formatCandidateLine(c, j)).join("\n");
      const resp = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_completion_tokens: 1400,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate brief walking-tour blurbs for these places along my route:\n${ctx}`,
          },
        ],
        response_format: { type: "json_object" },
      });
      const c = resp.choices[0]?.message?.content;
      if (!c) return;
      let chunkPlaces: any[];
      try {
        const parsedChunk = JSON.parse(c);
        chunkPlaces = Array.isArray(parsedChunk.places)
          ? parsedChunk.places
          : [];
      } catch {
        return;
      }
      // Write each returned place into its corresponding global slot. If the
      // LLM short-returned, leftover slots stay null and the candidate falls
      // back to OSM defaults below.
      for (let j = 0; j < items.length && j < chunkPlaces.length; j++) {
        llmPlaces[offset + j] = chunkPlaces[j];
      }
    }),
  );

  const failedChunks = chunkResults.filter(
    (r) => r.status === "rejected",
  ).length;
  if (failedChunks > 0) {
    logger.warn(
      { failedChunks, total: chunks.length },
      "[places-along-route] some LLM chunks failed — affected places will use OSM fallback names",
    );
  }
  // If every chunk failed, return a graceful error rather than an empty/fallback-only list
  if (failedChunks === chunks.length && chunks.length > 0) {
    res.status(503).json({
      error: "Route narration temporarily unavailable. Please try again.",
    });
    return;
  }
  logger.info(
    { chunks: chunks.length, durationMs: Date.now() - t0, failedChunks },
    "[places-along-route] LLM complete",
  );

  // Same key subset as HINT_TAGS in the /explore/discover handler, kept as a
  // local constant since that one is scoped to the other route's closure.
  // Retained on the output so a future historicalForce pass has wikidata/
  // wikipedia (and other hint tags) to key off — not read by any prompt,
  // filter, or scoring logic today.
  const ROUTE_OSM_HINT_TAGS = [
    "historic",
    "description",
    "heritage:description",
    "start_date",
    "wikidata",
    "wikipedia",
    "operator",
    "denomination",
    "alt_name",
    "architect",
    "building:material",
    "building:levels",
  ] as const;

  // Match LLM output back to candidates by position (same order); fall back to nearest by name
  const enriched = finalCandidates.map((c, i) => {
    const llm = llmPlaces[i] || {};
    const osmTags: Record<string, string> = {};
    for (const key of ROUTE_OSM_HINT_TAGS) {
      const val = c.place.tags[key];
      if (val) osmTags[key] = sanitizeOSMText(val, 120);
    }
    const address =
      typeof llm.address === "string" && llm.address ? llm.address : undefined;
    return {
      id:
        typeof llm.id === "string" && llm.id
          ? llm.id
          : `route-place-${i}-${Math.round(c.place.lat * 1e4)}-${Math.round(c.place.lon * 1e4)}`,
      name: c.place.name,
      category: typeof llm.category === "string" ? llm.category : c.place.type,
      yearBuilt: typeof llm.yearBuilt === "string" ? llm.yearBuilt : undefined,
      tags: Array.isArray(llm.tags) ? llm.tags.slice(0, 4) : undefined,
      summary:
        typeof llm.summary === "string" && llm.summary.trim().length > 0
          ? llm.summary.trim()
          : `A notable ${c.place.type} along your route.`,
      facts:
        Array.isArray(llm.facts) && llm.facts.length > 0
          ? llm.facts.slice(0, 3).map(String)
          : [
              "A real place verified on OpenStreetMap, but we don't have detailed history yet.",
            ],
      latitude: c.place.lat,
      longitude: c.place.lon,
      address,
      progressMeters: c.progressMeters,
      offsetMeters: c.offsetMeters,
      osmTags: Object.keys(osmTags).length > 0 ? osmTags : undefined,
      orientation: computeOrientation(
        {
          osmId: c.place.osmId,
          name: c.place.name,
          lat: c.place.lat,
          lon: c.place.lon,
          address,
        },
        osmPlaces,
      ),
    };
  });

  classifyDiscovery(enriched);
  applyDiscoveryTier(enriched);
  // historicalForce is derived on every read (fresh + cached), same
  // pattern as discoveryTier above. Tag-attachment only; not consumed
  // anywhere yet.
  for (const p of enriched as any[]) {
    const hf = deriveHistoricalForce(p.osmTags ?? {});
    if (hf) p.historicalForce = hf;
  }
  // Generic commercial businesses (chains) are excluded from the Walk Mode
  // route-planning pool — same product decision as the live discover path.
  // Rubric: artifacts/urban-explorer/docs/discovery-ranking-rubric.md —
  // "Suppress from auto-surface".
  const filteredEnriched = filterGenericCommercial(
    filterDeniedPlaces(enriched),
  );
  const result = { places: filteredEnriched };
  setLLMCache(cacheKey, result);
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /explore/rate-place — submit a thumbs-up or thumbs-down for a place
// ---------------------------------------------------------------------------

const RATE_PLACE_WINDOW_MS = 15 * 60 * 1000;
const RATE_PLACE_LIMIT = 20;
const RATE_PLACE_MESSAGE = {
  error:
    "Too many rating requests. Please wait a few minutes before trying again.",
};

// Expose the rate-limit config so the client can derive its warning threshold
// dynamically without hardcoding constants that may drift from the server.
router.get("/explore/rate-limit-config", (_req, res) => {
  res.json({ windowMs: RATE_PLACE_WINDOW_MS, limit: RATE_PLACE_LIMIT });
});

const ratePlaceIpLimiter = rateLimit({
  windowMs: RATE_PLACE_WINDOW_MS,
  limit: RATE_PLACE_LIMIT,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: RATE_PLACE_MESSAGE,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "")}`,
  store: new PgRateLimitStore(),
});

const ratePlaceDeviceLimiter = rateLimit({
  windowMs: RATE_PLACE_WINDOW_MS,
  limit: RATE_PLACE_LIMIT,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: RATE_PLACE_MESSAGE,
  skip: (req) => {
    const deviceId = req.headers["x-device-id"];
    return typeof deviceId !== "string" || deviceId.trim().length === 0;
  },
  keyGenerator: (req) => {
    const deviceId = req.headers["x-device-id"] as string;
    return `device:${deviceId.trim().slice(0, 128)}`;
  },
  validate: { keyGeneratorIpFallback: false },
  store: new PgRateLimitStore(),
});

router.post(
  "/explore/rate-place",
  ratePlaceIpLimiter,
  ratePlaceDeviceLimiter,
  async (req, res) => {
    const parsed = RatePlaceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const {
      placeId,
      placeName,
      category,
      latitude,
      longitude,
      rating,
      previousRating,
    } = parsed.data;
    const userId = req.isAuthenticated() ? req.user.id : null;

    const upDelta =
      (rating === "up" ? 1 : 0) - (previousRating === "up" ? 1 : 0);
    const downDelta =
      (rating === "down" ? 1 : 0) - (previousRating === "down" ? 1 : 0);

    if (rating === "none") {
      const [updated] = await db
        .update(placeRatings)
        .set({
          up: sql`GREATEST(0, ${placeRatings.up} + ${upDelta})`,
          down: sql`GREATEST(0, ${placeRatings.down} + ${downDelta})`,
          lastRatedAt: new Date(),
        })
        .where(eq(placeRatings.placeId, placeId))
        .returning();

      if (userId) {
        await db
          .delete(userPlaceRatings)
          .where(
            and(
              eq(userPlaceRatings.userId, userId),
              eq(userPlaceRatings.placeId, placeId),
            ),
          );
      }

      if (!updated) {
        res.json({ ok: true, placeId, up: 0, down: 0 });
        return;
      }
      res.json({ ok: true, placeId, up: updated.up, down: updated.down });
      return;
    }

    const [updated] = await db
      .insert(placeRatings)
      .values({
        placeId,
        placeName,
        category,
        latitude,
        longitude,
        up: rating === "up" ? 1 : 0,
        down: rating === "down" ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: placeRatings.placeId,
        set: {
          up: sql`GREATEST(0, ${placeRatings.up} + ${upDelta})`,
          down: sql`GREATEST(0, ${placeRatings.down} + ${downDelta})`,
          lastRatedAt: new Date(),
        },
      })
      .returning();

    if (!updated) {
      req.log.warn({ placeId }, "Rate-place upsert returned no row");
      res.json({ ok: true, placeId, up: 0, down: 0 });
      return;
    }

    if (userId) {
      await db
        .insert(userPlaceRatings)
        .values({ userId, placeId, rating, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [userPlaceRatings.userId, userPlaceRatings.placeId],
          set: { rating, updatedAt: new Date() },
        });
    }

    invalidateRatingsResponseCache();
    res.json({ ok: true, placeId, up: updated.up, down: updated.down });
  },
);

// ---------------------------------------------------------------------------
// GET /explore/user-ratings — fetch all ratings submitted by the current user
// ---------------------------------------------------------------------------

router.get("/explore/user-ratings", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user.id;
  const rows = await db
    .select({
      placeId: userPlaceRatings.placeId,
      rating: userPlaceRatings.rating,
    })
    .from(userPlaceRatings)
    .where(eq(userPlaceRatings.userId, userId));

  const ratings: Record<string, string> = {};
  for (const row of rows) {
    ratings[row.placeId] = row.rating;
  }

  res.json({ ratings });
});

// ---------------------------------------------------------------------------
// GET /explore/ratings — retrieve aggregate rating data (sorted by net score)
// ---------------------------------------------------------------------------
// Short-TTL in-memory cache for the aggregate ratings list.  This endpoint
// scans the entire place_ratings table and sorts in JS, so under load it can
// block the event loop.  A 60s TTL gives the cache near-realtime feel while
// shielding the DB from repeated unauthenticated scans.  Writes via
// /explore/rate-place invalidate this cache so user-visible changes
// propagate immediately to other clients.
const RATINGS_RESPONSE_TTL_MS = 60_000;
let ratingsResponseCache: {
  payload: { ratings: unknown[]; total: number };
  timestamp: number;
} | null = null;

function invalidateRatingsResponseCache(): void {
  ratingsResponseCache = null;
}

router.get("/explore/ratings", async (_req, res) => {
  const now = Date.now();
  if (
    ratingsResponseCache &&
    now - ratingsResponseCache.timestamp < RATINGS_RESPONSE_TTL_MS
  ) {
    res.json(ratingsResponseCache.payload);
    return;
  }

  const rows = await db.select().from(placeRatings);
  const entries = rows
    .map((e) => ({
      ...e,
      lastRatedAt: e.lastRatedAt.toISOString(),
      netScore: e.up - e.down,
    }))
    .sort((a, b) => b.netScore - a.netScore);

  const payload = { ratings: entries, total: entries.length };
  ratingsResponseCache = { payload, timestamp: now };
  res.json(payload);
});

// ---------------------------------------------------------------------------
// GET /explore/walk-config — return the active Walk Mode heading-bias constants
// ---------------------------------------------------------------------------
// The three values are loaded from environment variables at startup so they
// can be tuned in production without a mobile rebuild. The mobile client
// fetches this endpoint at walk-start and overrides its local defaults.
// Env vars: WALK_FORWARD_BIAS_METERS, WALK_OFF_AXIS_PENALTY_DEG,
//           WALK_OFF_AXIS_PENALTY_METERS
router.get("/explore/walk-config", (_req, res) => {
  res.json(WALK_CONFIG);
});

// ---------------------------------------------------------------------------
// TTL-based cache sweep — evict stale entries even if they are never accessed
// again. Without this, llmCache, osmCache, and audioCache can accumulate
// indefinitely on a long-running server. Each cache already checks TTL on
// individual get() calls; this sweep ensures the memory is actually reclaimed.
// ---------------------------------------------------------------------------
setInterval(
  () => {
    const now = Date.now();

    for (const [key, entry] of llmCache) {
      if (now - entry.timestamp > LLM_CACHE_TTL_MS) llmCache.delete(key);
    }

    for (const [key, entry] of osmCache) {
      if (now - entry.timestamp > OSM_CACHE_TTL_MS) osmCache.delete(key);
    }

    for (const [key, entry] of osmSuggestionsCache) {
      if (now - entry.timestamp > OSM_SUGGESTIONS_CACHE_TTL_MS)
        osmSuggestionsCache.delete(key);
    }

    for (const [key, entry] of audioCache) {
      if (now - entry.timestamp > AUDIO_CACHE_TTL_MS) audioCache.delete(key);
    }
  },
  5 * 60 * 1000,
).unref(); // unref so the interval doesn't keep the process alive

export default router;
