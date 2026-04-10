import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  DiscoverPlacesBody,
  GetPlaceDetailBody,
} from "@workspace/api-zod";

const router = Router();

router.post("/explore/discover", async (req, res) => {
  const parsed = DiscoverPlacesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { latitude, longitude, radius } = parsed.data;
  const searchRadius = radius ?? 500;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are an expert urban historian and architectural guide. Given GPS coordinates, identify real, notable buildings, monuments, parks, bridges, and historical sites near that location. For each place, provide fascinating historical facts, architectural details, and lesser-known stories.

IMPORTANT: Only mention real, verifiable places. Do not invent fictional locations. If you're unsure about a specific location, mention well-known landmarks in the general area.

Respond in JSON format:
{
  "location": "Human-readable area description (e.g., 'Lower Manhattan, New York City')",
  "places": [
    {
      "id": "unique-id",
      "name": "Place Name",
      "category": "building|monument|park|bridge|church|museum|theater|historic site",
      "yearBuilt": "1920s" or "circa 1850",
      "summary": "One-line captivating description",
      "facts": ["Fact 1", "Fact 2", "Fact 3"],
      "latitude": approximate_lat,
      "longitude": approximate_lng,
      "distanceMeters": estimated_distance_from_user
    }
  ]
}

Return 4-6 places within roughly ${searchRadius}m of the given coordinates. Make the facts genuinely interesting - architectural secrets, historical events, famous visitors, hidden details.`,
      },
      {
        role: "user",
        content: `Find interesting places near coordinates: ${latitude}, ${longitude}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    res.status(500).json({ error: "Failed to generate discoveries" });
    return;
  }

  const data = JSON.parse(content);
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
    model: "gpt-5.2",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are an expert urban historian. Provide rich, detailed information about a specific place. Include architectural details, historical narrative, notable events, and fascinating lesser-known stories.

Respond in JSON format:
{
  "name": "Place Name",
  "fullHistory": "A rich 2-3 paragraph narrative about the place's history, its significance, and its evolution over time",
  "architecturalStyle": "Description of the architectural style if applicable",
  "notableEvents": ["Event 1 with year", "Event 2 with year"],
  "funFacts": ["Fascinating fact 1", "Fascinating fact 2", "Fascinating fact 3", "Fascinating fact 4"],
  "nearbyRelated": ["Related Place 1", "Related Place 2"]
}

Be accurate and engaging. Focus on real, verifiable information.`,
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

  const data = JSON.parse(content);
  res.json(data);
});

export default router;
