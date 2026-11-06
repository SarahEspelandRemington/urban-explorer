/**
 * Package 1 local/dev import proof entry point. Parses an OPL extract,
 * runs the selector + approved-rescue pipeline, prints a diagnostics
 * report, and — only if --write is passed AND DATABASE_URL points at the
 * local scratch DB — writes to staging and performs the row-count-checked
 * swap into the local live table. Never touches production.
 *
 * Usage:
 *   scripts/node_modules/.bin/tsx tools/osm-import/runImport.ts \
 *     <region> <path-to-opl-file> [--write]
 */
import { readFileSync } from "node:fs";
import { parseOpl } from "./opl";
import { runImportPipeline } from "./importPipeline";
import { getApprovedRescueTargets } from "./approvedRescue";
import { matchingSelectorIds } from "./selectors";

async function main() {
  const [region, oplPath, flag] = process.argv.slice(2);
  if (!region || !oplPath) {
    console.error("Usage: runImport.ts <region> <path-to-opl-file> [--write]");
    process.exit(1);
  }
  const shouldWrite = flag === "--write";

  const oplText = readFileSync(oplPath, "utf8");
  const parsed = parseOpl(oplText);
  const approvedTargets = getApprovedRescueTargets();

  const result = runImportPipeline(parsed, approvedTargets);

  const selectorClassCounts = new Map<string, number>();
  for (const row of result.rows) {
    for (const id of row.matchedSelectorIds) {
      selectorClassCounts.set(id, (selectorClassCounts.get(id) ?? 0) + 1);
    }
  }

  console.log(`\n=== Package 1 import proof: region "${region}" ===`);
  console.log(
    `Source OPL element counts: ${result.diagnostics.nodeCount} nodes, ${result.diagnostics.wayCount} ways, ${result.diagnostics.relationCount} relations`,
  );
  console.log(`Rows selected (post-dedupe): ${result.rows.length}`);
  console.log(
    `  by type: ${result.rows.filter((r) => r.osmType === "node").length} nodes, ${result.rows.filter((r) => r.osmType === "way").length} ways, ${result.rows.filter((r) => r.osmType === "relation").length} relations`,
  );
  console.log(
    `Selector-match events (pre-dedupe element count): ${result.diagnostics.selectorMatchCount}`,
  );
  console.log(
    `Duplicate (osm_type, osm_id) collapses: ${result.diagnostics.duplicateIdsCollapsed}`,
  );
  console.log(
    `Approved-rescue matches: ${result.diagnostics.approvedRescueMatchCount}`,
  );
  console.log(
    `Approved-rescue missing ids (not in this extract): ${result.diagnostics.approvedRescueMissingIds.length}`,
  );
  if (
    result.diagnostics.approvedRescueMissingIds.length > 0 &&
    result.diagnostics.approvedRescueMissingIds.length <= 25
  ) {
    console.log(`  ${result.diagnostics.approvedRescueMissingIds.join(", ")}`);
  }
  console.log(
    `Unresolved geometries (skipped): ${result.diagnostics.unresolvedGeometryIds.length}`,
  );
  if (result.diagnostics.unresolvedGeometryIds.length > 0) {
    console.log(`  ${result.diagnostics.unresolvedGeometryIds.join(", ")}`);
  }
  console.log(
    `Unnamed rows (name === null): ${result.rows.filter((r) => r.name === null).length}`,
  );
  console.log(`Selector-class distribution:`);
  for (const [id, count] of [...selectorClassCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${id}: ${count}`);
  }

  if (!shouldWrite) {
    console.log(
      `\n(dry run — pass --write to also stage + swap into the local DB)`,
    );
    return;
  }

  const { runStagingAndSwap } = await import("./stagingWriter");
  const { db, pool } = await import("@workspace/db");
  if (
    !process.env.DATABASE_URL?.includes("streetlit_osm_dev") &&
    !process.env.ALLOW_NON_SCRATCH_DB
  ) {
    throw new Error(
      "Refusing --write: DATABASE_URL does not look like the local scratch DB. " +
        "Set ALLOW_NON_SCRATCH_DB=1 to override if you really mean to.",
    );
  }
  const swapResult = await runStagingAndSwap(
    db,
    region,
    result.rows,
    new Date(),
  );
  console.log(`\nStaging/swap outcome: ${swapResult.outcome}`);
  console.log(
    `  rowCount: ${swapResult.rowCount}, previousLiveRowCount: ${swapResult.previousLiveRowCount}`,
  );
  if (swapResult.detail) console.log(`  detail: ${swapResult.detail}`);
  await pool.end();
}

main();
