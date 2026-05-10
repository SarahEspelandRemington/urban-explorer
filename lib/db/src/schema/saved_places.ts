import {
  doublePrecision,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedPlaces = pgTable(
  "saved_places",
  {
    userId: varchar("user_id").notNull(),
    placeId: text("place_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    yearBuilt: text("year_built"),
    tags: jsonb("tags").$type<string[]>(),
    summary: text("summary").notNull(),
    facts: jsonb("facts").notNull().$type<string[]>(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    address: text("address"),
    photoUrl: text("photo_url"),
    note: text("note"),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.placeId] })],
);

export const insertSavedPlaceSchema = createInsertSchema(savedPlaces).omit({
  userId: true,
  savedAt: true,
});

export type SavedPlaceRow = typeof savedPlaces.$inferSelect;
export type InsertSavedPlace = z.infer<typeof insertSavedPlaceSchema>;
