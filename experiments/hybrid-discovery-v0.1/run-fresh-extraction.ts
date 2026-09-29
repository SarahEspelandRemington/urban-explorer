/**
 * Stage 2 entry point: run the UNCHANGED Hybrid Discovery v0.1 pipeline
 * against the frozen Stage 1 fresh-extraction claim set only (not mixed
 * with the earlier reconciled dataset). Offline/non-production.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-fresh-extraction.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SOURCES } from "./sourceRegistry";
import { SPRING_GARDEN_FRESH_CLAIMS } from "./data/springGardenFreshExtraction";
import { runPipeline } from "./pipeline";

const outcomes = runPipeline(SPRING_GARDEN_FRESH_CLAIMS, SOURCES);

const pad = (s: string, n: number) =>
  s.length >= n ? s.slice(0, n - 1) + "…" : s.padEnd(n);

console.log(
  pad("CLAIM ID", 38) +
    pad("PLACE", 32) +
    pad("TYPE", 16) +
    pad("DECISION", 12) +
    pad("TRUST", 8) +
    pad("IDENTITY", 10) +
    pad("TIER", 5) +
    "EDIT.",
);
console.log("-".repeat(130));
for (const o of outcomes) {
  console.log(
    pad(o.claim.id, 38) +
      pad(o.claim.placeKey, 32) +
      pad(o.claim.claimType, 16) +
      pad(o.decision.decision, 12) +
      pad(o.decision.factualTrust, 8) +
      pad(o.decision.identityConfidence, 10) +
      pad(String(o.grounding.tier), 5) +
      o.decision.editorialQuality,
  );
}

const admit = outcomes.filter(
  (o) => o.decision.decision === "AUTO-ADMIT",
).length;
const hold = outcomes.filter((o) => o.decision.decision === "HOLD").length;
const suppress = outcomes.filter(
  (o) => o.decision.decision === "SUPPRESS",
).length;
console.log("-".repeat(130));
console.log(
  `Total claims: ${outcomes.length} | AUTO-ADMIT: ${admit} | HOLD: ${hold} | SUPPRESS: ${suppress}`,
);

const outDir = dirname(fileURLToPath(import.meta.url));
writeFileSync(
  join(outDir, "report-fresh-extraction.json"),
  JSON.stringify(outcomes, null, 2),
);
console.log(
  `\nFull structured output written to ${join(outDir, "report-fresh-extraction.json")}`,
);
