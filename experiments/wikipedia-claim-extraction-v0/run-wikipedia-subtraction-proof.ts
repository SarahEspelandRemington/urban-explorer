// Isolated offline harness only. Proves subtractAdmittedWikipediaSpans
// against the real, already-fetched Library Hotel / Actors' Temple article
// extracts and admitted-claim data recorded in
// report-wikipedia-claim-proof.json (produced by
// run-wikipedia-claim-proof.ts against live en.wikipedia.org). Not wired
// into any live route; does not fetch anything itself.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { subtractAdmittedWikipediaSpans } from "../../artifacts/api-server/src/lib/localHistoryAdmission/sources/wikipedia/wikipediaContentSubtraction";
import type { Claim } from "../../artifacts/api-server/src/lib/localHistoryAdmission/types";

const outDir = dirname(fileURLToPath(import.meta.url));

interface ReportEntry {
  subject: { label: string };
  article: { extract: string };
  artifact: { claims: Array<{ claim: Claim }> };
}

const report = JSON.parse(
  readFileSync(join(outDir, "report-wikipedia-claim-proof.json"), "utf8"),
) as ReportEntry[];

for (const entry of report) {
  const admittedClaims = entry.artifact.claims.map((c) => c.claim);
  const before = entry.article.extract;
  const after = subtractAdmittedWikipediaSpans(before, admittedClaims);

  console.log(`\n=== ${entry.subject.label} ===`);
  console.log(`admitted claim supportingSpans (${admittedClaims.length}):`);
  for (const c of admittedClaims) console.log(`  - "${c.supportingSpan}"`);

  console.log("\n--- BEFORE (raw wikipediaContent source text) ---");
  console.log(before);
  console.log("\n--- AFTER (subtracted) ---");
  console.log(after);
}
