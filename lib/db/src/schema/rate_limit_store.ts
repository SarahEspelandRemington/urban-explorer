import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitStore = pgTable("rate_limit_store", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull().default(1),
  resetTime: timestamp("reset_time", { withTimezone: true }).notNull(),
});
