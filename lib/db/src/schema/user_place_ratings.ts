import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const userPlaceRatings = pgTable(
  "user_place_ratings",
  {
    userId: text("user_id").notNull(),
    placeId: text("place_id").notNull(),
    rating: text("rating", { enum: ["up", "down"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.placeId] })],
);

export type UserPlaceRating = typeof userPlaceRatings.$inferSelect;
