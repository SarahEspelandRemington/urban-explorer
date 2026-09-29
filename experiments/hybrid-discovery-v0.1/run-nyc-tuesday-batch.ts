/**
 * NYC Tuesday Walk Mode field-batch — bounded production promotion.
 * Offline/non-production, experimental — see README.md.
 *
 * Three manually-selected candidate specimens (subject selection only —
 * ingestion/extraction/admission is the SAME unmodified production path used
 * by every other hybrid-discovery batch):
 *   1. Actors' Temple / 339 W 47th St — Ephemeral New York
 *   2. Clinton Court / 422 W 46th St — Ephemeral New York
 *   3. Actors Studio / 432 W 44th St — LPC (Socrata)
 *
 * Each candidate is run through generateArtifact() -> projectRuntimeCompat()
 * -> applyDiscoveryWorthinessGate() INDEPENDENTLY (unlike run-nyc-phase3-proof.ts,
 * these three do not share a physical building, so there is no cross-source
 * combination to do).
 *
 * One deliberate, documented per-batch AUDIT exclusion (not new pipeline
 * logic): Clinton Court's mechanically-extracted "relationship" claim (the
 * George Clinton / DeWitt Clinton claim) is dropped from this candidate's
 * input claim set before calling generateArtifact(), per explicit editorial
 * instruction — the claim conflates two different historical Clintons and
 * its own source text hedges it ("Yet some sources have it..."). This claim
 * passes every existing automated check and grounds/AUTO-ADMITs cleanly on
 * its own (confirmed via report-ephemeral-production-proof.json) — there is
 * no existing check that flags it, so this is a manual audit-level inclusion
 * decision, the same class of judgment already used in Hybrid Discovery v1
 * to exclude 9/13 whole subjects from that batch. No extractor, checks,
 * decide, grounding, or worthiness code is touched.
 *
 * Does NOT write to curatedLocalHistory.ts and does NOT deploy/push — only
 * produces a report for review.
 *
 * Usage: node scripts/node_modules/tsx/dist/cli.mjs experiments/hybrid-discovery-v0.1/run-nyc-tuesday-batch.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { retrieveLpcCorridor, W38_W53_CORRIDOR_BBOX } from "./lpc/lpcAdapter";
import {
  interpretLpcRecord,
  extractClaimsFromLpcRecord,
  buildLpcSource,
} from "./lpc/lpcClaimExtractor";
import { groundLpcRecord } from "./lpc/lpcGrounding";
import { fetchEphemeralArticle } from "./ephemeral/ephemeralAdapter";
import {
  extractEphemeralClaims,
  buildEphemeralSource,
} from "./ephemeral/ephemeralExtractor";
import {
  fetchOsmBboxIndex,
  groundEphemeralAddress,
} from "./ephemeral/ephemeralGrounding";
import type { Claim, ProposedIdentityType, Source } from "./types";
import {
  generateArtifact,
  type GeneratedEvidenceArtifact,
} from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";
import { projectRuntimeCompat } from "../../artifacts/api-server/src/lib/localHistoryAdmission/projector";
import { applyDiscoveryWorthinessGate } from "../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";

interface CandidateResult {
  label: string;
  lane: "ephemeral" | "lpc";
  claims: Claim[];
  sources: Record<string, Source>;
  excludedClaimIds?: string[];
}

async function main() {
  console.log("Fetching OSM bbox index (Overpass) for the corridor...");
  const osmIndex = await fetchOsmBboxIndex(W38_W53_CORRIDOR_BBOX);
  console.log(`OSM bbox index: ${osmIndex.length} addressed elements\n`);

  const results: CandidateResult[] = [];

  // --- 1. Actors' Temple / 339 W 47th — Ephemeral ---
  {
    const url =
      "https://ephemeralnewyork.wordpress.com/2022/09/23/the-little-hells-kitchen-synagogue-where-old-broadway-stars-once-worshipped/";
    console.log(`Fetching: ${url}`);
    const article = await fetchEphemeralArticle(url);
    const grounding = groundEphemeralAddress("339 West 47th Street", osmIndex);
    const claims = extractEphemeralClaims({
      article,
      placeKey: "eny-actors-temple",
      address: "339 West 47th Street",
      streetName: "West 47th Street",
      title: "Actors' Temple",
      proposedIdentityType:
        grounding.proposedIdentityType as ProposedIdentityType,
    });
    for (const claim of claims) {
      claim.proposedIdentityType = grounding.proposedIdentityType;
      if (grounding.matchedIdentifier || grounding.matchingSignal) {
        claim.locationHints = [
          grounding.matchedIdentifier,
          grounding.matchingSignal,
        ]
          .filter(Boolean)
          .join(" — ");
      }
      if (grounding.osmElementId)
        claim.productionSubjectId = grounding.osmElementId;
    }
    const source = buildEphemeralSource(article, claims);
    console.log(
      `  grounding: category=${grounding.category} confidence=${grounding.confidence} osmElementId=${grounding.osmElementId ?? "(none)"}`,
    );
    console.log(
      `  extracted claims: ${claims.length} (${claims.map((c) => c.claimType).join(", ") || "none"})\n`,
    );
    results.push({
      label: "Actors' Temple (339 West 47th Street)",
      lane: "ephemeral",
      claims,
      sources: { [source.id]: source },
    });
  }

  // --- 2. Clinton Court / 422 W 46th — Ephemeral (audit exclusion applied) ---
  {
    const url =
      "https://ephemeralnewyork.wordpress.com/2017/09/25/a-secret-alley-behind-a-street-in-hells-kitchen/";
    console.log(`Fetching: ${url}`);
    const article = await fetchEphemeralArticle(url);
    const grounding = groundEphemeralAddress("422 West 46th Street", osmIndex);
    const allClaims = extractEphemeralClaims({
      article,
      placeKey: "eny-clinton-court",
      address: "422 West 46th Street",
      streetName: "West 46th Street",
      title: "Clinton Court",
      proposedIdentityType:
        grounding.proposedIdentityType as ProposedIdentityType,
    });
    for (const claim of allClaims) {
      claim.proposedIdentityType = grounding.proposedIdentityType;
      if (grounding.matchedIdentifier || grounding.matchingSignal) {
        claim.locationHints = [
          grounding.matchedIdentifier,
          grounding.matchingSignal,
        ]
          .filter(Boolean)
          .join(" — ");
      }
      if (grounding.osmElementId)
        claim.productionSubjectId = grounding.osmElementId;
    }
    // AUDIT EXCLUSION (documented above): drop the George/DeWitt Clinton
    // relationship claim. Mechanically AUTO-ADMIT on its own — excluded by
    // explicit editorial instruction, not by any pipeline check.
    const excluded = allClaims.filter((c) => c.claimType === "relationship");
    const claims = allClaims.filter((c) => c.claimType !== "relationship");
    const source = buildEphemeralSource(article, allClaims);
    console.log(
      `  grounding: category=${grounding.category} confidence=${grounding.confidence} osmElementId=${grounding.osmElementId ?? "(none)"}`,
    );
    console.log(
      `  extracted claims: ${allClaims.length} (${allClaims.map((c) => c.claimType).join(", ")})`,
    );
    console.log(
      `  AUDIT-EXCLUDED before admission: ${excluded.map((c) => c.id).join(", ") || "(none)"}`,
    );
    console.log(
      `  claims proceeding to admission: ${claims.length} (${claims.map((c) => c.claimType).join(", ") || "none"})\n`,
    );
    results.push({
      label: "Clinton Court (422 West 46th Street)",
      lane: "ephemeral",
      claims,
      sources: { [source.id]: source },
      excludedClaimIds: excluded.map((c) => c.id),
    });
  }

  // --- 3. Actors Studio / 432 W 44th — LPC ---
  {
    console.log("Retrieving LPC corridor (Socrata)...");
    const adapterResult = await retrieveLpcCorridor(W38_W53_CORRIDOR_BBOX);
    const record = adapterResult.records.find(
      (r) => r.address === "432 West 44th Street",
    );
    if (!record) {
      throw new Error(
        "Actors Studio (432 West 44th Street) not found in the live LPC corridor retrieval — cannot proceed without hand-authoring a record.",
      );
    }
    const interpreted = interpretLpcRecord(
      record,
      adapterResult.fieldMap.fields,
    );
    const grounding = groundLpcRecord(record, interpreted, osmIndex);
    const claims = extractClaimsFromLpcRecord(record, interpreted);
    for (const claim of claims) {
      claim.proposedIdentityType = grounding.proposedIdentityType;
      if (grounding.matchedIdentifier || grounding.matchingSignal) {
        claim.locationHints = [
          grounding.matchedIdentifier,
          grounding.matchingSignal,
        ]
          .filter(Boolean)
          .join(" — ");
      }
      if (grounding.osmElementId)
        claim.productionSubjectId = grounding.osmElementId;
    }
    const source = buildLpcSource(record, interpreted);
    console.log(
      `  grounding: category=${grounding.category} confidence=${grounding.confidence} osmElementId=${grounding.osmElementId ?? "(none)"}`,
    );
    console.log(
      `  extracted claims: ${claims.length} (${claims.map((c) => c.claimType).join(", ") || "none"})\n`,
    );
    results.push({
      label: "Actors Studio (432 West 44th Street)",
      lane: "lpc",
      claims,
      sources: { [source.id]: source },
    });
  }

  // --- Run each candidate independently through the unmodified production path ---
  const report: Record<string, unknown> = {};
  for (const result of results) {
    const artifact: GeneratedEvidenceArtifact = generateArtifact(
      result.claims,
      result.sources,
      {
        generatedAt: new Date().toISOString(),
      },
    );
    const projection = projectRuntimeCompat(artifact);
    const gated = applyDiscoveryWorthinessGate(projection, artifact);

    console.log(`=== ${result.label} [${result.lane}] ===`);
    for (const rec of artifact.claims) {
      console.log(
        `  ${rec.claimId} [${rec.claim.claimType}] -> ${rec.decision.decision}`,
      );
    }
    const subjectIds = Object.keys(gated.entries);
    console.log(
      `  worthiness gate: PASS ${subjectIds.length} / rejected ${gated.rejectedForWorthiness.length}`,
    );
    if (subjectIds.length > 0) {
      for (const subjectId of subjectIds) {
        console.log(`  PROJECTED ENTRY (${subjectId}):`);
        console.log(`    ${gated.entries[subjectId].evidence.text}`);
      }
    }
    console.log();

    report[result.label] = {
      lane: result.lane,
      excludedClaimIds: result.excludedClaimIds ?? [],
      artifactSummary: artifact.summary,
      claims: artifact.claims.map((r) => ({
        claimId: r.claimId,
        claimType: r.claim.claimType,
        decision: r.decision,
        subjectId: r.subjectId,
        text: r.claim.claimText,
      })),
      worthiness: {
        passed: subjectIds,
        rejected: gated.rejectedForWorthiness,
        worthinessBySubject: gated.worthinessBySubject,
      },
      projectedEntries: gated.entries,
    };
  }

  const outDir = dirname(fileURLToPath(import.meta.url));
  writeFileSync(
    join(outDir, "report-nyc-tuesday-batch.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Full structured output written to ${join(outDir, "report-nyc-tuesday-batch.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
