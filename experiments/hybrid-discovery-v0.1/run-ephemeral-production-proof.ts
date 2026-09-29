/**
 * Hybrid Discovery — NYC portability Phase 2: Ephemeral New York narrative-
 * source production-admission proof. Offline/non-production, experimental —
 * see README.md.
 *
 * Mirrors run-lpc-production-proof.ts's structure and validations, but for a
 * narrative source instead of a structured Socrata dataset: reuses the SAME
 * shared narrative core (narrative/narrativeExtractor.ts, already proven by
 * Hidden City) and the SAME PROMOTED production admission engine unchanged
 * (artifacts/api-server/src/lib/localHistoryAdmission/{artifact,projector,
 * worthiness}.ts).
 *
 * Scope note (deliberate, not an oversight): unlike the LPC proof, which
 * retrieves an entire corridor's worth of records automatically via a single
 * Socrata bbox query, Ephemeral New York has no structured per-record
 * corridor index to enumerate against. This script therefore hand-selects
 * three real corridor candidates found via the site's own on-site search
 * (see ephemeral/ephemeralAdapter.ts's doc comment) — this is the same kind
 * of bounded, hand-identified candidate set used throughout this
 * experimental harness, not a claim of automated full-corpus discovery.
 *
 * Each candidate's `address` field is supplied here at the harness level
 * (either lifted verbatim from the article's own body text, or externally
 * known when the article never states a house number) — exactly the same
 * role `address` plays as an externally-supplied grounding input in
 * hiddenCityExtractor.ts's HiddenCityExtractionInput (there sourced from an
 * already-matched PAB record, not parsed from the article body itself).
 *
 * Does NOT merge output into curatedLocalHistory.ts and does NOT deploy/
 * push/change API/client/cache behavior — it only produces a checked report
 * for inspection.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-ephemeral-production-proof.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  fetchEphemeralArticle,
  type EphemeralArticle,
} from "./ephemeral/ephemeralAdapter";
import {
  extractEphemeralClaims,
  buildEphemeralSource,
} from "./ephemeral/ephemeralExtractor";
import {
  fetchOsmBboxIndex,
  groundEphemeralAddress,
  W38_W53_CORRIDOR_BBOX,
  type EphemeralGroundingResult,
} from "./ephemeral/ephemeralGrounding";
import type { Claim, ProposedIdentityType, Source } from "./types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

interface Candidate {
  placeKey: string;
  url: string;
  /** "" for a genuinely non-point/line-shaped claim (the Ninth Avenue El) — never a guessed/approximate point. */
  address: string;
  streetName: string;
  title: string;
  note: string;
}

const CANDIDATES: Candidate[] = [
  {
    placeKey: "eny-clinton-court",
    url: "https://ephemeralnewyork.wordpress.com/2017/09/25/a-secret-alley-behind-a-street-in-hells-kitchen/",
    address: "422 West 46th Street",
    streetName: "West 46th Street",
    title: "Clinton Court",
    note: "Ordinary building-grounded example. Address IS stated in the article's own body text (\"420 and 422 West 46th Street\") — exercises the shared extractor's address-based relevance path.",
  },
  {
    placeKey: "eny-actors-temple",
    url: "https://ephemeralnewyork.wordpress.com/2022/09/23/the-little-hells-kitchen-synagogue-where-old-broadway-stars-once-worshipped/",
    address: "339 West 47th Street",
    streetName: "West 47th Street",
    title: "Actors' Temple",
    note: "Secondary building-grounded example. The article's body text names the street (\"West 47th Street\") but never a house number — address here is externally known (Congregation Ezrath Israel's real address), supplied the same way hiddenCityExtractor.ts's `address` is supplied from an already-matched record rather than parsed from prose. Exercises the shared extractor's identity-anchor-only relevance path.",
  },
  {
    placeKey: "eny-ninth-avenue-el",
    url: "https://ephemeralnewyork.wordpress.com/2024/01/29/what-it-was-like-walking-under-the-ninth-avenue-el/",
    address: "",
    streetName: "Ninth Avenue",
    title: "Ninth Avenue Elevated Railway",
    note: "Non-building/physical-trace/vanished-infrastructure example. The El ran the entire length of Ninth Avenue through this corridor for 72 years (1868-1940); the article never ties its claims to a specific corridor cross-street or address. address is deliberately empty — this is a genuine test of the fail-closed path (see the dedicated section below), not a fixture bug.",
  },
];

async function main() {
  console.log("--- Enumeration mechanism note ---");
  console.log(
    "Ephemeral New York is a WordPress.com-hosted blog; its /sitemap.xml is a flat <urlset> capped at ~100 most-recently-modified URLs (confirmed live 2026-09-20), NOT a full archive index. This proof identifies corridor candidates via the site's own on-site search (/?s=QUERY) instead — see ephemeral/ephemeralAdapter.ts's doc comment for the full live-confirmed retrieval-mechanism writeup.\n",
  );

  console.log("Fetching OSM bbox index (Overpass) for the corridor...");
  const osmIndex = await fetchOsmBboxIndex(W38_W53_CORRIDOR_BBOX);
  console.log(`OSM bbox index: ${osmIndex.length} addressed elements\n`);

  const claims: Claim[] = [];
  const sources: Record<string, Source> = {};
  const groundingByPlaceKey: Record<string, EphemeralGroundingResult> = {};
  const articlesByPlaceKey: Record<string, EphemeralArticle> = {};

  for (const candidate of CANDIDATES) {
    console.log(`Fetching: ${candidate.url}`);
    const article = await fetchEphemeralArticle(candidate.url);
    articlesByPlaceKey[candidate.placeKey] = article;
    console.log(
      `  title: "${article.title}" | publishedAt: ${article.publishedAt} | bodyText length: ${article.bodyText.length}`,
    );

    const grounding = groundEphemeralAddress(
      candidate.address || null,
      osmIndex,
    );
    groundingByPlaceKey[candidate.placeKey] = grounding;
    console.log(
      `  grounding: category=${grounding.category} confidence=${grounding.confidence}${grounding.matchedIdentifier ? ` matchedIdentifier=${grounding.matchedIdentifier}` : ""}${grounding.osmElementId ? ` osmElementId=${grounding.osmElementId}` : ""}`,
    );

    const recordClaims = extractEphemeralClaims({
      article,
      placeKey: candidate.placeKey,
      address: candidate.address,
      streetName: candidate.streetName,
      title: candidate.title,
      proposedIdentityType:
        grounding.proposedIdentityType as ProposedIdentityType,
    });
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
    console.log(
      `  extracted claims: ${recordClaims.length} (${[...new Set(recordClaims.map((c) => c.claimType))].join(", ") || "none"})\n`,
    );

    const source = buildEphemeralSource(article, recordClaims);
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

  // --- Validation 1: grounded candidates / productionSubjectId coverage ---
  const candidatesWithProductionSubjectId = Object.entries(groundingByPlaceKey)
    .filter(([, g]) => !!g.osmElementId)
    .map(([id]) => id);
  const candidatesWithoutProductionSubjectId = Object.entries(
    groundingByPlaceKey,
  )
    .filter(([, g]) => !g.osmElementId)
    .map(([id, g]) => ({
      placeKey: id,
      category: g.category,
      confidence: g.confidence,
    }));

  console.log("--- 1. Grounded candidates / productionSubjectId coverage ---");
  console.log(`  candidates: ${CANDIDATES.length}`);
  console.log(
    `  with deterministic productionSubjectId: ${candidatesWithProductionSubjectId.length}`,
  );
  console.log(`  without (non-projectable at grounding stage):`);
  for (const c of candidatesWithoutProductionSubjectId) {
    console.log(
      `    ${c.placeKey}: category=${c.category} confidence=${c.confidence}`,
    );
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

  for (const subjectId of passedSubjectIds) {
    const claimIds = gated.compositionMap[subjectId];
    const group = claimIds.map(
      (id) => artifact.claims.find((r) => r.claimId === id)!,
    );
    console.log(
      `  PASS ${subjectId} (${group.length} claims, types: ${[...new Set(group.map((g) => g.claim.claimType))].join(", ")}) — placeKey=${group[0].claim.placeKey}`,
    );
  }
  for (const subjectId of rejectedSubjectIds) {
    const claimIds = projection.compositionMap[subjectId];
    const group = claimIds.map(
      (id) => artifact.claims.find((r) => r.claimId === id)!,
    );
    console.log(
      `  FAIL ${subjectId} (${group.length} claims, types: ${[...new Set(group.map((g) => g.claim.claimType))].join(", ")}) — placeKey=${group[0].claim.placeKey} — reasons: ${gated.worthinessBySubject[subjectId].worthinessReasons.join("; ")}`,
    );
  }
  console.log();

  // --- Dedicated section: the Ninth Avenue El's non-building fail-closed outcome ---
  const elClaims = artifact.claims.filter(
    (r) => r.claim.placeKey === "eny-ninth-avenue-el",
  );
  const elGrounding = groundingByPlaceKey["eny-ninth-avenue-el"];
  console.log("--- Non-building case: Ninth Avenue Elevated Railway ---");
  console.log(
    `  address supplied: "" (deliberately none — inherently line/area-shaped claim)`,
  );
  console.log(
    `  grounding result: category=${elGrounding.category} confidence=${elGrounding.confidence} osmElementId=${elGrounding.osmElementId ?? "(none)"}`,
  );
  console.log(
    `  claims extracted: ${elClaims.length} (relevance succeeded via identity-anchor scoping despite no address)`,
  );
  for (const r of elClaims) {
    console.log(
      `    claimId=${r.claimId} type=${r.claim.claimType} decision=${r.decision.decision} reasons=${r.decision.reasons?.join("; ") ?? ""}`,
    );
  }
  console.log(
    `  productionSubjectId assigned: ${elClaims.some((r) => r.subjectId) ? "yes (unexpected!)" : "no (expected — non-projectable)"}`,
  );
  console.log(
    `  appears in runtime projection: ${projectedSubjectIds.some((id) => (projection.compositionMap[id] ?? []).some((cid) => elClaims.some((r) => r.claimId === cid))) ? "yes (unexpected!)" : "no (expected)"}\n`,
  );

  const outDir = dirname(fileURLToPath(import.meta.url));
  writeFileSync(
    join(outDir, "report-ephemeral-production-proof.json"),
    JSON.stringify(
      {
        corridorBbox: W38_W53_CORRIDOR_BBOX,
        candidates: CANDIDATES,
        osmIndexSize: osmIndex.length,
        groundingByPlaceKey,
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
        ninthAvenueElResult: {
          grounding: elGrounding,
          claims: elClaims.map((r) => ({
            claimId: r.claimId,
            claimType: r.claim.claimType,
            text: r.claim.claimText,
            decision: r.decision,
            subjectId: r.subjectId,
          })),
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
    `Full structured output written to ${join(outDir, "report-ephemeral-production-proof.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
