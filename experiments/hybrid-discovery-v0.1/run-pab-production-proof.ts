/**
 * Hybrid Discovery v1 — PAB production-admission proof. Offline/non-production,
 * experimental — see README.md.
 *
 * FROZEN retrieval adapter -> FROZEN interpreter -> FROZEN claim extractor ->
 * FROZEN OSM grounding (structured osmElementId) -> PROMOTED admission engine
 * (artifacts/api-server/src/lib/localHistoryAdmission/artifact.ts,
 * projector.ts). This is the first end-to-end run of the production-grade
 * admission/artifact/projector path against real Spring Garden PAB data.
 *
 * This script does NOT merge its output into curatedLocalHistory.ts and does
 * NOT deploy/push/change API/client/cache behavior — it only produces a
 * checked report + a projection data file for inspection.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-pab-production-proof.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { retrievePabCorridor } from "./pab/pabAdapter";
import {
  classifyPabRecord,
  type PabInterpretedRecord,
} from "./pab/pabInterpreter";
import {
  buildPabSource,
  extractClaimsFromPabRecord,
} from "./pab/pabClaimExtractor";
import {
  fetchOsmStreetIndex,
  groundPabRecord,
  type PabGroundingResult,
} from "./pab/pabGrounding";
import type { Claim, Source } from "./types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const adapterResult = await retrievePabCorridor({
    street: "Spring Garden St",
    city: "Philadelphia",
    lowerBound: 1700,
    upperBound: 2299,
  });

  console.log(
    `Retrieved ${adapterResult.totalRetrieved} total PAB records; ${adapterResult.records.length} corridor-filtered (1700-2299)\n`,
  );

  const interpreted: PabInterpretedRecord[] = [];
  for (const record of adapterResult.records) {
    interpreted.push(await classifyPabRecord(record));
    await sleep(120);
  }

  const claimBearing = interpreted.filter(
    (r) => r.classification === "claim-bearing",
  );
  console.log(`claim-bearing records: ${claimBearing.length}\n`);

  console.log(
    "Fetching OSM street index for Spring Garden St, Philadelphia (Overpass)...",
  );
  const osmIndex = await fetchOsmStreetIndex("Spring Garden", "Philadelphia");
  console.log(`OSM street index: ${osmIndex.length} elements\n`);

  const claims: Claim[] = [];
  const sources: Record<string, Source> = {};
  const groundingByPabId: Record<string, PabGroundingResult> = {};
  const claimsByPabId: Record<string, Claim[]> = {};

  for (const interpretedRecord of claimBearing) {
    const record = adapterResult.records.find(
      (r) => r.pabId === interpretedRecord.pabId,
    )!;
    const grounding = groundPabRecord(record, interpretedRecord, osmIndex);
    groundingByPabId[record.pabId] = grounding;

    sources[`pab-${record.pabId}`] = buildPabSource(record, interpretedRecord);
    const recordClaims = extractClaimsFromPabRecord(record, interpretedRecord);
    for (const claim of recordClaims) {
      claim.proposedIdentityType = grounding.proposedIdentityType;
      if (grounding.matchedIdentifier || grounding.matchingSignal) {
        claim.locationHints = [
          grounding.matchedIdentifier,
          grounding.matchingSignal,
        ]
          .filter(Boolean)
          .join(" — ");
      }
      // Deterministic production identity — see PabGroundingResult.osmElementId's
      // doc comment in pab/pabGrounding.ts. Set only when grounding matched a
      // real, current OSM element; never derived from placeKey, address text,
      // or any fuzzy signal. Absence leaves the claim non-projectable.
      if (grounding.osmElementId) {
        claim.productionSubjectId = grounding.osmElementId;
      }
    }
    claimsByPabId[record.pabId] = recordClaims;
    claims.push(...recordClaims);
  }

  const generatedAt = new Date().toISOString();
  const artifact: GeneratedEvidenceArtifact = generateArtifact(
    claims,
    sources,
    { generatedAt },
  );
  const projection = projectRuntimeCompat(artifact);
  const gated = applyDiscoveryWorthinessGate(projection, artifact);

  // --- Validation 1: grounded records / productionSubjectId coverage ---
  const groundedRecordCount = claimBearing.length;
  const recordsWithProductionSubjectId = Object.entries(groundingByPabId)
    .filter(([, g]) => !!g.osmElementId)
    .map(([pabId]) => pabId);
  const recordsWithoutProductionSubjectId = Object.entries(groundingByPabId)
    .filter(([, g]) => !g.osmElementId)
    .map(([pabId, g]) => ({ pabId, category: g.proposedIdentityType }));

  console.log("--- 1. Grounded records / productionSubjectId coverage ---");
  console.log(`  grounded (claim-bearing) records: ${groundedRecordCount}`);
  console.log(
    `  records with deterministic productionSubjectId: ${recordsWithProductionSubjectId.length}`,
  );
  console.log(
    `  records without (non-projectable at grounding stage): ${recordsWithoutProductionSubjectId.length}\n`,
  );
  const nonProjectableByCategory: Record<string, number> = {};
  for (const r of recordsWithoutProductionSubjectId) {
    nonProjectableByCategory[r.category] =
      (nonProjectableByCategory[r.category] ?? 0) + 1;
  }
  console.log("  non-projectable-at-grounding breakdown by category:");
  for (const [cat, n] of Object.entries(nonProjectableByCategory)) {
    console.log(`    ${cat}: ${n}`);
  }
  console.log();

  // --- Validation 2: AUTO-ADMIT/HOLD/SUPPRESS totals ---
  console.log("--- 2. Artifact decision totals ---");
  console.log(
    `  total claims: ${artifact.summary.totalClaims} | AUTO-ADMIT: ${artifact.summary.byDecision["AUTO-ADMIT"]} | HOLD: ${artifact.summary.byDecision.HOLD} | SUPPRESS: ${artifact.summary.byDecision.SUPPRESS}`,
  );
  console.log(
    `  distinct subjectIds (defined): ${artifact.summary.subjectCount}`,
  );
  console.log(
    `  integrityViolations: ${artifact.summary.integrityViolations.length}`,
  );
  console.log(
    `  nonProjectableClaimIds (AUTO-ADMIT-eligible in every other respect, no productionSubjectId): ${artifact.summary.nonProjectableClaimIds.length}\n`,
  );

  // --- Validation 3: projection totals ---
  const projectedSubjectIds = Object.keys(projection.entries);
  console.log("--- 3. Projection totals ---");
  console.log(`  projected runtime entries: ${projectedSubjectIds.length}`);
  console.log(
    `  projection nonProjectableClaimIds: ${projection.nonProjectableClaimIds.length}\n`,
  );

  // --- Validation 4: placeKey -> productionSubjectId collision check ---
  // A "collision" here means >=2 distinct placeKeys mapping to the same
  // productionSubjectId. This is only a bug if those placeKeys correspond to
  // claims with materially different addresses (misattachment) — legitimate
  // when they're the same real building/address (composition).
  const placeKeysBySubject = new Map<string, Set<string>>();
  const addressesBySubject = new Map<string, Set<string>>();
  for (const record of artifact.claims) {
    if (!record.subjectId) continue;
    if (!placeKeysBySubject.has(record.subjectId))
      placeKeysBySubject.set(record.subjectId, new Set());
    placeKeysBySubject.get(record.subjectId)!.add(record.claim.placeKey);
    if (!addressesBySubject.has(record.subjectId))
      addressesBySubject.set(record.subjectId, new Set());
    if (record.claim.address)
      addressesBySubject.get(record.subjectId)!.add(record.claim.address);
  }
  const multiPlaceKeySubjects = [...placeKeysBySubject.entries()].filter(
    ([, keys]) => keys.size > 1,
  );
  const suspiciousCollisions = multiPlaceKeySubjects.filter(([subjectId]) => {
    const addrs = addressesBySubject.get(subjectId);
    return addrs && addrs.size > 1;
  });
  console.log("--- 4. placeKey -> productionSubjectId collision check ---");
  console.log(
    `  subjectIds with >1 distinct placeKey (benign composition candidates): ${multiPlaceKeySubjects.length}`,
  );
  for (const [subjectId, keys] of multiPlaceKeySubjects) {
    console.log(
      `    ${subjectId}: placeKeys=[${[...keys].join(", ")}] addresses=[${[...(addressesBySubject.get(subjectId) ?? [])].join(" | ")}]`,
    );
  }
  console.log(
    `  SUSPICIOUS (>1 distinct address sharing one subjectId — possible misattachment): ${suspiciousCollisions.length}`,
  );
  for (const [subjectId] of suspiciousCollisions) {
    console.log(`    !! ${subjectId}`);
  }
  console.log();

  // --- Validation 5: every projected subjectId is a well-formed OSM type/id ---
  const OSM_ID_PATTERN = /^(node|way|relation)\/\d+$/;
  const malformedSubjectIds = projectedSubjectIds.filter(
    (id) => !OSM_ID_PATTERN.test(id),
  );
  console.log("--- 5. Projected subjectId well-formedness ---");
  console.log(
    `  malformed (not node|way|relation/<id>) subjectIds: ${malformedSubjectIds.length}`,
  );
  if (malformedSubjectIds.length > 0) {
    console.log(`    !! ${malformedSubjectIds.join(", ")}`);
  }
  console.log();

  // --- Validation 6: no HOLD/SUPPRESS claim appears in the projection ---
  const claimIdToDecision = new Map(
    artifact.claims.map((r) => [r.claimId, r.decision.decision]),
  );
  const leakedNonAdmit: string[] = [];
  for (const [subjectId, claimIds] of Object.entries(
    projection.compositionMap,
  )) {
    for (const claimId of claimIds) {
      const decision = claimIdToDecision.get(claimId);
      if (decision !== "AUTO-ADMIT") {
        leakedNonAdmit.push(`${subjectId}/${claimId} (${decision})`);
      }
    }
  }
  console.log("--- 6. HOLD/SUPPRESS leakage check ---");
  console.log(
    `  non-AUTO-ADMIT claims found in projection: ${leakedNonAdmit.length}`,
  );
  if (leakedNonAdmit.length > 0)
    console.log(`    !! ${leakedNonAdmit.join(", ")}`);
  console.log();

  // --- Validation 7: structural validity of generated CuratedEntrys ---
  const structuralIssues: string[] = [];
  for (const [subjectId, entry] of Object.entries(projection.entries)) {
    if (!entry.source || typeof entry.source.title !== "string")
      structuralIssues.push(`${subjectId}: missing/invalid source.title`);
    if (!entry.source || typeof entry.source.usageNote !== "string")
      structuralIssues.push(`${subjectId}: missing/invalid source.usageNote`);
    if (!entry.evidence) {
      structuralIssues.push(`${subjectId}: missing evidence`);
      continue;
    }
    if (entry.evidence.subjectId !== subjectId)
      structuralIssues.push(
        `${subjectId}: evidence.subjectId mismatch (${entry.evidence.subjectId})`,
      );
    if (
      typeof entry.evidence.text !== "string" ||
      entry.evidence.text.length === 0
    )
      structuralIssues.push(`${subjectId}: empty evidence.text`);
    if (
      !["approved", "pending", "rejected"].includes(
        entry.evidence.verificationStatus,
      )
    )
      structuralIssues.push(
        `${subjectId}: invalid verificationStatus ${entry.evidence.verificationStatus}`,
      );
    if (
      !["high", "medium", "low"].includes(entry.evidence.verificationConfidence)
    )
      structuralIssues.push(
        `${subjectId}: invalid verificationConfidence ${entry.evidence.verificationConfidence}`,
      );
    if (!["high", "medium", "low"].includes(entry.evidence.curatedTrust))
      structuralIssues.push(
        `${subjectId}: invalid curatedTrust ${entry.evidence.curatedTrust}`,
      );
    if (entry.evidence.admissionMethod !== "automated")
      structuralIssues.push(
        `${subjectId}: admissionMethod not "automated" (${entry.evidence.admissionMethod})`,
      );
  }
  console.log("--- 7. Structural validity of generated CuratedEntrys ---");
  console.log(`  entries checked: ${projectedSubjectIds.length}`);
  console.log(`  structural issues found: ${structuralIssues.length}`);
  if (structuralIssues.length > 0) {
    for (const issue of structuralIssues) console.log(`    !! ${issue}`);
  }
  console.log();

  // --- Validation 8: trust/verification aggregation sanity spot-check ---
  // For every projected entry, confirm curatedTrust/verificationConfidence
  // equal the conservative (weakest-link) minimum across composed claims.
  const TRUST_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };
  const IDENTITY_RANK: Record<string, number> = {
    none: -1,
    low: 0,
    medium: 1,
    high: 2,
  };
  const RANK_TO_TRUST = ["low", "medium", "high"];
  const trustMismatches: string[] = [];
  for (const [subjectId, claimIds] of Object.entries(
    projection.compositionMap,
  )) {
    const group = claimIds.map(
      (id) => artifact.claims.find((r) => r.claimId === id)!,
    );
    const expectedTrust =
      RANK_TO_TRUST[
        Math.min(...group.map((r) => TRUST_RANK[r.decision.factualTrust]))
      ];
    const expectedConfidence =
      RANK_TO_TRUST[
        Math.min(
          ...group.map((r) => IDENTITY_RANK[r.decision.identityConfidence]),
        )
      ];
    const entry = projection.entries[subjectId];
    if (entry.evidence.curatedTrust !== expectedTrust)
      trustMismatches.push(
        `${subjectId}: curatedTrust ${entry.evidence.curatedTrust} != expected ${expectedTrust}`,
      );
    if (entry.evidence.verificationConfidence !== expectedConfidence)
      trustMismatches.push(
        `${subjectId}: verificationConfidence ${entry.evidence.verificationConfidence} != expected ${expectedConfidence}`,
      );
  }
  console.log("--- 8. Trust/verification aggregation sanity check ---");
  console.log(`  mismatches found: ${trustMismatches.length}`);
  if (trustMismatches.length > 0) {
    for (const m of trustMismatches) console.log(`    !! ${m}`);
  }
  console.log();

  // --- Validation 9: discovery-worthiness gate ---
  const passedSubjectIds = Object.keys(gated.entries);
  const rejectedSubjectIds = gated.rejectedForWorthiness;
  console.log("--- 9. Discovery-worthiness gate ---");
  console.log(
    `  structurally projectable subjects: ${projectedSubjectIds.length}`,
  );
  console.log(
    `  PASS: ${passedSubjectIds.length} | FAIL: ${rejectedSubjectIds.length}\n`,
  );

  const groupByClaimIds = (claimIds: string[]) =>
    claimIds.map((id) => artifact.claims.find((r) => r.claimId === id)!);

  const passedWithGroups = passedSubjectIds.map((subjectId) => ({
    subjectId,
    claimIds: gated.compositionMap[subjectId],
    group: groupByClaimIds(gated.compositionMap[subjectId]),
    reasons: gated.worthinessBySubject[subjectId].worthinessReasons,
  }));
  const rejectedWithGroups = rejectedSubjectIds.map((subjectId) => ({
    subjectId,
    claimIds: projection.compositionMap[subjectId],
    group: groupByClaimIds(projection.compositionMap[subjectId]),
    reasons: gated.worthinessBySubject[subjectId].worthinessReasons,
  }));

  // "Borderline" pass = cleared the gate via the 2-supporting-types capsule
  // rule only, with no dedicated story-bearing claim type present.
  const borderlinePasses = passedWithGroups.filter((p) =>
    p.reasons.some((r) => r.includes("Combines")),
  );
  const strongestPasses = [...passedWithGroups]
    .sort((a, b) => b.group.length - a.group.length)
    .slice(0, 5);
  const strongestRejections = [...rejectedWithGroups]
    .sort((a, b) => b.group.length - a.group.length)
    .slice(0, 5);
  const registerDateOnlyStubs = rejectedWithGroups.filter((r) => {
    const types = new Set(r.group.map((g) => g.claim.claimType));
    return (
      [...types].every((t) => t === "identity" || t === "register-status") &&
      types.size > 0
    );
  });

  console.log(`  strongest passing examples (by claim count):`);
  for (const p of strongestPasses) {
    console.log(
      `    ${p.subjectId} (${p.group.length} claims, types: ${[...new Set(p.group.map((g) => g.claim.claimType))].join(", ")}) — ${p.group[0].claim.address}`,
    );
  }
  console.log(
    `\n  borderline passing examples (2-supporting-type capsule rule, no story type): ${borderlinePasses.length}`,
  );
  for (const p of borderlinePasses.slice(0, 8)) {
    console.log(
      `    ${p.subjectId} (types: ${[...new Set(p.group.map((g) => g.claim.claimType))].join(", ")}) — ${p.group[0].claim.address}`,
    );
  }
  console.log(
    `\n  strongest rejected examples (by claim count, still failing):`,
  );
  for (const r of strongestRejections) {
    console.log(
      `    ${r.subjectId} (${r.group.length} claims, types: ${[...new Set(r.group.map((g) => g.claim.claimType))].join(", ")}) — ${r.group[0].claim.address}`,
    );
  }
  console.log(
    `\n  register-date-only stubs (identity/register-status only) among rejections: ${registerDateOnlyStubs.length} of ${rejectedSubjectIds.length} rejected\n`,
  );

  const fifthBaptist = passedSubjectIds.includes("way/250836800")
    ? "PASS"
    : rejectedSubjectIds.includes("way/250836800")
      ? "FAIL"
      : "not present in this run's projection";
  console.log(`  Fifth Baptist Church (way/250836800): ${fifthBaptist}\n`);

  const outDir = dirname(fileURLToPath(import.meta.url));
  writeFileSync(
    join(outDir, "report-pab-production-proof.json"),
    JSON.stringify(
      {
        groundedRecordCount,
        recordsWithProductionSubjectId: recordsWithProductionSubjectId.length,
        recordsWithoutProductionSubjectId: recordsWithoutProductionSubjectId,
        nonProjectableByCategory,
        artifactSummary: artifact.summary,
        projectedSubjectCount: projectedSubjectIds.length,
        multiPlaceKeySubjects: multiPlaceKeySubjects.map(
          ([subjectId, keys]) => ({
            subjectId,
            placeKeys: [...keys],
            addresses: [...(addressesBySubject.get(subjectId) ?? [])],
          }),
        ),
        suspiciousCollisions: suspiciousCollisions.map(([id]) => id),
        malformedSubjectIds,
        leakedNonAdmit,
        structuralIssues,
        trustMismatches,
        groundingByPabId,
        artifact,
        projection,
        gated,
        worthinessGateSummary: {
          passed: passedSubjectIds,
          rejected: rejectedSubjectIds,
          borderlinePasses: borderlinePasses.map((p) => p.subjectId),
          registerDateOnlyStubRejections: registerDateOnlyStubs.map(
            (r) => r.subjectId,
          ),
          fifthBaptist,
        },
      },
      null,
      2,
    ),
  );
  console.log(
    `Full structured output written to ${join(outDir, "report-pab-production-proof.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
