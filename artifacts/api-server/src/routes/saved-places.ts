import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  ListSavedPlacesResponse,
  UpsertSavedPlaceBody,
  UpsertSavedPlaceResponse,
  DeleteSavedPlaceResponse,
} from "@workspace/api-zod";
import { db, savedPlaces } from "@workspace/db";

const router: IRouter = Router();

router.get("/saved-places", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const userId = req.user.id;
  const rows = await db
    .select()
    .from(savedPlaces)
    .where(eq(savedPlaces.userId, userId));

  const places = rows.map((row) => ({
    id: row.placeId,
    name: row.name,
    category: row.category,
    yearBuilt: row.yearBuilt ?? undefined,
    tags: (row.tags as string[] | null) ?? undefined,
    summary: row.summary,
    facts: row.facts as string[],
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address ?? undefined,
    photoUrl: row.photoUrl ?? undefined,
    savedAt: row.savedAt.toISOString(),
    note: row.note ?? undefined,
  }));

  res.json(ListSavedPlacesResponse.parse({ places }));
});

router.put(
  "/saved-places/:placeId",
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const parsed = UpsertSavedPlaceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const placeId = String(req.params.placeId);
    const userId = req.user.id;
    const data = parsed.data;

    await db
      .insert(savedPlaces)
      .values({
        userId,
        placeId,
        name: data.name,
        category: data.category,
        yearBuilt: data.yearBuilt ?? null,
        tags: data.tags ?? null,
        summary: data.summary,
        facts: data.facts,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address ?? null,
        photoUrl: data.photoUrl ?? null,
        note: data.note ?? null,
        savedAt: data.savedAt instanceof Date ? data.savedAt : new Date(),
      })
      .onConflictDoUpdate({
        target: [savedPlaces.userId, savedPlaces.placeId],
        set: {
          name: data.name,
          category: data.category,
          yearBuilt: data.yearBuilt ?? null,
          tags: data.tags ?? null,
          summary: data.summary,
          facts: data.facts,
          latitude: data.latitude,
          longitude: data.longitude,
          address: data.address ?? null,
          photoUrl: data.photoUrl ?? null,
          note: data.note ?? null,
          savedAt: data.savedAt instanceof Date ? data.savedAt : new Date(),
        },
      });

    res.json(UpsertSavedPlaceResponse.parse({ ok: true }));
  },
);

router.delete(
  "/saved-places/:placeId",
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const placeId = String(req.params.placeId);
    const userId = req.user.id;

    await db
      .delete(savedPlaces)
      .where(
        and(
          eq(savedPlaces.userId, userId),
          eq(savedPlaces.placeId, placeId),
        ),
      );

    res.json(DeleteSavedPlaceResponse.parse({ ok: true }));
  },
);

export default router;
