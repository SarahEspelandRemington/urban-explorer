import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const placePhotos = pgTable("place_photos", {
  placeKey: text("place_key").primaryKey(),
  photoUrl: text("photo_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlacePhoto = typeof placePhotos.$inferSelect;
