/**
 * Entry point for the Streetlit Hybrid Discovery v0.1 harness.
 * Offline/non-production — see README.md.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SOURCES } from "./sourceRegistry";
import { SPRING_GARDEN_CLAIMS } from "./data/springGardenClaims";
import { runPipeline } from "./pipeline";

const outcomes = runPipeline(SPRING_GARDEN_CLAIMS, SOURCES);

const pad = (s: string, n: number) =>
  s.length >= n ? s.slice(0, n - 1) + "…" : s.padEnd(n);

console.log(
  pad("CLAIM ID", 34) +
    pad("PLACE", 30) +
    pad("TYPE", 16) +
    pad("DECISION", 12) +
    pad("TRUST", 8) +
    pad("IDENTITY", 10) +
    pad("TIER", 5) +
    "EDIT.",
);
console.log("-".repeat(120));
for (const o of outcomes) {
  console.log(
    pad(o.claim.id, 34) +
      pad(o.claim.placeKey, 30) +
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
console.log("-".repeat(120));
console.log(
  `Total claims: ${outcomes.length} | AUTO-ADMIT: ${admit} | HOLD: ${hold} | SUPPRESS: ${suppress}`,
);

const outDir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(outDir, "report.json"), JSON.stringify(outcomes, null, 2));
console.log(
  `\nFull structured output written to ${join(outDir, "report.json")}`,
);
