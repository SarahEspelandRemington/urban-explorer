// DB-dependent half of the importer: writes validated rows into
// osm_places_staging, runs the row-count safety check against the current
// live osm_places count for the region, and — only if that check passes —
// atomically replaces the region's live rows with the staging rows inside
// one transaction. Every run (successful or rejected) is logged to
// osm_import_runs for diagnostics.
//
// This module is intentionally NOT imported by anything in
// importPipeline.ts/opl.ts/geometry.ts/selectors.ts — those stay pure and DB-
// free so they can run under either vitest or tsx. This file requires
// DATABASE_URL to be set (via @workspace/db) and must only ever be pointed
// at a local/dev/scratch database in Package 1 — never production.

import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  osmPlaces,
  osmPlacesStaging,
  osmImportRuns,
  type NewOsmPlaceRow,
} from "@workspace/db/schema";
import type { ImportCandidateRow, RowValidationError } from "./importPipeline";
import { validateRows } from "./importPipeline";

function toNewRow(
  row: ImportCandidateRow,
  region: string,
  extractDate: Date,
): NewOsmPlaceRow {
  return {
    osmType: row.osmType,
    osmId: BigInt(row.osmId),
    name: row.name,
    lat: row.lat,
    lon: row.lon,
    tags: row.tags,
    region,
    isApprovedRescue: row.isApprovedRescue,
    osmVersion: row.osmVersion,
    extractDate,
  };
}

export interface RowCountCheckResult {
  ok: boolean;
  reason?: string;
}

// Rejects a refresh whose new row count drops below 80% of the live row
// count for a region that already had rows — a bounded, simple heuristic
// sufficient for catching an obviously-broken/truncated extract, without
// being a configurable policy (out of scope for Package 1; the proposed
// 500-row runtime ceiling is explicitly excluded too). A region with zero
// prior rows (first import) always passes, since there is nothing to
// compare against.
// The comparison basis is the current LIVE osm_places row count for the
// region (see getLiveRowCount below) at the moment this run starts — not
// the row_count recorded on the region's last successful osm_import_runs
// entry. In practice these are normally the same number, but they can
// diverge if a prior run was rejected or errored without updating the live
// table; this check always uses what's actually live right now.
export const MIN_REFRESH_ROW_RATIO = 0.8;

export function checkRowCountSafety(
  previousCount: number,
  newCount: number,
): RowCountCheckResult {
  if (previousCount === 0) return { ok: true };
  if (newCount < previousCount * MIN_REFRESH_ROW_RATIO) {
    return {
      ok: false,
      reason: `new row count ${newCount} is less than ${MIN_REFRESH_ROW_RATIO * 100}% of the previous live row count ${previousCount}`,
    };
  }
  return { ok: true };
}

export type ImportRunOutcome =
  | "success"
  | "rejected_row_count"
  | "rejected_missing_fields"
  | "error";

export interface StagingRunResult {
  outcome: ImportRunOutcome;
  rowCount: number;
  previousLiveRowCount: number;
  validationErrors: RowValidationError[];
  detail: string | null;
}

export async function runStagingAndSwap(
  db: NodePgDatabase<any>,
  region: string,
  rows: ImportCandidateRow[],
  extractDate: Date,
): Promise<StagingRunResult> {
  const startedAt = new Date();

  const validationErrors = validateRows(rows);
  if (validationErrors.length > 0) {
    const result: StagingRunResult = {
      outcome: "rejected_missing_fields",
      rowCount: rows.length,
      previousLiveRowCount: await getLiveRowCount(db, region),
      validationErrors,
      detail: `${validationErrors.length} row(s) failed validation`,
    };
    await recordImportRun(db, region, startedAt, result);
    return result;
  }

  try {
    const previousLiveRowCount = await getLiveRowCount(db, region);

    await db
      .delete(osmPlacesStaging)
      .where(eq(osmPlacesStaging.region, region));
    if (rows.length > 0) {
      await db
        .insert(osmPlacesStaging)
        .values(rows.map((r) => toNewRow(r, region, extractDate)));
    }

    const countCheck = checkRowCountSafety(previousLiveRowCount, rows.length);
    if (!countCheck.ok) {
      const result: StagingRunResult = {
        outcome: "rejected_row_count",
        rowCount: rows.length,
        previousLiveRowCount,
        validationErrors: [],
        detail: countCheck.reason ?? null,
      };
      await recordImportRun(db, region, startedAt, result);
      return result; // staging written for inspection, live region untouched
    }

    await swapStagingToLive(db, region, rows, extractDate);

    const result: StagingRunResult = {
      outcome: "success",
      rowCount: rows.length,
      previousLiveRowCount,
      validationErrors: [],
      detail: null,
    };
    await recordImportRun(db, region, startedAt, result);
    return result;
  } catch (err) {
    const result: StagingRunResult = {
      outcome: "error",
      rowCount: rows.length,
      previousLiveRowCount: 0,
      validationErrors: [],
      detail: err instanceof Error ? err.message : String(err),
    };
    await recordImportRun(db, region, startedAt, result);
    return result;
  }
}

export async function getLiveRowCount(
  db: NodePgDatabase<any>,
  region: string,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(osmPlaces)
    .where(eq(osmPlaces.region, region));
  return rows[0]?.count ?? 0;
}

export async function getStagingRowCount(
  db: NodePgDatabase<any>,
  region: string,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(osmPlacesStaging)
    .where(eq(osmPlacesStaging.region, region));
  return rows[0]?.count ?? 0;
}

// Atomic region replacement: delete the region's live rows and insert the
// (already-validated, already-staged) new rows, inside one transaction.
// A failure at any point rolls back — the prior live region is left intact.
async function swapStagingToLive(
  db: NodePgDatabase<any>,
  region: string,
  rows: ImportCandidateRow[],
  extractDate: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(osmPlaces).where(eq(osmPlaces.region, region));
    if (rows.length > 0) {
      await tx
        .insert(osmPlaces)
        .values(rows.map((r) => toNewRow(r, region, extractDate)));
    }
  });
}

async function recordImportRun(
  db: NodePgDatabase<any>,
  region: string,
  startedAt: Date,
  result: StagingRunResult,
): Promise<void> {
  await db.insert(osmImportRuns).values({
    region,
    startedAt,
    finishedAt: new Date(),
    rowCount: result.rowCount,
    status: result.outcome,
    detail: result.detail,
  });
}
