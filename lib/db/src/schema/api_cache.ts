import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const apiCache = pgTable(
  "api_cache",
  {
    namespace: text("namespace").notNull(),
    cacheKey: text("cache_key").notNull(),
    data: jsonb("data").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.namespace, table.cacheKey] })],
);

export type ApiCacheEntry = typeof apiCache.$inferSelect;
