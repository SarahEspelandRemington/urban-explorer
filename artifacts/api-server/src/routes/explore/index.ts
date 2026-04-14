import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  DiscoverPlacesBody,
  GeocodeLocationBody,
  GetPlaceDetailBody,
  SuggestLocationsBody,
} from "@workspace/api-zod";

const router = Router();

router.post("/explore/discover", async (req, res) => {
  const parsed = DiscoverPlacesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { latitude, longitude, radius } = parsed.data;
  const addressHint = typeof req.body.addressHint === "string" ? req.body.addressHint.trim() : "";
  const searchRadius = radius ?? 300;

  const radiusFeet = Math.round(searchRadius * 3.281);

  const locationContext = addressHint
    ? `\n\nThe user's device reports they are near: ${addressHint}. This is from real GPS + map data, so treat it as ground truth. All places you return MUST be on or immediately adjacent to these streets, within a 1-2 block radius at most. Do NOT place results in other neighborhoods.`
    : "";

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are a hyper-local urban historian who specializes in obscure, overlooked, and forgotten stories about specific streets, buildings, and spaces. You know the kind of details that only longtime residents, local historians, or architecture nerds would know.${locationContext}

Given GPS coordinates, identify real places WITHIN ${radiusFeet} FEET (roughly ${searchRadius} meters) of the exact coordinates. Think small and specific:

PRIORITIZE these kinds of places:
- The specific building at or near the coordinates — who built it, what was there before, any quirky history
- Small architectural details people walk past every day without noticing (cornerstones, old signage, unusual brickwork, ghost signs, terra cotta ornaments)
- Former sites — "this used to be a speakeasy / fire station / boarding house"
- Local stories — neighborhood feuds, forgotten events, minor historical figures who lived on that block
- Odd infrastructure — old hitching posts, embedded trolley tracks, mysterious plaques, sealed-off tunnels, converted buildings
- Small parks, alleys, or pocket spaces with hidden histories

AVOID these:
- Major tourist landmarks that everyone already knows (e.g., Statue of Liberty, Golden Gate Bridge, Empire State Building)
- Places more than ${radiusFeet} feet away — stay extremely local
- Generic descriptions that could apply anywhere
- Well-known museums, famous monuments, or guidebook staples

COORDINATE ACCURACY IS CRITICAL:
- Use precise coordinates to 5 decimal places (±1 meter accuracy)
- For known addresses, use the exact building coordinates
- For intersections, use the exact intersection point
- For blocks or stretches, use the midpoint of that stretch
- Always include a real street address or intersection in the "address" field — this helps users navigate

If you genuinely cannot identify specific obscure places at these exact coordinates, focus on the immediate block or intersection: the architectural style of the buildings right there, what the neighborhood looked like 50 or 100 years ago, what businesses or residents occupied the exact spot historically.

Respond in JSON format:
{
  "location": "Very specific area description (e.g., 'Corner of Bleecker & MacDougal, Greenwich Village' or '400 block of S Main St, downtown')",
  "places": [
    {
      "id": "unique-kebab-case-id",
      "name": "Place Name",
      "category": "building|storefront|alley|corner|mural|infrastructure|former site|architectural detail|park|church|residential",
      "yearBuilt": "1920s" or "circa 1850" or "unknown",
      "tags": ["2-4 descriptive tags like: ghost sign, speakeasy, art deco, industrial, immigrant history, prohibition era, jazz age, tenement, waterfront, transit, religious, commercial, residential, demolished, converted, landmarked"],
      "summary": "One-line captivating description — make it feel like a secret worth knowing",
      "facts": ["Hyper-specific fact 1", "Fact 2", "Fact 3"],
      "latitude": precise_lat_to_5_decimal_places,
      "longitude": precise_lng_to_5_decimal_places,
      "address": "Nearest real street address or intersection (e.g., '157 W 48th St' or 'W 48th St & 8th Ave')",
      "distanceMeters": estimated_distance_from_user_MUST_be_under_${searchRadius}
    }
  ]
}

Return 4-6 places. Every place MUST be within ${radiusFeet} feet. Every fact should feel like a local secret — the kind of thing that makes someone stop on the sidewalk and look up.`,
      },
      {
        role: "user",
        content: `I'm standing at exactly ${latitude}, ${longitude}. What obscure, overlooked, or forgotten history is within ${radiusFeet} feet of me right now?`,
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
    const maxDist = searchRadius * 3;
    data.places = data.places.filter((p: any) => {
      if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return true;
      const dLat = ((p.latitude - latitude) * Math.PI) / 180;
      const dLon = ((p.longitude - longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((latitude * Math.PI) / 180) *
          Math.cos((p.latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return dist <= maxDist;
    });
  }

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
  res.json(data);
});

router.post("/explore/geocode", async (req, res) => {
  const parsed = GeocodeLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { query } = parsed.data;

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
  res.json(data);
});

router.post("/explore/place-detail", async (req, res) => {
  const parsed = GetPlaceDetailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { placeName, latitude, longitude, category } = parsed.data;

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
  res.json(data);
});

router.post("/explore/walk-narration", async (req, res) => {
  const { placeName, category, summary, fact } = req.body || {};
  if (!placeName || !summary) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

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
