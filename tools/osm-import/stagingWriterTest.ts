/**
 * DB-dependent tests: successful staging -> live swap, a rejected
 * low-row-count refresh leaving the prior live region intact, and a failed
 * swap (mid-transaction error) also leaving the prior live region intact.
 * Requires a running local Postgres with DATABASE_URL pointed at it — this
 * repo's local vitest is blocked (missing @rollup/rollup-darwin-arm64), so
 * this is run directly via tsx against the Package 1 scratch database,
 * never against production. Run via:
 *
 *   DATABASE_URL="postgresql://localhost:5432/streetlit_osm_dev" \
 *     scripts/node_modules/.bin/tsx tools/osm-import/stagingWriterTest.ts
 */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
// Reuses @workspace/db's own pool/db construction (gated on DATABASE_URL)
// rather than instantiating a second pg Pool directly — `pg` is a
// dependency of @workspace/db, not of this tool package, under pnpm's
// strict node_modules.
import {
  db,
  pool,
  osmPlaces,
  osmPlacesStaging,
  osmImportRuns,
} from "@workspace/db";
import {
  runStagingAndSwap,
  getLiveRowCount,
  checkRowCountSafety,
  MIN_REFRESH_ROW_RATIO,
} from "./stagingWriter";
import type { ImportCandidateRow } from "./importPipeline";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set to the local scratch DB to run this test",
  );
}
if (
  !process.env.DATABASE_URL.includes("streetlit_osm_dev") &&
  !process.env.ALLOW_NON_SCRATCH_DB
) {
  throw new Error(
    "Refusing to run: DATABASE_URL does not look like the local scratch DB " +
      "(expected to contain 'streetlit_osm_dev'). This test deletes/inserts " +
      "into osm_places — never point it at production. Set " +
      "ALLOW_NON_SCRATCH_DB=1 to override if you really mean to.",
  );
}

const REGION = `__package1_test_${Date.now()}`;

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed++;
  console.log(`PASS: ${name}`);
}

function row(
  osmId: string,
  name: string | null = "Test Place",
): ImportCandidateRow {
  return {
    osmType: "node",
    osmId,
    name,
    lat: 40.7,
    lon: -74.0,
    tags: { historic: "yes", name: name ?? undefined } as Record<
      string,
      string
    >,
    isApprovedRescue: false,
    osmVersion: null,
    matchedSelectorIds: ["historic"],
  };
}

async function cleanup(): Promise<void> {
  await db.delete(osmPlaces).where(eq(osmPlaces.region, REGION));
  await db.delete(osmPlacesStaging).where(eq(osmPlacesStaging.region, REGION));
  await db.delete(osmImportRuns).where(eq(osmImportRuns.region, REGION));
}

async function main() {
  await cleanup();

  await check(
    "checkRowCountSafety: first import for a region (previousCount=0) always passes",
    async () => {
      assert.equal(checkRowCountSafety(0, 1).ok, true);
      assert.equal(checkRowCountSafety(0, 0).ok, true);
    },
  );

  await check(
    "checkRowCountSafety: MIN_REFRESH_ROW_RATIO is 0.8 (80%)",
    async () => {
      assert.equal(MIN_REFRESH_ROW_RATIO, 0.8);
    },
  );

  await check(
    "checkRowCountSafety: a refresh at 79% of the prior count is rejected",
    async () => {
      assert.equal(checkRowCountSafety(100, 79).ok, false);
    },
  );

  await check(
    "checkRowCountSafety: a refresh at exactly 80% of the prior count is allowed",
    async () => {
      assert.equal(checkRowCountSafety(100, 80).ok, true);
    },
  );

  await check(
    "checkRowCountSafety: a refresh above 80% of the prior count is allowed",
    async () => {
      assert.equal(checkRowCountSafety(100, 90).ok, true);
    },
  );

  await check(
    "a successful first import writes rows to live osm_places and logs a success run",
    async () => {
      const result = await runStagingAndSwap(
        db,
        REGION,
        [row("1"), row("2")],
        new Date(),
      );
      assert.equal(result.outcome, "success");
      assert.equal(await getLiveRowCount(db, REGION), 2);
      const runs = await db
        .select()
        .from(osmImportRuns)
        .where(eq(osmImportRuns.region, REGION));
      assert.equal(runs.length, 1);
      assert.equal(runs[0].status, "success");
    },
  );

  await check(
    "a rejected low-row-count refresh leaves the prior live region intact and is logged rejected_row_count",
    async () => {
      // Current live count for REGION is 2 (from the previous check). A
      // refresh offering only 0 new rows would drop below half of 2.
      const result = await runStagingAndSwap(db, REGION, [], new Date());
      assert.equal(result.outcome, "rejected_row_count");
      assert.equal(
        await getLiveRowCount(db, REGION),
        2,
        "live region rows must be untouched after a rejected refresh",
      );
      const runs = await db
        .select()
        .from(osmImportRuns)
        .where(eq(osmImportRuns.region, REGION));
      assert.equal(runs.length, 2);
      assert.equal(runs[1].status, "rejected_row_count");
    },
  );

  await check(
    "a run with invalid rows is rejected before touching staging/live and logged rejected_missing_fields",
    async () => {
      const invalidRow: ImportCandidateRow = { ...row("3"), lat: NaN };
      const result = await runStagingAndSwap(
        db,
        REGION,
        [invalidRow],
        new Date(),
      );
      assert.equal(result.outcome, "rejected_missing_fields");
      assert.equal(
        await getLiveRowCount(db, REGION),
        2,
        "live region rows must be untouched after a validation rejection",
      );
    },
  );

  await check(
    "a valid refresh above the row-count floor successfully swaps and replaces the prior live rows",
    async () => {
      const result = await runStagingAndSwap(
        db,
        REGION,
        [row("1"), row("2"), row("3")],
        new Date(),
      );
      assert.equal(result.outcome, "success");
      assert.equal(await getLiveRowCount(db, REGION), 3);
    },
  );

  // A dedicated second region for the 80%-boundary end-to-end checks below,
  // kept separate from REGION so these don't disturb the row-count sequence
  // (3 -> duplicate-PK failure expecting 3 rows intact) the later tests rely
  // on. Note: osm_places' PK is (osm_type, osm_id) only — NOT scoped by
  // region — so these rows must use osm_ids that don't collide with REGION's
  // own test rows ("1"-"3"); hence the "1001"+ offset below.
  const BOUNDARY_REGION = `${REGION}_boundary`;

  await check(
    "end-to-end: a first import of 10 rows for a fresh region succeeds (establishes the baseline)",
    async () => {
      const tenRows = Array.from({ length: 10 }, (_, i) =>
        row(String(1001 + i)),
      );
      const result = await runStagingAndSwap(
        db,
        BOUNDARY_REGION,
        tenRows,
        new Date(),
      );
      assert.equal(result.outcome, "success");
      assert.equal(await getLiveRowCount(db, BOUNDARY_REGION), 10);
    },
  );

  await check(
    "end-to-end: a refresh at 70% of a 10-row region (7 rows, below the 80% floor) is rejected and leaves the prior 10 rows intact",
    async () => {
      const sevenRows = Array.from({ length: 7 }, (_, i) =>
        row(String(1001 + i)),
      );
      const result = await runStagingAndSwap(
        db,
        BOUNDARY_REGION,
        sevenRows,
        new Date(),
      );
      assert.equal(result.outcome, "rejected_row_count");
      assert.equal(
        await getLiveRowCount(db, BOUNDARY_REGION),
        10,
        "live region rows must be untouched after a rejected refresh",
      );
    },
  );

  await check(
    "end-to-end: a refresh at exactly 80% of a 10-row region (8 rows) is allowed and swaps in the new rows",
    async () => {
      const eightRows = Array.from({ length: 8 }, (_, i) =>
        row(String(1001 + i)),
      );
      const result = await runStagingAndSwap(
        db,
        BOUNDARY_REGION,
        eightRows,
        new Date(),
      );
      assert.equal(result.outcome, "success");
      assert.equal(await getLiveRowCount(db, BOUNDARY_REGION), 8);
    },
  );

  await db.delete(osmPlaces).where(eq(osmPlaces.region, BOUNDARY_REGION));
  await db
    .delete(osmPlacesStaging)
    .where(eq(osmPlacesStaging.region, BOUNDARY_REGION));
  await db
    .delete(osmImportRuns)
    .where(eq(osmImportRuns.region, BOUNDARY_REGION));

  await check(
    "a failed swap (mid-transaction DB error) rolls back and leaves the prior live region intact",
    async () => {
      // Two rows sharing the same (osm_type, osm_id) violate the composite
      // PK within a single insert statement, forcing the live insert half
      // of the transaction to fail AFTER the live delete has already run.
      const duplicatePairRows = [row("1"), { ...row("1"), name: "Duplicate" }];
      const result = await runStagingAndSwap(
        db,
        REGION,
        duplicatePairRows,
        new Date(),
      );
      assert.equal(result.outcome, "error");
      assert.equal(
        await getLiveRowCount(db, REGION),
        3,
        "a failed swap must roll back — the prior live region (3 rows) must remain untouched",
      );
    },
  );

  await cleanup();
  console.log(`\n${passed} passed, 0 failed`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  await pool.end();
  process.exit(1);
});
