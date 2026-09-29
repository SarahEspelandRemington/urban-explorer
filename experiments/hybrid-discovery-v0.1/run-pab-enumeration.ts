/**
 * Phase 4 entry point: run the UNCHANGED Hybrid Discovery v0.1 pipeline
 * against the PAB structured-source enumeration claims only (not mixed with
 * the frozen fresh-extraction set or the earlier reconciled dataset).
 * Offline/non-production.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-pab-enumeration.ts
 */
import { SOURCES } from "./sourceRegistry";
import { PAB_ENUMERATION_CLAIMS } from "./data/pabEnumerationClaims";
import { runPipeline } from "./pipeline";

const outcomes = runPipeline(PAB_ENUMERATION_CLAIMS, SOURCES);

const pad = (s: string, n: number) =>
  s.length >= n ? s.slice(0, n - 1) + "…" : s.padEnd(n);

console.log(
  pad("CLAIM ID", 32) +
    pad("PLACE", 42) +
    pad("TYPE", 16) +
    pad("DECISION", 12) +
    pad("TRUST", 8) +
    pad("IDENTITY", 10) +
    pad("TIER", 5) +
    "EDIT.",
);
console.log("-".repeat(140));
for (const o of outcomes) {
  console.log(
    pad(o.claim.id, 32) +
      pad(o.claim.placeKey, 42) +
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
console.log("-".repeat(140));
console.log(
  `Total claims: ${outcomes.length} | AUTO-ADMIT: ${admit} | HOLD: ${hold} | SUPPRESS: ${suppress}`,
);
