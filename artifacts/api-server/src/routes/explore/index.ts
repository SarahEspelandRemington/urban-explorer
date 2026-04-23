import { Router } from "express";
import { logger } from "../../lib/logger";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { PgRateLimitStore } from "../../lib/pgRateLimitStore";
import { openai } from "@workspace/integrations-openai-ai-server";
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
import { db, placeRatings, placePhotos, userPlaceRatings } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

const router = Router();

interface OSMPlace {
  name: string;
  lat: number;
  lon: number;
  type: string;
  tags: Record<string, string>;
}

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

const osmCache = new Map<string, { places: OSMPlace[]; timestamp: number }>();
const OSM_CACHE_TTL = 5 * 60 * 1000;
const OSM_CACHE_DISTANCE = 200;

interface LLMCacheEntry<T = any> {
  data: T;
  timestamp: number;
}

const llmCache = new Map<string, LLMCacheEntry>();
const LLM_CACHE_TTL = 15 * 60 * 1000;
const LLM_CACHE_MAX_SIZE = 200;

function getLLMCache<T>(key: string): T | null {
  const entry = llmCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > LLM_CACHE_TTL) {
    llmCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setLLMCache(key: string, data: any): void {
  if (llmCache.size >= LLM_CACHE_MAX_SIZE) {
    const oldest = llmCache.keys().next().value;
    if (oldest) llmCache.delete(oldest);
  }
  llmCache.set(key, { data, timestamp: Date.now() });
}


function getOSMCacheKey(lat: number, lng: number): { key: string; places: OSMPlace[] } | null {
  const now = Date.now();
  for (const [key, entry] of osmCache) {
    if (now - entry.timestamp > OSM_CACHE_TTL) {
      osmCache.delete(key);
      continue;
    }
    const [cachedLat, cachedLng] = key.split(",").map(Number);
    if (haversineDistance(lat, lng, cachedLat, cachedLng) < OSM_CACHE_DISTANCE) {
      return { key, places: entry.places };
    }
  }
  return null;
}

async function fetchNearbyOSMPlaces(
  lat: number,
  lng: number,
  radiusMeters: number,
  quickMode = false,
): Promise<OSMPlace[]> {
  const cached = getOSMCacheKey(lat, lng);
  if (cached) return cached.places;

  const r = Math.min(radiusMeters, 500);
  const timeoutSec = quickMode ? 4 : 5;
  const query = `
[out:json][timeout:${timeoutSec}];
(
  nwr["historic"](around:${r},${lat},${lng});
  nwr["heritage"](around:${r},${lat},${lng});
  nwr["tourism"~"^(attraction|artwork|memorial|museum|gallery|viewpoint)$"](around:${r},${lat},${lng});
  nwr["name"]["building"](around:${r},${lat},${lng});
  nwr["name"]["amenity"~"^(place_of_worship|library|theatre|cinema|arts_centre|pub|bar|bank|post_office|police|fire_station|school|college|university|marketplace|townhall|courthouse|prison|hospital|community_centre|social_facility)$"](around:${r},${lat},${lng});
  nwr["name"]["man_made"~"^(water_tower|chimney|bridge|lighthouse|monument|tower|pier|reservoir_covered|storage_tank|gasometer)$"](around:${r},${lat},${lng});
  nwr["name"]["landuse"~"^(religious|cemetery|industrial|railway)$"](around:${r},${lat},${lng});
  nwr["memorial"](around:${r},${lat},${lng});
);
out center body 40;
`;
  const controller = new AbortController();
  const abortTimeout = quickMode ? 5000 : 6000;
  const timeout = setTimeout(() => controller.abort(), abortTimeout);

  try {
    const resp = await fetch(OVERPASS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "UrbanExplorer/1.0 (walking-tour app)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) return [];

    const json = await resp.json() as { elements?: any[] };
    if (!json.elements) return [];

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
      });
    }

    const finalResults = results.slice(0, 40);
    osmCache.set(`${lat},${lng}`, { places: finalResults, timestamp: Date.now() });
    return finalResults;
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

function sanitizeOSMText(raw: string, maxLen = 80): string {
  return raw
    .replace(/[\n\r\t]/g, " ")
    .replace(/[^\x20-\x7E\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/g, "")
    .trim()
    .slice(0, maxLen);
}

function formatOSMContext(places: OSMPlace[], userLat: number, userLng: number): string {
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
    if (p.tags.start_date) details.push(`built: ${sanitizeOSMText(p.tags.start_date, 20)}`);
    if (p.tags.architect) details.push(`architect: ${sanitizeOSMText(p.tags.architect, 60)}`);
    if (p.tags.heritage) details.push(`heritage site`);
    if (p.tags.historic) details.push(`historic: ${sanitizeOSMText(p.tags.historic, 30)}`);
    if (p.tags["building:levels"]) details.push(`${sanitizeOSMText(p.tags["building:levels"], 5)} stories`);
    if (p.tags["building:material"]) details.push(`material: ${sanitizeOSMText(p.tags["building:material"], 30)}`);
    if (p.tags.wikidata) {
      const wd = p.tags.wikidata.match(/^Q\d{1,12}$/);
      if (wd) details.push(`wikidata: ${wd[0]}`);
    }
    const extra = details.length > 0 ? ` (${details.join(", ")})` : "";
    return `  ${i + 1}. "${name}" [${sanitizeOSMText(p.type, 30)}] at ${p.lat.toFixed(5)},${p.lon.toFixed(5)} — ${dist}m away${extra}`;
  });

  return `\n\nREAL PLACES FROM MAP DATA (OpenStreetMap) near these coordinates:\n${lines.join("\n")}\n\nIMPORTANT: You MUST use these real places as your primary source. For each place from the map data, use the EXACT name and coordinates provided — do not rename them or move them. Add your historical knowledge to these verified locations. You may also include 1-2 additional places you know about that are not in the map data, but mark those with confidence "medium" or "low". Places from the map data should be confidence "high" since their existence is verified.`;
}

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  "Accept": "application/json",
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
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
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
  return map[t.toLowerCase()] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : "Place");
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
    const resp = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, { signal: controller.signal, headers: NOMINATIM_HEADERS });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const data = (await resp.json()) as NominatimResult[];
    return Array.isArray(data) ? data : [];
  } catch {
    clearTimeout(timer);
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

function setNearCoordCache(key: string, value: { lat: number; lon: number } | null): void {
  if (nearLocationCoordCache.size >= NEAR_COORD_CACHE_MAX) {
    const firstKey = nearLocationCoordCache.keys().next().value;
    if (firstKey !== undefined) nearLocationCoordCache.delete(firstKey);
  }
  nearLocationCoordCache.set(key, {
    value,
    expiresAt: Date.now() + (value ? NEAR_COORD_TTL_SUCCESS_MS : NEAR_COORD_TTL_FAILURE_MS),
  });
}

/** Geocode an address string to coordinates. Results are cached per-process:
 *  successful lookups for 30 min, failures for 2 min (so transient errors
 *  don't permanently disable viewbox bias). Cache is capped at 500 entries. */
async function geocodeNearLocation(address: string): Promise<{ lat: number; lon: number } | null> {
  const key = address.toLowerCase();
  const cached = nearLocationCoordCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const params = new URLSearchParams({ q: address, format: "jsonv2", limit: "1" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, { signal: controller.signal, headers: NOMINATIM_HEADERS });
    clearTimeout(timer);
    if (!resp.ok) { setNearCoordCache(key, null); return null; }
    const json = await resp.json();
    const first = Array.isArray(json) ? json[0] : null;
    if (!first) { setNearCoordCache(key, null); return null; }
    const result = { lat: parseFloat(first.lat), lon: parseFloat(first.lon) };
    setNearCoordCache(key, result);
    return result;
  } catch {
    clearTimeout(timer);
    setNearCoordCache(key, null);
    return null;
  }
}

// ---------------------------------------------------------------------------

const NOMINATIM_MIN_INTERVAL_MS = 1100; // Nominatim ToS: max 1 req/sec
let lastNominatimCallAt = 0;

async function verifyPlaceCoordinates(places: any[]): Promise<void> {
  // Only correct coords when the geocoded address is very far from the AI's claimed
  // position — 250m catches clear hallucinations (e.g., famous church claimed to be
  // near the user but actually 8 blocks away) while leaving minor block-level
  // discrepancies alone so legitimate nearby places aren't filtered out.
  const COORD_CORRECTION_THRESHOLD_M = 250;

  // Verify ALL places that include an address — even "high" confidence ones, because
  // the AI sometimes labels famous places as "high" while hallucinating their coordinates
  // near the user's current location. Nominatim requires max 1 req/sec — enforce delay.
  const candidates = places.filter(
    (p) => typeof p.address === "string" && p.address.trim().length > 5,
  );

  for (const p of candidates) {
    // Respect Nominatim rate limit
    const now = Date.now();
    const wait = NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimCallAt = Date.now();

    try {
      const results = await nominatimSearch(p.address.trim(), 1, { countrycodes: "us" });
      if (results.length === 0) continue;
      const { lat, lon } = results[0];
      const geocodedLat = parseFloat(lat);
      const geocodedLon = parseFloat(lon);
      if (!isFinite(geocodedLat) || !isFinite(geocodedLon)) continue;
      const dist = haversineDistance(p.latitude, p.longitude, geocodedLat, geocodedLon);
      if (dist > COORD_CORRECTION_THRESHOLD_M) {
        // Coords don't match the address — replace and demote confidence.
        p.latitude = geocodedLat;
        p.longitude = geocodedLon;
        p.confidence = "low";
        p.coordSource = "nominatim-corrected";
      }
    } catch {
      // keep AI coordinates on any failure
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
  const maxDist = searchRadius * 1.10;

  let processed = places.filter((p: any) => {
    if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return false;
    if (!p.name || typeof p.name !== "string") return false;
    if (!p.summary || typeof p.summary !== "string") return false;
    if (!Array.isArray(p.facts) || p.facts.length === 0) return false;
    if (p.confidence && !validConfidence.has(p.confidence)) {
      p.confidence = "low";
    }
    return true;
  });

  if (!options.skipVerification) {
    await verifyPlaceCoordinates(processed);
  }

  processed = processed.filter((p: any) => {
    const dist = haversineDistance(userLat, userLng, p.latitude, p.longitude);
    p.distanceMeters = Math.round(dist);
    return dist <= maxDist;
  });

  const seen = new Map<string, any>();
  processed = processed.filter((p: any) => {
    const normName = normalizeText(p.name);
    for (const [existingName, existingPlace] of seen) {
      if (normName === existingName) return false;
      if (normName.includes(existingName) || existingName.includes(normName)) return false;
      const coordDist = haversineDistance(
        p.latitude, p.longitude,
        existingPlace.latitude, existingPlace.longitude,
      );
      if (coordDist < 10) return false;
    }
    seen.set(normName, p);
    return true;
  });

  processed = processed.filter((p: any) => {
    const vague = [
      "interesting history", "rich history", "long history",
      "has a story", "worth a visit", "notable building",
      "historic building", "old building",
    ];
    const summaryLower = p.summary.toLowerCase();
    const isVague = vague.some((v) => summaryLower === v || summaryLower === v + ".");
    if (isVague) return false;
    const allFactsGeneric = p.facts.every((f: string) =>
      f.length < 20 || /^(this|the) (place|building|site) (is|was|has)/i.test(f)
    );
    if (allFactsGeneric) return false;
    return true;
  });

  const ratingsMap = await fetchRatingsMap(processed);
  applyRatingSortWithMap(processed, ratingsMap);

  return processed;
}

// ---------------------------------------------------------------------------
// Wikipedia / Wikimedia photo fetching
// ---------------------------------------------------------------------------

const photoCache = new Map<string, { url: string | null; ts: number }>();
const PHOTO_CACHE_HIT_TTL = 60 * 60 * 1000; // 1 hour for successful lookups
const PHOTO_CACHE_MISS_TTL = 5 * 60 * 1000; // 5 minutes for misses (timeout/404 — retry sooner)

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
async function fetchWikipediaPhoto(placeName: string): Promise<string | null> {
  const cacheKey = placeName.toLowerCase().trim();

  // --- L1: in-process cache ---
  const cached = photoCache.get(cacheKey);
  if (cached) {
    const ttl = cached.url ? PHOTO_CACHE_HIT_TTL : PHOTO_CACHE_MISS_TTL;
    if (Date.now() - cached.ts < ttl) return cached.url;
  }

  // --- L2: database cache ---
  try {
    const rows = await db
      .select({ photoUrl: placePhotos.photoUrl, fetchedAt: placePhotos.fetchedAt })
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
    logger.warn({ err: err instanceof Error ? err.message : err }, "[photo-cache] DB read failed, falling back to live fetch");
  }

  // --- Live fetch from Wikipedia ---
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  let photoUrl: string | null = null;
  try {
    const encoded = encodeURIComponent(placeName.replace(/ /g, "_"));
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "UrbanExplorer/1.0 (walking-tour app)",
        "Accept": "application/json",
      },
    });
    clearTimeout(timer);
    if (resp.ok) {
      const data = await resp.json() as { thumbnail?: { source?: string } };
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
      logger.warn({ err: err instanceof Error ? err.message : err }, "[photo-cache] DB write failed");
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
  const WALL_TIMEOUT_MS = 4000;
  try {
    await Promise.race([
      Promise.all(
        places.map(async (p) => {
          const url = await fetchWikipediaPhoto(p.name);
          if (url) p.photoUrl = url;
        }),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, WALL_TIMEOUT_MS)),
    ]);
  } catch {
    // Photo fetch is best-effort — never break discovery.
  }
}

// ---------------------------------------------------------------------------
// Lightweight rating enrichment + sort — called on both fresh and cached results
// ---------------------------------------------------------------------------

function placeIdFor(place: { name: string; latitude: number; longitude: number }): string {
  return `${place.name}-${place.latitude}-${place.longitude}`;
}

const RATING_BOOST_M = 80;
const MAX_BOOST_M = 400;

interface PlaceRatingEntry { up: number; down: number; netScore: number }

/**
 * Batch-fetch ratings from the database for a set of places.
 * Returns a Map of placeId -> { up, down, netScore }.
 * Silently returns an empty Map on database errors so discovery still works.
 */
async function fetchRatingsMap(places: any[]): Promise<Map<string, PlaceRatingEntry>> {
  if (places.length === 0) return new Map();
  const ids = places.map(placeIdFor);
  try {
    const rows = await db
      .select({ placeId: placeRatings.placeId, up: placeRatings.up, down: placeRatings.down })
      .from(placeRatings)
      .where(inArray(placeRatings.placeId, ids));
    const map = new Map<string, PlaceRatingEntry>();
    for (const row of rows) {
      map.set(row.placeId, { up: row.up, down: row.down, netScore: row.up - row.down });
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
function applyRatingSortWithMap(places: any[], ratingsMap: Map<string, PlaceRatingEntry>): void {
  for (const p of places) {
    const rating = ratingsMap.get(placeIdFor(p)) ?? { up: 0, down: 0, netScore: 0 };
    p.netScore = rating.netScore;
    p.communityRating = rating;
  }
  places.sort((a: any, b: any) => {
    const aBoost = Math.max(-MAX_BOOST_M, Math.min(MAX_BOOST_M, (a.netScore ?? 0) * RATING_BOOST_M));
    const bBoost = Math.max(-MAX_BOOST_M, Math.min(MAX_BOOST_M, (b.netScore ?? 0) * RATING_BOOST_M));
    return (a.distanceMeters - aBoost) - (b.distanceMeters - bBoost);
  });
}

router.post("/explore/discover", async (req, res) => {
  const parsed = DiscoverPlacesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { latitude, longitude, radius, mode, accuracy } = parsed.data;
  const isQuick = mode === "quick";
  const requestedRadius = radius ?? (isQuick ? 500 : 300);
  const searchRadius = Math.max(50, Math.min(1000, requestedRadius));

  const radiusFeet = Math.round(searchRadius * 3.281);

  // ±55m cache grid (toFixed(3) ≈ 111m per unit → 0.5 unit = ~55m).
  // This means any two queries within ~55m of each other share the same
  // cache entry, which is correct — the historical places on the same block
  // are the same regardless of exactly where you stood.
  const modeKey = isQuick ? "quick" : "full";
  const discoverCacheKey = `${modeKey}:${searchRadius}:${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cachedDiscover = getLLMCache<{ places?: any[]; [key: string]: any }>(discoverCacheKey);
  if (cachedDiscover) {
    // Re-apply current ratings on every cache hit so newly-submitted ratings
    // immediately affect the sort order and communityRating display without
    // waiting for cache expiry. Clone places so we never mutate the cached object.
    if (Array.isArray(cachedDiscover.places) && cachedDiscover.places.length > 0) {
      const refreshedPlaces = cachedDiscover.places.map((p: any) => ({ ...p }));
      const ratingsMap = await fetchRatingsMap(refreshedPlaces);
      applyRatingSortWithMap(refreshedPlaces, ratingsMap);
      res.json({ ...cachedDiscover, places: refreshedPlaces });

      // Background: if any cached places are missing photos (e.g. the original
      // request hit the wall-clock timeout before Wikipedia responded), try again
      // now and update the cache so the next hit gets artwork.
      const missingPhotos = cachedDiscover.places.filter((p: any) => !p.photoUrl);
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
      res.json(cachedDiscover);
    }
    return;
  }

  const osmTimeLimit = isQuick ? 3000 : 4000;
  let osmPlaces: OSMPlace[] = [];
  try {
    osmPlaces = await Promise.race([
      fetchNearbyOSMPlaces(latitude, longitude, searchRadius, isQuick),
      new Promise<OSMPlace[]>((resolve) => setTimeout(() => resolve([]), osmTimeLimit)),
    ]);
  } catch {
    osmPlaces = [];
  }
  const osmContext = formatOSMContext(osmPlaces, latitude, longitude);

  const placeCount = isQuick ? "8-12" : "8-12";
  const factCount = isQuick ? 2 : 3;
  const modelName = isQuick ? "gpt-4.1-mini" : "gpt-4.1";
  // Full mode now targets 8-12 places; ~300 tokens/place × 12 = ~3600. Cap at 4500
  // to give comfortable headroom without runaway generation.
  const maxTokens = isQuick ? 3000 : 4500;

  // Two-step discovery for full mode: first brainstorm freely, then format.
  // Brainstorming without schema constraints lets the model recall more obscure
  // knowledge before it commits to JSON structure.
  let brainstormContext = "";
  if (!isQuick) {
    try {
      const BRAINSTORM_TIMEOUT_MS = 9000;
      const brainstormAbort = new AbortController();
      const brainstormTimer = setTimeout(() => brainstormAbort.abort(), BRAINSTORM_TIMEOUT_MS);
      try {
        const brainstormResponse = await openai.chat.completions.create(
          {
            model: "gpt-4.1-mini",
            max_completion_tokens: 900,
            messages: [
              {
                role: "system",
                content:
                  "You are a hyper-local urban historian with encyclopedic knowledge of streets, buildings, and blocks. When given GPS coordinates, brainstorm freely — without worrying about format — everything you know about the immediate surroundings: historical occupants, architectural details, former uses, local figures, infrastructure oddities, buried waterways, ghost signs, community organizations, scandals, events, transitions. Include obscure and surprising facts. Name names and dates when you know them. This is an internal brainstorm; quality and specificity matter more than completeness.",
              },
              {
                role: "user",
                content: `Brainstorm everything you know about the immediate area around ${latitude}, ${longitude} (within roughly ${radiusFeet} feet). Think out loud — what are the most surprising, specific, or overlooked historical facts about this exact block or intersection?${osmContext}`,
              },
            ],
          },
          { signal: brainstormAbort.signal },
        );
        brainstormContext = brainstormResponse.choices[0]?.message?.content ?? "";
      } finally {
        clearTimeout(brainstormTimer);
      }
    } catch {
      // Brainstorm failure or timeout is non-fatal — proceed with single-step generation.
      brainstormContext = "";
    }
  }

  const systemPrompt = `You are a hyper-local urban historian who specializes in obscure, overlooked, and forgotten stories about specific streets, buildings, and spaces. You know the kind of details that only longtime residents, local historians, or architecture nerds would know.

Given GPS coordinates, identify real places near these coordinates — centered around a roughly ${radiusFeet}-foot (${searchRadius}-meter) radius. Think small and specific:

PRIORITIZE these kinds of places (in rough order of interest):
1. The specific building at or near the coordinates — who built it, who commissioned it, what was there before, any quirky history
2. Small architectural details people walk past every day without noticing — cornerstones with dates, old signage painted on brick (ghost signs), unusual brickwork patterns, terra cotta ornaments, decorative ironwork, faded advertisements
3. Former sites — "this used to be a speakeasy / fire station / boarding house / vaudeville theater / immigrant social club"
4. Local stories with names, dates, and specifics — not "there was a neighborhood feud" but "in 1923, the building owner John Rinaldi refused to sell to the subway authority, forcing the tunnel to curve around his basement"
5. Odd infrastructure — old hitching posts, embedded trolley tracks, mysterious plaques, sealed-off subway entrances, converted buildings with visible remnants of their past use
6. Small parks, alleys, or pocket spaces with hidden histories
7. Community power and social fabric — the human history of who controlled, organized, and fought over specific streets: ethnic mutual aid societies and social clubs, union halls and labor organizing, gang territories and crew headquarters, political machine clubhouses, community figures (bosses, organizers, fixers) who shaped daily life on specific blocks. Example discoveries at this level of specificity: "596 10th Ave (now Mr. Biggs Bar) was the Westies gang's headquarters in the 1970s — Jimmy Coonan ran Hell's Kitchen's Irish mob from this corner"; "The building at 43 E 4th St housed the United Hebrew Trades, whose 1888 organizing drive pulled 10,000 garment workers off the job in one week"; "This storefront was Tammany Hall's 17th Ward clubhouse, where district captain 'Big Tim' Sullivan handed out turkeys and coal to tenants in exchange for their votes every November"
8. Buildings or sites that have lived multiple lives across eras — the use-transition itself is the story. A stable that became a speakeasy that became a bodega that became a luxury condo reveals more about a city's social history than any single-era fact. Name the most surprising transition and the people behind it.
9. Hidden infrastructure and subsurface remnants — vault sidewalks (glass-block or iron-grate footpaths over coal cellars, still visible underfoot on many older blocks), buried streams converted to storm sewers running beneath the current street, repurposed streetcar poles and trolley-track fragments embedded in asphalt, filled-in shorelines where water ran until the 19th century. These are among the most surprising discoveries for anyone standing on a city sidewalk.

AVOID these:
- Major tourist landmarks whose primary fame IS as a visitor destination (e.g., Statue of Liberty, Empire State Building as a skyscraper, Times Square as a spectacle). You MAY include a famous address when the specific story is genuinely non-obvious — not the building's celebrity, but something surprising that guidebooks omit. Example: the Empire State Building's observation deck is off-limits; but its mooring mast was designed for transatlantic dirigibles and actually docked one airship in 1931 — that story is fair game if you are near it.
- Places far outside the immediate area — stay local to the block or intersection
- Generic descriptions that could apply to any old building in any city. BAD: "This building has a rich history." GOOD: "The carved stone face above the third-floor window is a portrait of the building's architect, who hid his own likeness in all his projects."
- Well-known museums, famous monuments, or top-10 lists
- Descriptions that are mostly about the neighborhood in general rather than the specific place
- Collective area descriptions without a specific anchor point. BAD: "A row of tenement houses on 41st Street that housed immigrant families in the 1900s." GOOD: "317 W 41st St — one of the few survivors from when this entire block was dense immigrant housing; note the fire escape ironwork pattern unique to pre-1910 tenements."
- Social history claims without a specific address or intersection. BAD: "The Westies controlled Hell's Kitchen in the 1970s." GOOD: "596 10th Ave was the Westies' base of operations — Jimmy Coonan ran the crew from this corner through the late 1970s."

QUALITY STANDARDS FOR FACTS:
- Every fact MUST include at least one of: a specific year/decade, a person's name, a verifiable detail (address, building material, style name), or a concrete event
- BAD fact: "This building has seen many changes over the years"
- GOOD fact: "The Italianate cornice was added in 1887 when dry goods merchant Samuel Hewitt converted the ground floor from a livery stable to a department store"
- Each place should have ${factCount} genuinely distinct facts, not restatements of the same point

COORDINATE ACCURACY IS CRITICAL:
- Use precise coordinates to 5 decimal places (±1 meter accuracy)
- Every discovery MUST be anchored to a single specific, locatable point — one building entrance, one intersection, one wall, one doorway. Never describe a phenomenon that spans many buildings without picking one surviving example and telling the story through that lens.
- For known addresses, use the exact building coordinates
- For intersections, use the exact intersection point
- Always include a real street address or intersection in the "address" field — this helps users navigate
- The coordinates and address MUST agree with each other. Do not give coordinates in one location and an address in a different location.

HONESTY RULE: If you are uncertain whether a place or fact is real, say so in the fact itself (e.g., "Local lore holds that..." or "According to neighborhood accounts..."). Never present uncertain claims as established fact. It is far better to share fewer places with genuine, verifiable details than to pad the list with invented stories.

If you genuinely cannot identify specific obscure places at these exact coordinates, focus on the immediate block or intersection: the architectural style of the buildings right there, what the neighborhood looked like 50 or 100 years ago, what businesses or residents occupied the exact spot historically.

USING THE OSM DATA: The user message will include a list of nearby features from OpenStreetMap. For each named OSM feature, ask yourself: is there a non-obvious story behind this specific building, business, or structure that a guidebook would miss? Treat every OSM entry as a prompt for historical investigation — a building that OSM simply lists as "commercial" may have been a union hall, a speak-easy, or a political clubhouse. Do not just re-describe what the OSM data already says. Use it as a starting point to surface the obscure layer underneath.

Respond in JSON format:
{
  "location": "Very specific area description (e.g., 'Corner of Bleecker & MacDougal, Greenwich Village' or '400 block of S Main St, downtown')",
  "places": [
    {
      "id": "unique-kebab-case-id",
      "name": "Place Name — use the real or historical name, not a generic label",
      "category": "building|storefront|alley|corner|mural|infrastructure|former site|architectural detail|park|church|residential|vault sidewalk|subsurface|waterway remnant|transportation remnant",
      "yearBuilt": "1920s" or "circa 1850" or "unknown",
      "tags": ["2-4 descriptive tags like: ghost sign, speakeasy, art deco, industrial, immigrant history, prohibition era, jazz age, tenement, waterfront, transit, religious, commercial, residential, demolished, converted, landmarked, labor history, ethnic community, gang territory, political machine, immigrant organization, working class, displacement, multi-era, vault sidewalk, buried waterway, streetcar, subsurface"],
      "summary": "One captivating sentence that makes this specific place sound like a secret worth knowing. Include the most surprising or vivid detail.",
      "facts": ["Fact with a specific year, name, or verifiable detail", "A second distinct fact", "A third distinct fact"],
      "latitude": precise_lat_to_5_decimal_places,
      "longitude": precise_lng_to_5_decimal_places,
      "address": "Nearest real street address or intersection (e.g., '157 W 48th St' or 'W 48th St & 8th Ave')",
      "confidence": "high|medium|low"
    }
  ]
}

Here is one PERFECT example entry — use it as your quality benchmark for every place you return:
{
  "id": "pomander-walk-94th",
  "name": "Pomander Walk",
  "category": "alley",
  "yearBuilt": "1921",
  "tags": ["hidden enclave", "tudor revival", "theatrical history", "arts colony"],
  "summary": "A secret Tudor village of 16 rowhouses hidden behind an unmarked iron gate — built as a full-scale replica of a stage set, completely invisible from the street.",
  "facts": [
    "Developer Thomas Healy — owner of the Hotel Astor — commissioned the complex in 1921, modelling it precisely on the English village backdrop used in Louis Parker's 1910 Broadway play 'Pomander Walk', which Healy had seen and loved.",
    "Humphrey Bogart lived here in the mid-1920s alongside silent-film stars Lillian Gish, Gloria Swanson, and Rosalind Russell — the lane became an unofficial actors' colony because the cheap rents and total seclusion suited performers who worked nights.",
    "The complex is accessed only through two unmarked iron gates (one on W 94th St, one on W 95th St); there is no street signage of any kind, and most people who have lived on the block for years have never seen inside."
  ],
  "latitude": 40.79385,
  "longitude": -73.97419,
  "address": "261 W 94th St, Manhattan",
  "confidence": "high"
}

Return ${placeCount} places. Quality beats quantity — if you can only find 6 places with genuinely strong, specific stories, return 6 rather than padding with weak entries. Keep all results within the immediate area (geographic filtering is applied automatically). Every fact should feel like a local secret — the kind of thing that makes someone stop on the sidewalk and look up.`;

  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    response = await openai.chat.completions.create({
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
    });
  } catch (err: any) {
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    res.status(status).json({ error: "Discovery service temporarily unavailable. Please try again." });
    return;
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
    // Skip Nominatim verification on the critical path — it adds ~1 s per place
    // sequentially. Process synchronously (validate, distance-filter, dedup, vague-
    // filter), respond to the client immediately, then verify coordinates in the
    // background and update the cache so the NEXT request for this area gets corrected
    // pins. For the current caller the coordinates from GPT-4.1 are accurate enough.
    data.places = await postProcessPlaces(data.places, latitude, longitude, searchRadius, {
      skipVerification: true,
    });
    // Fetch Wikipedia photos in parallel for all places. Runs concurrently with
    // ratings enrichment (below) and races a wall-clock timeout so it never
    // materially slows down a response that's already taken time for LLM calls.
    await fetchPhotosForPlaces(data.places);
  }

  // Cache zero-result responses for only 2 min so the user can retry after moving slightly.
  // Normal results get the full 15-min TTL.
  const isEmpty = !Array.isArray(data.places) || data.places.length === 0;
  if (isEmpty) {
    const SHORT_TTL_MS = 2 * 60 * 1000;
    llmCache.set(discoverCacheKey, {
      data,
      timestamp: Date.now() - (LLM_CACHE_TTL - SHORT_TTL_MS),
    });
  } else {
    setLLMCache(discoverCacheKey, data);
  }

  if (Array.isArray(data.places) && data.places.length > 0) {
    const ratingsMap = await fetchRatingsMap(data.places);
    applyRatingSortWithMap(data.places, ratingsMap);
  }
  res.json(data);

  // Background: run Nominatim verification and silently update the cache so the
  // next request for this block gets corrected pin positions. We only do this for
  // non-empty results — no point verifying an empty set.
  if (!isEmpty) {
    (async () => {
      try {
        await verifyPlaceCoordinates(data.places);
        // Re-filter: a corrected coordinate might have moved a place outside radius.
        const maxDist = searchRadius * 1.10;
        data.places = data.places.filter(
          (p: any) => haversineDistance(latitude, longitude, p.latitude, p.longitude) <= maxDist,
        );
        setLLMCache(discoverCacheKey, data);
      } catch {
        // Verification failure is non-fatal — cached unverified result is still valid.
      }
    })();
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
  const suggestCacheKey = `suggest:${query.trim().toLowerCase()}|near:${nearTrimmed.toLowerCase()}`;
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
  const shouldTryNominatim = nearTrimmed.length > 0 || query.trim().length >= 15;

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
        nominatimResults = await nominatimSearch(query, 5, { viewbox, bounded: "1" });
        // If viewbox search yields nothing useful, fall back to free-text with city context.
        if (nominatimResults.length === 0) {
          nominatimResults = await nominatimSearch(`${query}, ${nearTrimmed}`, 5);
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
    ...(Array.isArray(llmData?.suggestions) ? llmData.suggestions : []).slice(0, 5 - nominatimSuggestions.length),
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

  const geocodeCacheKey = `geocode:${query.trim().toLowerCase()}`;
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
    res.status(status).json({ error: "Geocoding service temporarily unavailable. Please try again." });
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

  const cacheKey = `revgeo:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
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
    const data = await resp.json() as Record<string, any>;
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
  const { address, latitude: providedLat, longitude: providedLng } = parsed.data;
  const trimmedAddress = address.trim();

  // Geocode if no coords supplied. Use Nominatim — authoritative for real addresses.
  let lat = providedLat;
  let lng = providedLng;
  let canonicalAddress = trimmedAddress;
  if (typeof lat !== "number" || typeof lng !== "number") {
    // Respect Nominatim's 1 req/sec rate limit (shared global counter).
    const now = Date.now();
    const wait = NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimCallAt = Date.now();
    const results = await nominatimSearch(trimmedAddress, 1, { addressdetails: "1" });
    if (results.length === 0) {
      res.status(404).json({
        error:
          "Couldn't find that address. Try including a city or zip (e.g., '538 W 38th St, New York, NY').",
      });
      return;
    }
    const r = results[0];
    lat = parseFloat(r.lat);
    lng = parseFloat(r.lon);
    canonicalAddress = formatNominatimDisplayName(r.display_name) || trimmedAddress;
  }

  // Cache key: normalized address + coord bucket. Investigations are deterministic
  // per-building so a longer TTL is fine; share the LLM cache.
  const investigateCacheKey = `investigate:${trimmedAddress.toLowerCase()}:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = getLLMCache(investigateCacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  // Pull a small ring of nearby OSM landmarks for neighborhood context.
  // Keep the radius tight (120m) so the AI doesn't drift to famous landmarks
  // a few blocks away — the whole point is to focus on THIS building.
  let osmContext = "";
  try {
    const nearby = await fetchNearbyOSMPlaces(lat, lng, 120);
    if (nearby.length > 0) {
      osmContext = nearby
        .slice(0, 8)
        .map((p) => {
          const dist = Math.round(haversineDistance(lat, lng, p.lat, p.lon));
          const built = p.tags["start_date"] || p.tags["construction_date"] || "";
          return `- ${p.name} (${p.type}${built ? `, built ${built}` : ""}, ${dist}m away)`;
        })
        .join("\n");
    }
  } catch {
    // Non-fatal — proceed without OSM context.
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
2. BE HONEST ABOUT UNCERTAINTY. If you don't know specific details about THIS building, say so in the "uncertainty" field. Use phrases like "based on the era and neighborhood" or "typical for this block" rather than inventing names, dates, or owners. NEVER invent a person's name (e.g. "Samuel Hewitt") to make a story sound authoritative.
3. PRIORITIZE PHYSICAL EVIDENCE the user could verify by looking: brick patterns, ghost signs, segmental arch windows, corbeled cornices, loading bay openings, hayloft doors, horse-stall ventilation, original signage, etc. Tell them what to LOOK FOR.
4. Use neighborhood and era to reason about likely original use. A wide ground-floor opening with a hayloft door above on a side street between 10th and 11th in the 1880s-1890s = almost certainly a livery stable. Be confident about TYPE inferences from physical/contextual evidence; be cautious about specific NAMES, OWNERS, and DATES.
5. If the building is currently a livery stable for Central Park horses, NYC carriage horse stables, or similar working horse facility, MENTION THAT — it's a continuity worth highlighting.

Respond in JSON:
{
  "buildingName": "Common name if known, else empty string",
  "yearBuilt": "Year/era like '1887' or 'late 1880s', or empty string if unknown",
  "architecturalStyle": "Style + concrete details to look for (e.g., 'Romanesque Revival brick — segmental-arch windows, corbeled cornice, wide ground-floor stable doorway')",
  "originalUse": "What it was originally built for (1-2 sentences, evidence-based)",
  "currentUse": "What it appears to be today (1 sentence)",
  "history": "2-3 paragraph rich narrative about THIS specific building. Tie to neighborhood history. If you must speculate, frame it ('Buildings like this typically...', 'Records from the era suggest...').",
  "facts": ["4-6 specific facts. Mark speculation with 'likely' / 'typical of'. Each fact should be something the user could verify or look for."],
  "neighborhoodContext": "How this building fits into the historical fabric of THIS block (1-2 sentences)",
  "uncertainty": "Honest disclosure of what's unknown vs documented. Empty string only if you have high confidence in everything stated."
}`,
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
    res.status(status).json({ error: "Investigation service temporarily unavailable. Please try again." });
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

  const result = {
    address: canonicalAddress,
    latitude: lat,
    longitude: lng,
    buildingName: typeof data.buildingName === "string" ? data.buildingName : "",
    yearBuilt: typeof data.yearBuilt === "string" ? data.yearBuilt : "",
    architecturalStyle: typeof data.architecturalStyle === "string" ? data.architecturalStyle : "",
    originalUse: typeof data.originalUse === "string" ? data.originalUse : "",
    currentUse: typeof data.currentUse === "string" ? data.currentUse : "",
    history: typeof data.history === "string" ? data.history : "",
    facts: Array.isArray(data.facts) ? data.facts.filter((f: unknown) => typeof f === "string") : [],
    neighborhoodContext: typeof data.neighborhoodContext === "string" ? data.neighborhoodContext : "",
    uncertainty: typeof data.uncertainty === "string" ? data.uncertainty : "",
  };

  setLLMCache(investigateCacheKey, result);
  res.json(result);
});

router.post("/explore/place-detail", async (req, res) => {
  const parsed = GetPlaceDetailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { placeName, latitude, longitude, category } = parsed.data;

  const detailCacheKey = `detail:${placeName.toLowerCase()}:${(category || "place").toLowerCase()}:${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cachedDetail = getLLMCache(detailCacheKey);
  if (cachedDetail) {
    res.json(cachedDetail);
    return;
  }

  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `You are a hyper-local urban historian who specializes in obscure, overlooked details. Provide rich, deeply specific information about this place — the kind of details you'd only learn from a longtime local or a historian who's spent years researching this specific block.

Focus on:
- What was on this exact spot before the current structure
- Obscure architectural details and why they're there
- Minor historical figures connected to this place
- Neighborhood-level stories and forgotten events
- How the surrounding block has changed over the decades
- Anything surprising, weird, or counterintuitive about this place

AVOID generic Wikipedia-style overviews. Go deep and specific.

Respond in JSON format:
{
  "name": "Place Name",
  "fullHistory": "A rich 2-3 paragraph narrative focusing on obscure, lesser-known history. What was here before? Who lived or worked here? What forgotten events happened on this spot? Make the reader feel like they're uncovering a secret.",
  "architecturalStyle": "Specific architectural details — not just 'Art Deco' but what specific elements to look for, unusual features, or what the design choices reveal about the era",
  "notableEvents": ["Specific obscure event with year", "Another lesser-known event"],
  "funFacts": ["Hyper-specific fact 1", "Surprising detail 2", "Hidden detail 3", "Local secret 4"],
  "nearbyRelated": ["Related nearby obscure place 1", "Related nearby obscure place 2"]
}

Every detail should feel like a local secret worth knowing.`,
        },
        {
          role: "user",
          content: `Tell me everything interesting about "${placeName}" (${category || "place"}) located near ${latitude}, ${longitude}`,
        },
      ],
      response_format: { type: "json_object" },
    });
  } catch (err: any) {
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    res.status(status).json({ error: "Place detail service temporarily unavailable. Please try again." });
    return;
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    res.status(500).json({ error: "Failed to generate place details" });
    return;
  }

  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    res.status(500).json({ error: "Failed to parse place detail results" });
    return;
  }
  const photoUrl = await fetchWikipediaPhoto(placeName);
  if (photoUrl) {
    data.photoUrl = photoUrl;
  }
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

  const timelineCacheKey = `timeline:${placeName.toLowerCase()}:${(category || "place").toLowerCase()}:${yearBuilt || ""}:${latitude.toFixed(4)},${longitude.toFixed(4)}`;
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

For each era, paint a vivid picture:
- What did the building/space physically look like? Materials, colors, signage, condition
- What was the street life like? Who walked past? What sounds and smells?
- What was the building being used for? By whom?
- What was the neighborhood context? Was it thriving, declining, transforming?

QUALITY RULES:
- Include specific years, names, and verifiable details in every era
- Make each era feel cinematically different — the reader should sense the passage of time
- Don't repeat the same information across eras
- Start from the earliest relevant period (before the current structure if possible)
- End with the present day
- The "atmosphere" field should read like a line from a novel — sensory, evocative, specific
- The "visualDescription" should be what a time-traveler would see looking at this exact spot
- If uncertain about specific details, use phrases like "likely" or "according to local accounts"

Respond in JSON format:
{
  "placeName": "Place Name",
  "eras": [
    {
      "period": "1850s-1870s",
      "title": "Short evocative era title (e.g., 'Before the Building', 'The Gilded Age', 'Wartime')",
      "description": "2-3 sentences describing what was happening here during this period. Be vivid and specific.",
      "visualDescription": "1-2 sentences describing exactly what you'd see standing here in this era. Architecture, signage, street activity, materials.",
      "keyFigures": ["Specific person's name and their connection to this place"],
      "atmosphere": "One sensory, evocative sentence — what it felt like to be here. Like a line from a novel."
    }
  ]
}

Create 4-6 eras spanning the full history. Each era should feel distinct and alive.`,
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
    res.status(status).json({ error: "Timeline service temporarily unavailable. Please try again." });
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
      (era: any) => era.period && era.title && era.description && era.atmosphere,
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
  const parsed = GetWalkNarrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { placeName, category, summary, fact } = parsed.data;

  const narrationCacheKey = `narration:${placeName.toLowerCase()}|${(category || "").toLowerCase()}|${summary.slice(0, 80).toLowerCase()}|${(fact || "").slice(0, 80).toLowerCase()}`;
  const cachedNarration = getLLMCache<{ narration: string }>(narrationCacheKey);
  if (cachedNarration) {
    res.json(cachedNarration);
    return;
  }

  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      max_completion_tokens: 256,
      messages: [
        {
          role: "system",
          content: `You are a warm, engaging walking tour guide. Your narrations will be read aloud by a text-to-speech engine, so write for the EAR, not the eye.

Rules for natural-sounding speech:
- Use short, punchy sentences. Break long thoughts with commas and pauses.
- Write how people actually talk: contractions (it's, don't, you'll), casual phrasing, little asides.
- Add natural pause points with commas, dashes, and ellipses — the TTS engine uses these for breathing room.
- Vary sentence length. Mix short "punchy" lines with slightly longer ones.
- Start with something attention-grabbing — "So this building right here..." or "Okay, check this out..." or "See that detail up there?"
- Avoid lists, bullet points, numbers, abbreviations, or anything that sounds weird read aloud (e.g., say "eighteen ninety" not "1890", "around nineteen twenty" not "circa 1920").
- Never use quotes, asterisks, parentheses, or any formatting.
- Keep it to 2-3 sentences. Like a friend nudging your arm and pointing something out.
- End with something that makes them look or think — not a generic "isn't that cool?"`,
        },
        {
          role: "user",
          content: `I'm walking past "${placeName}" (${category || "place"}). Here's what's interesting: ${summary}${fact ? ` Also: ${fact}` : ""}. Give me a brief, natural narration.`,
        },
      ],
    });
  } catch (err: any) {
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    res.status(status).json({ error: "Narration service temporarily unavailable. Please try again." });
    return;
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    res.status(500).json({ error: "Failed to generate narration" });
    return;
  }

  const result = { narration: content.trim() };
  setLLMCache(narrationCacheKey, result);
  res.json(result);
});

router.post("/explore/deep-narration", async (req, res) => {
  const parsed = GetWalkNarrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { placeName, category, summary, fact } = parsed.data;
  const yearBuilt = typeof (req.body as any)?.yearBuilt === "string" ? (req.body as any).yearBuilt : undefined;

  const deepCacheKey = `deep-narration:${placeName.toLowerCase()}|${(category || "").toLowerCase()}|${(yearBuilt || "").toLowerCase()}|${summary.slice(0, 80).toLowerCase()}|${(fact || "").slice(0, 80).toLowerCase()}`;
  const cachedDeep = getLLMCache<{ narration: string }>(deepCacheKey);
  if (cachedDeep) {
    res.json(cachedDeep);
    return;
  }

  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 700,
      messages: [
        {
          role: "system",
          content: `You are a knowledgeable, captivating walking-tour guide doing a longer-form deep dive on a single place. Your narration will be read aloud by a text-to-speech engine while someone walks toward the place, so write for the EAR.

Rules for natural-sounding speech:
- Total length: roughly 150 to 220 words (about 60 to 90 seconds when spoken).
- Open with a hook — a vivid scene, a surprising fact, a question, or a sensory detail.
- Cover, in your own narrative flow: when it was built and why, who built or used it, one or two specific human stories or events tied to it, what makes it architecturally or culturally distinctive, and how it fits into the surrounding neighborhood today.
- Be honest: if you're uncertain, frame as "Local lore holds that..." or "Historians believe..." rather than invent specifics.
- Use short and medium sentences. Mix rhythms. Use commas, dashes, and ellipses for breathing room.
- Use contractions and casual phrasing. No lists, no bullets, no headings, no quotes, no parentheses, no asterisks.
- Spell out years and numbers as words a TTS engine will pronounce well (e.g. "eighteen ninety-two" not "1892", "around nineteen twenty" not "circa 1920").
- End with something to look at, notice, or reflect on as the listener arrives.`,
        },
        {
          role: "user",
          content: `Give me a deep-dive narration for "${placeName}"${category ? ` (a ${category})` : ""}${yearBuilt ? `, dating to roughly ${yearBuilt}` : ""}.\n\nWhat we already know: ${summary}${fact ? `\nAlso noted: ${fact}` : ""}\n\nWrite the spoken narration only — no preamble, no closing remarks.`,
        },
      ],
    });
  } catch (err: any) {
    const status = err?.status === 429 ? 429 : err?.status >= 500 ? 503 : 500;
    res.status(status).json({ error: "Deep narration service temporarily unavailable. Please try again." });
    return;
  }

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
  { name: "fossgis-foot", base: "https://routing.openstreetmap.de/routed-foot" },
  { name: "osrm-demo", base: "https://router.project-osrm.org" },
] as const;
const PROVIDER_TIMEOUT_MS = 4500;

interface OsrmResponse {
  routes?: Array<{
    geometry: { coordinates: [number, number][] };
    distance: number;
    duration: number;
  }>;
}

async function fetchRouteFromProvider(
  base: string,
  coords: string,
): Promise<OsrmResponse | null> {
  const url = `${base}/route/v1/foot/${coords}?overview=full&geometries=geojson`;
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
    ...safeWaypoints.map((w: { latitude: number; longitude: number }) => ({ lat: w.latitude, lng: w.longitude })),
    { lat: end.latitude, lng: end.longitude },
  ];

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");

  let json: OsrmResponse | null = null;
  let providerUsed: string | null = null;
  for (const provider of OSRM_PROVIDERS) {
    json = await fetchRouteFromProvider(provider.base, coords);
    if (json?.routes?.[0]) {
      providerUsed = provider.name;
      break;
    }
  }

  if (!json) {
    res.status(502).json({ error: "Routing service unavailable" });
    return;
  }

  const route = json.routes?.[0];
  if (!route) {
    res.status(404).json({ error: "No walking route could be found between those points" });
    return;
  }

  const geometry = route.geometry.coordinates.map(
    ([lng, lat]) => [lat, lng] as [number, number],
  );

  res.setHeader("X-Routing-Provider", providerUsed ?? "unknown");
  res.json({
    geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
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

  const projected = geometry.map(([la, ln]) => projectToMeters(la, ln, originLat, originLng));
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
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [la, ln] of geometry) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (ln < minLng) minLng = ln;
    if (ln > maxLng) maxLng = ln;
  }
  const latPad = paddingMeters / 111320;
  const lngPad = paddingMeters / (111320 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180));
  return {
    south: minLat - latPad,
    west: minLng - lngPad,
    north: maxLat + latPad,
    east: maxLng + lngPad,
  };
}

async function fetchOSMPlacesInBoundingBox(bbox: {
  south: number; west: number; north: number; east: number;
}): Promise<OSMPlace[]> {
  const { south, west, north, east } = bbox;
  const query = `
[out:json][timeout:10];
(
  nwr["historic"](${south},${west},${north},${east});
  nwr["heritage"](${south},${west},${north},${east});
  nwr["tourism"~"^(attraction|artwork|memorial|museum|gallery|viewpoint|hotel)$"](${south},${west},${north},${east});
  nwr["name"]["building"](${south},${west},${north},${east});
  nwr["name"]["landuse"~"^(industrial|railway)$"](${south},${west},${north},${east});
  nwr["amenity"~"^(theatre|library|cinema|townhall|courthouse|university|college|school|place_of_worship|marketplace)$"]["name"](${south},${west},${north},${east});
  nwr["memorial"](${south},${west},${north},${east});
  nwr["man_made"~"^(tower|bridge|obelisk|water_tower|lighthouse)$"]["name"](${south},${west},${north},${east});
);
out center body 250;
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const resp = await fetch(OVERPASS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "UrbanExplorer/1.0 (walking-tour app)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return [];

    const json = (await resp.json()) as { elements?: any[] };
    if (!json.elements) return [];

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
        el.tags?.man_made ||
        "place";
      results.push({
        name,
        lat: elLat,
        lon: elLon,
        type: osmType === "yes" ? "building" : osmType,
        tags: el.tags || {},
      });
    }
    return results;
  } catch {
    clearTimeout(timeout);
    return [];
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
      Array.isArray(c) && c.length === 2 && typeof c[0] === "number" && typeof c[1] === "number",
  );
  if (geom.length < 2) {
    res.status(400).json({ error: "Route geometry must have at least 2 valid coordinate pairs" });
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
  const cacheKey = `places-route:${sig.join("|")}:${corridor}:${cap}`;
  const cached = getLLMCache<{ places: any[] }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const osmPlaces = await fetchOSMPlacesInBoundingBox(bbox);
  logger.info({ geomPoints: geom.length, corridorM: corridor, osmPlaces: osmPlaces.length }, "[places-along-route] OSM fetch");

  const candidates = osmPlaces
    .map((p) => {
      const { distance, progress } = pointToRouteDistance(geom, p.lat, p.lon);
      return { place: p, offsetMeters: Math.round(distance), progressMeters: Math.round(progress) };
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
  logger.info({ candidates: candidates.length, spaced: spaced.length, final: finalCandidates.length }, "[places-along-route] filtered");

  if (finalCandidates.length === 0) {
    res.json({ places: [] });
    return;
  }

  const formatCandidateLine = (c: typeof finalCandidates[number], i: number) => {
    const t = c.place.tags;
    const details: string[] = [];
    if (t["addr:street"]) {
      const num = sanitizeOSMText(t["addr:housenumber"] || "", 10);
      const street = sanitizeOSMText(t["addr:street"], 60);
      details.push(`address: ${num} ${street}`.trim());
    }
    if (t.start_date) details.push(`built: ${sanitizeOSMText(t.start_date, 20)}`);
    if (t.architect) details.push(`architect: ${sanitizeOSMText(t.architect, 60)}`);
    if (t.heritage) details.push(`heritage site`);
    if (t.historic) details.push(`historic: ${sanitizeOSMText(t.historic, 30)}`);
    const extra = details.length ? ` (${details.join(", ")})` : "";
    return `  ${i + 1}. "${sanitizeOSMText(c.place.name, 100)}" [${sanitizeOSMText(c.place.type, 30)}] at ${c.place.lat.toFixed(5)},${c.place.lon.toFixed(5)}${extra}`;
  };

  const systemPrompt = `You are a hyper-local urban historian writing brief, vivid blurbs for a walking tour app.

You will be given a list of REAL places (verified from OpenStreetMap) along a planned walking route. For EACH place, write a captivating one-sentence summary and 2 specific historical facts.

QUALITY STANDARDS:
- Each fact MUST include a year, person's name, or concrete verifiable detail
- Avoid generic statements like "has rich history" or "notable building"
- Be honest: if you're uncertain, frame as "Local lore holds that..." rather than invent
- Use the EXACT name and coordinates provided — do not rename or move places

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
      let chunkPlaces: any[] = [];
      try {
        const parsedChunk = JSON.parse(c);
        chunkPlaces = Array.isArray(parsedChunk.places) ? parsedChunk.places : [];
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

  const failedChunks = chunkResults.filter((r) => r.status === "rejected").length;
  if (failedChunks > 0) {
    logger.warn({ failedChunks, total: chunks.length }, "[places-along-route] some LLM chunks failed — affected places will use OSM fallback names");
  }
  // If every chunk failed, return a graceful error rather than an empty/fallback-only list
  if (failedChunks === chunks.length && chunks.length > 0) {
    res.status(503).json({ error: "Route narration temporarily unavailable. Please try again." });
    return;
  }
  logger.info({ chunks: chunks.length, durationMs: Date.now() - t0, failedChunks }, "[places-along-route] LLM complete");

  // Match LLM output back to candidates by position (same order); fall back to nearest by name
  const enriched = finalCandidates.map((c, i) => {
    const llm = llmPlaces[i] || {};
    return {
      id: typeof llm.id === "string" && llm.id ? llm.id : `route-place-${i}-${Math.round(c.place.lat * 1e4)}-${Math.round(c.place.lon * 1e4)}`,
      name: c.place.name,
      category: typeof llm.category === "string" ? llm.category : c.place.type,
      yearBuilt: typeof llm.yearBuilt === "string" ? llm.yearBuilt : undefined,
      tags: Array.isArray(llm.tags) ? llm.tags.slice(0, 4) : undefined,
      summary:
        typeof llm.summary === "string" && llm.summary.trim().length > 0
          ? llm.summary.trim()
          : `A notable ${c.place.type} along your route.`,
      facts: Array.isArray(llm.facts) && llm.facts.length > 0
        ? llm.facts.slice(0, 3).map(String)
        : ["A real place verified on OpenStreetMap, but we don't have detailed history yet."],
      latitude: c.place.lat,
      longitude: c.place.lon,
      address: typeof llm.address === "string" && llm.address ? llm.address : undefined,
      progressMeters: c.progressMeters,
      offsetMeters: c.offsetMeters,
    };
  });

  const result = { places: enriched };
  setLLMCache(cacheKey, result);
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /explore/rate-place — submit a thumbs-up or thumbs-down for a place
// ---------------------------------------------------------------------------

const RATE_PLACE_WINDOW_MS = 15 * 60 * 1000;
const RATE_PLACE_LIMIT = 20;
const RATE_PLACE_MESSAGE = { error: "Too many rating requests. Please wait a few minutes before trying again." };

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
    return `device:${deviceId.trim()}`;
  },
  validate: { keyGeneratorIpFallback: false },
  store: new PgRateLimitStore(),
});

router.post("/explore/rate-place", ratePlaceIpLimiter, ratePlaceDeviceLimiter, async (req, res) => {
  const parsed = RatePlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { placeId, placeName, category, latitude, longitude, rating, previousRating } = parsed.data;
  const userId = req.isAuthenticated() ? req.user.id : null;

  const upDelta = (rating === "up" ? 1 : 0) - (previousRating === "up" ? 1 : 0);
  const downDelta = (rating === "down" ? 1 : 0) - (previousRating === "down" ? 1 : 0);

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

  if (userId) {
    await db
      .insert(userPlaceRatings)
      .values({ userId, placeId, rating, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [userPlaceRatings.userId, userPlaceRatings.placeId],
        set: { rating, updatedAt: new Date() },
      });
  }

  res.json({ ok: true, placeId, up: updated.up, down: updated.down });
});

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
    .select({ placeId: userPlaceRatings.placeId, rating: userPlaceRatings.rating })
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
router.get("/explore/ratings", async (_req, res) => {
  const rows = await db.select().from(placeRatings);
  const entries = rows
    .map((e) => ({ ...e, lastRatedAt: e.lastRatedAt.toISOString(), netScore: e.up - e.down }))
    .sort((a, b) => b.netScore - a.netScore);

  res.json({ ratings: entries, total: entries.length });
});

export default router;
