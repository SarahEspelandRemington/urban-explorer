/**
 * Hybrid Discovery — NYC portability Phase 1: LPC (Landmarks Preservation
 * Commission) structured-source production-admission proof.
 * Offline/non-production, experimental — see README.md.
 *
 * Reconstructed 2026-09-20 after the original file vanished from disk
 * mid-session with no git recovery path available (experiments/ is
 * untracked). Reconstructed narrowly from lpc/lpcAdapter.ts,
 * lpc/lpcGrounding.ts, lpc/lpcClaimExtractor.ts (already fixed for the
 * architect/construction-date claim-atomicity correction), and the
 * structural pattern of run-ephemeral-production-proof.ts /
 * run-nyc-phase3-proof.ts. No shared logic was changed as part of this
 * reconstruction.
 *
 * Retrieves the full W38th-W53rd corridor from LPC's Socrata dataset,
 * grounds each record against a live Overpass bbox OSM index, extracts
 * claims, and runs them through the SAME PROMOTED production admission
 * engine unchanged (artifacts/api-server/src/lib/localHistoryAdmission/
 * {artifact,projector,worthiness}.ts).
 *
 * Does NOT merge output into curatedLocalHistory.ts and does NOT deploy/
 * push/change API/client/cache behavior — it only produces a checked report
 * for inspection.
 *
 * Usage: node scripts/node_modules/tsx/dist/cli.mjs experiments/hybrid-discovery-v0.1/run-lpc-production-proof.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  retrieveLpcCorridor,
  W38_W53_CORRIDOR_BBOX,
  type LpcRetrievalRecord,
} from "./lpc/lpcAdapter";
import {
  interpretLpcRecord,
  extractClaimsFromLpcRecord,
  buildLpcSource,
  type LpcInterpretedRecord,
} from "./lpc/lpcClaimExtractor";
import {
  fetchOsmBboxIndex,
  groundLpcRecord,
  type LpcGroundingResult,
} from "./lpc/lpcGrounding";
import type { Claim, Source } from "./types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

async function main() {
  console.log("--- Retrieval ---");
  const adapterResult = await retrieveLpcCorridor(W38_W53_CORRIDOR_BBOX);
  console.log(
    `Field discovery: geometry field = ${adapterResult.fieldMap.geometryField}`,
  );
  console.log(`Query URL: ${adapterResult.queryUrl}`);
  console.log(
    `Retrieved ${adapterResult.totalRetrieved} LPC records in the corridor.\n`,
  );

  const interpretedByRowId: Record<string, LpcInterpretedRecord> = {};
  const classificationCounts: Record<string, number> = {};
  for (const record of adapterResult.records) {
    const interpreted = interpretLpcRecord(
      record,
      adapterResult.fieldMap.fields,
    );
    interpretedByRowId[record.lpcRowId] = interpreted;
    classificationCounts[interpreted.classification] =
      (classificationCounts[interpreted.classification] ?? 0) + 1;
  }
  console.log("--- Classification tally ---");
  for (const [classification, count] of Object.entries(classificationCounts)) {
    console.log(`  ${classification}: ${count}`);
  }
  console.log();

  console.log("Fetching OSM bbox index (Overpass) for the corridor...");
  const osmIndex = await fetchOsmBboxIndex(W38_W53_CORRIDOR_BBOX);
  console.log(`OSM bbox index: ${osmIndex.length} addressed elements\n`);

  const claims: Claim[] = [];
  const sources: Record<string, Source> = {};
  const groundingByRowId: Record<string, LpcGroundingResult> = {};
  const recordsByRowId: Record<string, LpcRetrievalRecord> = {};

  for (const record of adapterResult.records) {
    recordsByRowId[record.lpcRowId] = record;
    const interpreted = interpretedByRowId[record.lpcRowId];
    if (interpreted.classification !== "claim-bearing") continue;

    const grounding = groundLpcRecord(record, interpreted, osmIndex);
    groundingByRowId[record.lpcRowId] = grounding;

    const recordClaims = extractClaimsFromLpcRecord(record, interpreted);
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
      if (grounding.osmElementId) {
        claim.productionSubjectId = grounding.osmElementId;
      }
    }
    if (recordClaims.length === 0) continue;

    const source = buildLpcSource(record, interpreted);
    sources[source.id] = source;
    claims.push(...recordClaims);
  }

  const generatedAt = new Date().toISOString();
  const artifact: GeneratedEvidenceArtifact = generateArtifact(
    claims,
    sources,
    {
      generatedAt,
    },
  );
  const projection = projectRuntimeCompat(artifact);
  const gated = applyDiscoveryWorthinessGate(projection, artifact);

  // --- Validation 1: grounded records / productionSubjectId coverage ---
  const groundedEntries = Object.entries(groundingByRowId);
  const withProductionSubjectId = groundedEntries
    .filter(([, g]) => !!g.osmElementId)
    .map(([id]) => id);
  const withoutProductionSubjectId = groundedEntries
    .filter(([, g]) => !g.osmElementId)
    .map(([id, g]) => ({
      lpcRowId: id,
      category: g.category,
      confidence: g.confidence,
    }));

  console.log("--- 1. Grounded records / productionSubjectId coverage ---");
  console.log(`  claim-bearing records: ${groundedEntries.length}`);
  console.log(
    `  with deterministic productionSubjectId: ${withProductionSubjectId.length}`,
  );
  console.log(
    `  without (non-projectable at grounding stage): ${withoutProductionSubjectId.length}`,
  );
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
    `  nonProjectableClaimIds: ${artifact.summary.nonProjectableClaimIds.length}\n`,
  );

  // --- Validation 3: projection totals ---
  const projectedSubjectIds = Object.keys(projection.entries);
  console.log("--- 3. Projection totals ---");
  console.log(`  projected runtime entries: ${projectedSubjectIds.length}\n`);

  // --- Validation 4: placeKey -> productionSubjectId collision check ---
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
  console.log(
    `  SUSPICIOUS (>1 distinct address sharing one subjectId): ${suspiciousCollisions.length}`,
  );
  for (const [subjectId] of suspiciousCollisions)
    console.log(`    !! ${subjectId}`);
  console.log();

  // --- Validation 5: projected subjectId well-formedness ---
  const OSM_ID_PATTERN = /^(node|way|relation)\/\d+$/;
  const malformedSubjectIds = projectedSubjectIds.filter(
    (id) => !OSM_ID_PATTERN.test(id),
  );
  console.log("--- 5. Projected subjectId well-formedness ---");
  console.log(`  malformed subjectIds: ${malformedSubjectIds.length}`);
  if (malformedSubjectIds.length > 0)
    console.log(`    !! ${malformedSubjectIds.join(", ")}`);
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
      if (decision !== "AUTO-ADMIT")
        leakedNonAdmit.push(`${subjectId}/${claimId} (${decision})`);
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
  if (structuralIssues.length > 0)
    for (const issue of structuralIssues) console.log(`    !! ${issue}`);
  console.log();

  // --- Validation 8: discovery-worthiness gate ---
  const passedSubjectIds = Object.keys(gated.entries);
  const rejectedSubjectIds = gated.rejectedForWorthiness;
  console.log("--- 8. Discovery-worthiness gate ---");
  console.log(
    `  structurally projectable subjects: ${projectedSubjectIds.length}`,
  );
  console.log(
    `  PASS: ${passedSubjectIds.length} | FAIL: ${rejectedSubjectIds.length}\n`,
  );

  console.log("  strongest passing examples (by claim count):");
  const passedGroups = passedSubjectIds
    .map((subjectId) => {
      const claimIds = gated.compositionMap[subjectId];
      const group = claimIds.map(
        (id) => artifact.claims.find((r) => r.claimId === id)!,
      );
      return { subjectId, group };
    })
    .sort((a, b) => b.group.length - a.group.length)
    .slice(0, 5);
  for (const { subjectId, group } of passedGroups) {
    console.log(
      `    ${subjectId} (${group.length} claims, types: ${[...new Set(group.map((g) => g.claim.claimType))].join(", ")}) — ${group[0].claim.address}`,
    );
  }
  console.log();

  const outDir = dirname(fileURLToPath(import.meta.url));
  writeFileSync(
    join(outDir, "report-lpc-production-proof.json"),
    JSON.stringify(
      {
        corridorBbox: W38_W53_CORRIDOR_BBOX,
        queryUrl: adapterResult.queryUrl,
        totalRetrieved: adapterResult.totalRetrieved,
        classificationCounts,
        osmIndexSize: osmIndex.length,
        groundingByRowId,
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
        worthinessGateSummary: {
          passed: passedSubjectIds,
          rejected: rejectedSubjectIds,
        },
        artifact,
        projection,
        gated,
      },
      null,
      2,
    ),
  );
  console.log(
    `Full structured output written to ${join(outDir, "report-lpc-production-proof.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
