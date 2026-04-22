import { doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const placeRatings = pgTable("place_ratings", {
  placeId: text("place_id").primaryKey(),
  placeName: text("place_name").notNull(),
  category: text("category").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  up: integer("up").notNull().default(0),
  down: integer("down").notNull().default(0),
  lastRatedAt: timestamp("last_rated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlaceRatingSchema = createInsertSchema(placeRatings).omit({
  lastRatedAt: true,
});

export type PlaceRating = typeof placeRatings.$inferSelect;
export type InsertPlaceRating = z.infer<typeof insertPlaceRatingSchema>;
