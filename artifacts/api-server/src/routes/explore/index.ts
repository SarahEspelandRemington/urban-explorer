import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  DiscoverPlacesBody,
  GeocodeLocationBody,
  GetPlaceDetailBody,
  GetPlaceTimelineBody,
  GetWalkNarrationBody,
  SuggestLocationsBody,
} from "@workspace/api-zod";

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
  nwr["name"]["building"~"^(church|cathedral|chapel|mosque|synagogue|temple|civic|public|commercial|industrial|warehouse|train_station|hotel)$"](around:${r},${lat},${lng});
  nwr["name"]["landuse"~"^(religious|cemetery)$"](around:${r},${lat},${lng});
  nwr["memorial"](around:${r},${lat},${lng});
);
out center body 25;
`;
  const controller = new AbortController();
  const abortTimeout = quickMode ? 5000 : 6000;
  const timeout = setTimeout(() => controller.abort(), abortTimeout);

  try {
    const resp = await fetch(OVERPASS_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

    const finalResults = results.slice(0, 25);
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

function postProcessPlaces(places: any[], userLat: number, userLng: number, searchRadius: number): any[] {
  const validConfidence = new Set(["high", "medium", "low"]);
  const maxDist = searchRadius * 1.25;

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

  processed.sort((a: any, b: any) => a.distanceMeters - b.distanceMeters);

  return processed;
}

router.post("/explore/discover", async (req, res) => {
  const parsed = DiscoverPlacesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { latitude, longitude, radius, mode } = parsed.data;
  const rawHint = typeof req.body.addressHint === "string" ? req.body.addressHint.trim() : "";
  const addressHint = rawHint ? sanitizeOSMText(rawHint, 200) : "";
  const isQuick = mode === "quick";
  const searchRadius = radius ?? (isQuick ? 500 : 300);

  const radiusFeet = Math.round(searchRadius * 3.281);

  const locationContext = addressHint
    ? `\nThe user's device reports they are near: ${addressHint}. Use this as a geographic anchor.`
    : "";

  const discoverCacheKey = `${mode}:${searchRadius}:${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cachedDiscover = getLLMCache(discoverCacheKey);
  if (cachedDiscover) {
    res.json(cachedDiscover);
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

  const placeCount = isQuick ? "8-12" : "5-7";
  const factCount = isQuick ? 2 : 3;
  const modelName = isQuick ? "gpt-4.1-mini" : "gpt-5.2";
  const maxTokens = isQuick ? 3000 : 4096;

  const systemPrompt = `You are a hyper-local urban historian who specializes in obscure, overlooked, and forgotten stories about specific streets, buildings, and spaces. You know the kind of details that only longtime residents, local historians, or architecture nerds would know.

Given GPS coordinates, identify real places WITHIN ${radiusFeet} FEET (roughly ${searchRadius} meters) of the exact coordinates. Think small and specific:

PRIORITIZE these kinds of places (in rough order of interest):
1. The specific building at or near the coordinates — who built it, who commissioned it, what was there before, any quirky history
2. Small architectural details people walk past every day without noticing — cornerstones with dates, old signage painted on brick (ghost signs), unusual brickwork patterns, terra cotta ornaments, decorative ironwork, faded advertisements
3. Former sites — "this used to be a speakeasy / fire station / boarding house / vaudeville theater / immigrant social club"
4. Local stories with names, dates, and specifics — not "there was a neighborhood feud" but "in 1923, the building owner John Rinaldi refused to sell to the subway authority, forcing the tunnel to curve around his basement"
5. Odd infrastructure — old hitching posts, embedded trolley tracks, mysterious plaques, sealed-off subway entrances, converted buildings with visible remnants of their past use
6. Small parks, alleys, or pocket spaces with hidden histories

AVOID these:
- Major tourist landmarks that appear in guidebooks (e.g., Statue of Liberty, Golden Gate Bridge, Empire State Building, Times Square as a destination)
- Places more than ${radiusFeet} feet away — stay extremely local
- Generic descriptions that could apply to any old building in any city. BAD: "This building has a rich history." GOOD: "The carved stone face above the third-floor window is a portrait of the building's architect, who hid his own likeness in all his projects."
- Well-known museums, famous monuments, or top-10 lists
- Descriptions that are mostly about the neighborhood in general rather than the specific place

QUALITY STANDARDS FOR FACTS:
- Every fact MUST include at least one of: a specific year/decade, a person's name, a verifiable detail (address, building material, style name), or a concrete event
- BAD fact: "This building has seen many changes over the years"
- GOOD fact: "The Italianate cornice was added in 1887 when dry goods merchant Samuel Hewitt converted the ground floor from a livery stable to a department store"
- Each place should have ${factCount} genuinely distinct facts, not restatements of the same point

COORDINATE ACCURACY IS CRITICAL:
- Use precise coordinates to 5 decimal places (±1 meter accuracy)
- For known addresses, use the exact building coordinates
- For intersections, use the exact intersection point
- For blocks or stretches, use the midpoint of that stretch
- Always include a real street address or intersection in the "address" field — this helps users navigate
- The coordinates and address MUST agree with each other. Do not give coordinates in one location and an address in a different location.

HONESTY RULE: If you are uncertain whether a place or fact is real, say so in the fact itself (e.g., "Local lore holds that..." or "According to neighborhood accounts..."). Never present uncertain claims as established fact. It is far better to share fewer places with genuine, verifiable details than to pad the list with invented stories.

If you genuinely cannot identify specific obscure places at these exact coordinates, focus on the immediate block or intersection: the architectural style of the buildings right there, what the neighborhood looked like 50 or 100 years ago, what businesses or residents occupied the exact spot historically.

Respond in JSON format:
{
  "location": "Very specific area description (e.g., 'Corner of Bleecker & MacDougal, Greenwich Village' or '400 block of S Main St, downtown')",
  "places": [
    {
      "id": "unique-kebab-case-id",
      "name": "Place Name — use the real or historical name, not a generic label",
      "category": "building|storefront|alley|corner|mural|infrastructure|former site|architectural detail|park|church|residential",
      "yearBuilt": "1920s" or "circa 1850" or "unknown",
      "tags": ["2-4 descriptive tags like: ghost sign, speakeasy, art deco, industrial, immigrant history, prohibition era, jazz age, tenement, waterfront, transit, religious, commercial, residential, demolished, converted, landmarked"],
      "summary": "One captivating sentence that makes this specific place sound like a secret worth knowing. Include the most surprising or vivid detail.",
      "facts": ["Fact with a specific year, name, or verifiable detail", "A second distinct fact", "A third distinct fact"],
      "latitude": precise_lat_to_5_decimal_places,
      "longitude": precise_lng_to_5_decimal_places,
      "address": "Nearest real street address or intersection (e.g., '157 W 48th St' or 'W 48th St & 8th Ave')",
      "confidence": "high|medium|low"
    }
  ]
}

Return ${placeCount} places. Every place MUST be within ${radiusFeet} feet. Every fact should feel like a local secret — the kind of thing that makes someone stop on the sidewalk and look up.`;

  const response = await openai.chat.completions.create({
    model: modelName,
    max_completion_tokens: maxTokens,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `I'm standing at exactly ${latitude}, ${longitude}. What obscure, overlooked, or forgotten history is within ${radiusFeet} feet of me right now?${locationContext}${osmContext}`,
      },
    ],
    response_format: { type: "json_object" },
  });

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
    data.places = postProcessPlaces(data.places, latitude, longitude, searchRadius);
  }

  setLLMCache(discoverCacheKey, data);
  res.json(data);
});

router.post("/explore/suggest-locations", async (req, res) => {
  const parsed = SuggestLocationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { query } = parsed.data;

  if (query.trim().length < 2) {
    res.json({ suggestions: [] });
    return;
  }

  const suggestCacheKey = `suggest:${query.trim().toLowerCase()}`;
  const cachedSuggest = getLLMCache(suggestCacheKey);
  if (cachedSuggest) {
    res.json(cachedSuggest);
    return;
  }

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

Return exactly 5 suggestions. Each name should be specific enough to geocode. Keep descriptions under 10 words.`,
      },
      {
        role: "user",
        content: `Suggest locations matching: "${query}"`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    res.json({ suggestions: [] });
    return;
  }

  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    res.json({ suggestions: [] });
    return;
  }
  setLLMCache(suggestCacheKey, data);
  res.json(data);
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

  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    res.status(500).json({ error: "Failed to parse geocode results" });
    return;
  }
  setLLMCache(geocodeCacheKey, data);
  res.json(data);
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

  const response = await openai.chat.completions.create({
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

  const response = await openai.chat.completions.create({
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

  const response = await openai.chat.completions.create({
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

  const content = response.choices[0]?.message?.content;
  if (!content) {
    res.status(500).json({ error: "Failed to generate narration" });
    return;
  }

  res.json({ narration: content.trim() });
});

export default router;
