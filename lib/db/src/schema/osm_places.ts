import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Local-import OSM candidate source for covered regions (NYC / Philadelphia).
// See the Overpass -> local-import parity specification and implementation
// plan (Package 1, 2026-11-05) for the full rationale behind every column
// here. This table is read by a to-be-added server adapter (NOT part of
// Package 1) that must reproduce the existing `OSMPlace[]` shape consumed by
// routes/explore/index.ts's fetchNearbyOSMPlaces.
//
// osm_type/osm_id: mirrors the existing `osmId` join key shape
// (`"${osm_type}/${osm_id}"`) already used throughout fetchNearbyOSMPlaces.
// name: nullable — unnamed historic/memorial/tourism/ruins elements and
// approved-rescue elements can legitimately lack a name tag.
// lat/lon: node's own coordinates, or the bounding-box center for a way/
// relation (NOT a true geometric centroid — see parity spec section 2/8).
// tags: full raw OSM tag dict, unfiltered — internal filters (trust tiers,
// residential/commercial suppression, stale-id exclusion, lifecycle
// formerUse) depend on arbitrary raw keys, not just the HINT_TAGS display
// whitelist.
// is_approved_rescue: true only for rows admitted via the exact-ID rescue
// pass (getApprovedOsmSubjectIds), bypassing every normal selector clause —
// mirrors fetchApprovedOsmSubjects' candidateOrigin: "approvedRescue".
// osm_version: the element's own OSM changeset version, diagnostics only;
// not consumed by any downstream filtering logic.
// extract_date: freshness marker, same value for every row written by one
// import run.
export const osmPlaces = pgTable(
  "osm_places",
  {
    osmType: text("osm_type").notNull(),
    osmId: bigint("osm_id", { mode: "bigint" }).notNull(),
    name: text("name"),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    tags: jsonb("tags").notNull(),
    region: text("region").notNull(),
    isApprovedRescue: boolean("is_approved_rescue").notNull().default(false),
    osmVersion: integer("osm_version"),
    extractDate: timestamp("extract_date", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.osmType, table.osmId] }),
    // Supports the request-time bounding-box pre-filter (coarse lat/lon
    // range scan, narrowed by region) ahead of the exact in-app haversine
    // radius filter — see localOsmSource.ts (not part of Package 1).
  ],
);

export type OsmPlaceRow = typeof osmPlaces.$inferSelect;
export type NewOsmPlaceRow = typeof osmPlaces.$inferInsert;

// Atomic-swap staging target. Identical column set to osm_places — an
// import run writes every selected/rescued element for one region here
// first; only a validated, row-count-checked run is ever copied into the
// live table (see the staging -> live swap transaction, not part of this
// schema file).
export const osmPlacesStaging = pgTable(
  "osm_places_staging",
  {
    osmType: text("osm_type").notNull(),
    osmId: bigint("osm_id", { mode: "bigint" }).notNull(),
    name: text("name"),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    tags: jsonb("tags").notNull(),
    region: text("region").notNull(),
    isApprovedRescue: boolean("is_approved_rescue").notNull().default(false),
    osmVersion: integer("osm_version"),
    extractDate: timestamp("extract_date", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.osmType, table.osmId] })],
);

export type OsmPlaceStagingRow = typeof osmPlacesStaging.$inferSelect;
export type NewOsmPlaceStagingRow = typeof osmPlacesStaging.$inferInsert;

// Audit/diagnostic record for each import run, including rejected ones.
// Gives the row-count safety check (and future alerting) a durable place to
// log *why* a swap was refused, without requiring a human to dig through
// server logs. Not read by any request-time code path.
export const osmImportRuns = pgTable("osm_import_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  region: text("region").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  rowCount: integer("row_count"),
  status: text("status", {
    enum: ["success", "rejected_row_count", "rejected_missing_fields", "error"],
  }).notNull(),
  detail: text("detail"),
});

export type OsmImportRunRow = typeof osmImportRuns.$inferSelect;
export type NewOsmImportRunRow = typeof osmImportRuns.$inferInsert;
