/**
 * Task F — cross-source enrichment experiment. Offline/non-production,
 * experimental — see README.md.
 *
 * FROZEN PAB retrieval/interpretation/grounding/claim-extraction ->
 * NEW Baldwin Park place-driven page matching (Stage 1) -> NEW Baldwin Park
 * narrative claim extraction (Stage 2) -> NEW place-based cross-source join
 * + provenance-aware corroboration/conflict detection (Stage 3/4) ->
 * FROZEN downstream trust harness (checks.ts, grounding.ts, decide.ts,
 * editorial.ts) via the FROZEN runPipeline (Stage 5).
 *
 * No change to pabAdapter.ts, pabInterpreter.ts, pabGrounding.ts,
 * pabClaimExtractor.ts, checks.ts, grounding.ts, decide.ts, editorial.ts,
 * or pipeline.ts. The only "minimal handoff" onto existing PAB claims is
 * the same post-hoc proposedIdentityType/locationHints override already
 * used by run-pab-extraction.ts/run-pab-grounding.ts, extended here to
 * also stamp newly-extracted Baldwin Park claims with the same grounded
 * identity for the same place.
 *
 * METHODOLOGY NOTE (2026-09-14): philadelphiabuildings.org's server was
 * observed returning a sustained Cloudflare 524 gateway timeout across 5+
 * retry attempts over 13+ minutes during this run — a genuine outage, not
 * transient noise (confirmed independently via raw curl/fetch probes
 * outside this script). Rather than block indefinitely on a live external
 * service for an offline/experimental harness, this script falls back to
 * reconstructing the same PAB claims/grounding from the already-validated,
 * already-committed Task E artifact (report-pab-extraction.json) when live
 * retrieval fails. This reuses the EXACT claim objects Task E's frozen
 * pipeline already produced (not re-derived or approximated) for every
 * field except each reconstructed Source's capability *strength*, which is
 * uniformly set to "medium" rather than the original per-signal-quality
 * value (e.g. "high" for a named-citation identity or dated-architect
 * claim). This does not change any AUTO-ADMIT/HOLD/SUPPRESS decision,
 * because decide.ts's factualTrustFor only distinguishes "low" from
 * not-low — every claim type buildPabSource actually grants a capability
 * for was already the exact claim type it emits claims for (medium or
 * high), so reconstructing all of them at "medium" reproduces identical
 * decisions and only widens the reported factualTrust field's high->medium
 * granularity for a small number of claims. Re-run this script once PAB's
 * server has recovered to exercise the live path instead.
 *
 * Usage: scripts/node_modules/.bin/tsx experiments/hybrid-discovery-v0.1/run-cross-source-enrichment.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { retrievePabCorridor, type PabRetrievalRecord } from "./pab/pabAdapter";
import {
  classifyPabRecord,
  type PabInterpretedRecord,
} from "./pab/pabInterpreter";
import {
  buildPabSource,
  extractClaimsFromPabRecord,
} from "./pab/pabClaimExtractor";
import { fetchOsmStreetIndex, groundPabRecord } from "./pab/pabGrounding";
import { findBaldwinParkMatches } from "./baldwinpark/baldwinParkMatcher";
import {
  extractBaldwinParkClaims,
  buildBaldwinParkSource,
} from "./baldwinpark/baldwinParkExtractor";
import type { BaldwinParkPage } from "./baldwinpark/baldwinParkAdapter";
import { joinPabAndBaldwinParkClaims } from "./crossSourceJoin";
import type { Claim, ProposedIdentityType, Source } from "./types";
import { runPipeline } from "./pipeline";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function primaryAddress(record: PabRetrievalRecord): string {
  return record.matchedCorridorAddresses[0] ?? record.addressBlock[0] ?? "";
}

interface PlaceInput {
  placeKey: string;
  address: string;
  title: string;
  proposedIdentityType: ProposedIdentityType;
  pabClaims: Claim[];
  pabSource: Source;
}

/** PAB's server has occasionally returned transient Cloudflare 524 timeouts; this is an orchestration-level retry around the FROZEN, unmodified retrievePabCorridor call — not a change to pabAdapter.ts's own retrieval/parsing logic. */
async function retrievePabCorridorWithRetry(
  input: Parameters<typeof retrievePabCorridor>[0],
  attempts = 5,
): Promise<Awaited<ReturnType<typeof retrievePabCorridor>>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await retrievePabCorridor(input);
    } catch (err) {
      if (attempt >= attempts) throw err;
      console.error(
        `  retrievePabCorridor attempt ${attempt} failed (${(err as Error).message.slice(0, 80)}...), retrying in ${attempt * 5}s`,
      );
      await sleep(attempt * 5000);
    }
  }
}

/** Live path: frozen retrieval -> frozen interpretation -> frozen grounding -> frozen claim extraction, with the existing minimal post-hoc grounding handoff onto claim fields (same pattern as run-pab-extraction.ts). */
async function buildPlacesFromLivePab(): Promise<PlaceInput[]> {
  const adapterResult = await retrievePabCorridorWithRetry({
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
  console.log(`claim-bearing records: ${claimBearing.length}`);

  console.log(
    "Fetching OSM street index for Spring Garden St, Philadelphia (Overpass)...",
  );
  const osmIndex = await fetchOsmStreetIndex("Spring Garden", "Philadelphia");
  console.log(`OSM street index: ${osmIndex.length} elements\n`);

  const places: PlaceInput[] = [];
  for (const interpretedRecord of claimBearing) {
    const record = adapterResult.records.find(
      (r) => r.pabId === interpretedRecord.pabId,
    )!;
    const grounding = groundPabRecord(record, interpretedRecord, osmIndex);
    const placeKey = `pab-record-${record.pabId}`;
    const address = primaryAddress(record);

    const pabSource = buildPabSource(record, interpretedRecord);
    const pabClaims = extractClaimsFromPabRecord(record, interpretedRecord);
    for (const claim of pabClaims) {
      claim.proposedIdentityType = grounding.proposedIdentityType;
      if (grounding.matchedIdentifier || grounding.matchingSignal) {
        claim.locationHints = [
          grounding.matchedIdentifier,
          grounding.matchingSignal,
        ]
          .filter(Boolean)
          .join(" — ");
      }
    }
    places.push({
      placeKey,
      address,
      title: interpretedRecord.title,
      proposedIdentityType: grounding.proposedIdentityType,
      pabClaims,
      pabSource,
    });
  }
  return places;
}

/** Fallback path (see METHODOLOGY NOTE above): reconstructs the same place/claim/source data from Task E's already-committed, already-validated report-pab-extraction.json when PAB's live server is unavailable. */
function buildPlacesFromCachedTaskEReport(outDir: string): PlaceInput[] {
  const cached = JSON.parse(
    readFileSync(join(outDir, "report-pab-extraction.json"), "utf8"),
  );
  const outcomes: { claim: Claim }[] = cached.outcomes;
  const groundingByPabId: Record<
    string,
    { proposedIdentityType: ProposedIdentityType }
  > = cached.groundingByPabId;

  const byPlace = new Map<string, Claim[]>();
  for (const o of outcomes) {
    if (!byPlace.has(o.claim.placeKey)) byPlace.set(o.claim.placeKey, []);
    byPlace.get(o.claim.placeKey)!.push(o.claim);
  }

  const places: PlaceInput[] = [];
  for (const [placeKey, claims] of byPlace) {
    const pabId = placeKey.replace(/^pab-record-/, "");
    const address = claims[0].address ?? "";
    const identityClaim = claims.find((c) => c.id.endsWith("-identity"));
    const titleMatch = identityClaim?.claimText.match(
      /identifies this as "(.*)\."\s*$/,
    );
    const title = titleMatch ? titleMatch[1] : "(untitled)";
    const proposedIdentityType =
      groundingByPabId[pabId]?.proposedIdentityType ??
      claims[0].proposedIdentityType;

    const claimTypes = [...new Set(claims.map((c) => c.claimType))];
    const pabSource: Source = {
      id: `pab-${pabId}`,
      title: `Philadelphia Architects and Buildings — ${title} (${address})`,
      sourceClass: "built-environment-cultural-database",
      capabilities: claimTypes.map((claimType) => ({
        claimType,
        strength: "medium",
        notes:
          "Reconstructed from cached Task E extraction artifact (PAB live retrieval unavailable at run time) — see this file's methodology note.",
      })),
    };

    places.push({
      placeKey,
      address,
      title,
      proposedIdentityType,
      pabClaims: claims,
      pabSource,
    });
  }
  return places;
}

async function main() {
  const outDir = dirname(fileURLToPath(import.meta.url));

  let places: PlaceInput[];
  let dataSourceNote: string;
  try {
    places = await buildPlacesFromLivePab();
    dataSourceNote =
      "live PAB retrieval (frozen pabAdapter.ts/pabInterpreter.ts/pabGrounding.ts/pabClaimExtractor.ts)";
  } catch (err) {
    console.error(
      `\nLive PAB retrieval failed after retries (${(err as Error).message}). Falling back to cached Task E extraction artifact — see this file's METHODOLOGY NOTE.\n`,
    );
    places = buildPlacesFromCachedTaskEReport(outDir);
    dataSourceNote =
      "FALLBACK: reconstructed from cached report-pab-extraction.json (PAB live retrieval unavailable — sustained Cloudflare 524 outage during this run)";
  }
  console.log(`PAB place data source: ${dataSourceNote}`);
  console.log(
    `${places.length} PAB-grounded, claim-bearing corridor places to search against Baldwin Park\n`,
  );

  const allClaims: Claim[] = [];
  const sources: Record<string, Source> = {};

  // --- Load the cached Baldwin Park corpus (see fetch-baldwinpark-pages.ts) ---
  const bpPages: BaldwinParkPage[] = JSON.parse(
    readFileSync(join(outDir, "baldwinpark-pages.json"), "utf8"),
  );
  console.log(`Loaded ${bpPages.length} cached Baldwin Park pages\n`);

  interface PlaceMatchResult extends PlaceInput {
    matchedPages: BaldwinParkPage[];
    skippedNonDominantPages: BaldwinParkPage[];
  }
  const placeResults: PlaceMatchResult[] = [];

  for (const place of places) {
    sources[place.pabSource.id] = place.pabSource;
    allClaims.push(...place.pabClaims);

    // --- NEW Stage 1: place-driven Baldwin Park page matching, address-required ---
    const allMatches = findBaldwinParkMatches(place.address, bpPages);
    const matchedPages = allMatches
      .filter((m) => m.isDominantSubject)
      .map((m) => m.page);
    const skippedNonDominantPages = allMatches
      .filter((m) => !m.isDominantSubject)
      .map((m) => m.page);

    placeResults.push({ ...place, matchedPages, skippedNonDominantPages });

    // --- NEW Stage 2: narrative claim extraction from matched pages, with the same minimal grounding handoff PAB claims already received ---
    for (const page of matchedPages) {
      const bpClaims = extractBaldwinParkClaims({
        page,
        placeKey: place.placeKey,
        address: place.address,
        title: place.title,
        proposedIdentityType: place.proposedIdentityType,
      });
      if (bpClaims.length === 0) continue;
      sources[`bp-${page.slug}`] = buildBaldwinParkSource(page, bpClaims);
      allClaims.push(...bpClaims);
    }
  }

  // --- NEW Stage 3/4: place-based join already happened via shared placeKey above; detect corroboration/conflict now ---
  const joinResult = joinPabAndBaldwinParkClaims(allClaims);

  // --- Frozen Stage 5: unchanged downstream harness ---
  const outcomes = runPipeline(allClaims, sources);

  // ============================== REPORT ==============================
  const placesSearched = placeResults.length;
  const placesWithConfidentMatch = placeResults.filter(
    (p) => p.matchedPages.length > 0,
  ).length;
  const bpClaims = allClaims.filter((c) =>
    c.sourceIds.some((id) => id.startsWith("bp-")),
  );
  console.log(
    "\n--- 1. PAB-grounded corridor places searched against Baldwin Park ---",
  );
  console.log(`  ${placesSearched}`);
  console.log("--- 2. Places with a confident Baldwin Park page match ---");
  console.log(`  ${placesWithConfidentMatch}`);
  console.log("--- 3. Narrative claims extracted from Baldwin Park ---");
  console.log(`  ${bpClaims.length}`);

  const placesGainingRicherClaim = new Set(
    outcomes
      .filter(
        (o) =>
          o.claim.sourceIds.some((id) => id.startsWith("bp-")) &&
          o.decision.decision === "AUTO-ADMIT" &&
          (o.decision.editorialQuality === "high" ||
            o.decision.editorialQuality === "medium"),
      )
      .map((o) => o.claim.placeKey),
  );
  console.log(
    "--- 4. Places gaining >=1 new medium/high-value claim from Baldwin Park (AUTO-ADMIT) ---",
  );
  console.log(`  ${placesGainingRicherClaim.size}`);

  console.log("--- 5. Genuinely cross-class corroborated claims ---");
  console.log(`  ${joinResult.corroboratedClaimIds.length}`);

  console.log("--- 6. Conflicts discovered between PAB and Baldwin Park ---");
  console.log(`  ${joinResult.conflicts.length}`);
  for (const c of joinResult.conflicts)
    console.log(
      `    ${c.claimIdA} vs ${c.claimIdB} [${c.claimType}]: ${c.reason}`,
    );

  const bpOutcomes = outcomes.filter((o) =>
    o.claim.sourceIds.some((id) => id.startsWith("bp-")),
  );
  const bpAdmit = bpOutcomes.filter(
    (o) => o.decision.decision === "AUTO-ADMIT",
  ).length;
  const bpHold = bpOutcomes.filter(
    (o) => o.decision.decision === "HOLD",
  ).length;
  const bpSuppress = bpOutcomes.filter(
    (o) => o.decision.decision === "SUPPRESS",
  ).length;
  console.log(
    "--- 7. AUTO-ADMIT/HOLD/SUPPRESS totals for newly extracted narrative claims ---",
  );
  console.log(
    `  AUTO-ADMIT: ${bpAdmit} | HOLD: ${bpHold} | SUPPRESS: ${bpSuppress} (total ${bpOutcomes.length})`,
  );

  const totalNonDominantSkipped = placeResults.reduce(
    (sum, p) => sum + p.skippedNonDominantPages.length,
    0,
  );
  console.log(
    "--- 8. False-positive page/place matches found during reconciliation ---",
  );
  console.log(
    `  ${totalNonDominantSkipped} non-dominant-subject page match(es) deliberately skipped (address matched but a different address is the page's actual profiled subject) — see full report for slugs.`,
  );

  console.log(
    "--- 9/10. False-positive relationship/story extraction + new trust-failure shapes: see written report and manual reconciliation notes. ---\n",
  );

  const strongestPlaces = [...placesGainingRicherClaim].map((placeKey) => {
    const place = placeResults.find((p) => p.placeKey === placeKey)!;
    const placeOutcomes = outcomes.filter((o) => o.claim.placeKey === placeKey);
    return {
      placeKey,
      address: place.address,
      title: place.title,
      pabContribution: placeOutcomes
        .filter((o) => o.claim.sourceIds.some((id) => id.startsWith("pab-")))
        .map((o) => ({
          claimType: o.claim.claimType,
          claimText: o.claim.claimText,
          decision: o.decision.decision,
          editorialQuality: o.decision.editorialQuality,
        })),
      baldwinParkContribution: placeOutcomes
        .filter((o) => o.claim.sourceIds.some((id) => id.startsWith("bp-")))
        .map((o) => ({
          claimType: o.claim.claimType,
          claimText: o.claim.claimText,
          decision: o.decision.decision,
          editorialQuality: o.decision.editorialQuality,
        })),
      heldOrSuppressed: placeOutcomes
        .filter((o) => o.decision.decision !== "AUTO-ADMIT")
        .map((o) => ({
          claimType: o.claim.claimType,
          decision: o.decision.decision,
          reasons: o.decision.reasons,
        })),
    };
  });

  console.log(
    `--- MOST IMPORTANT METRIC: distinct Spring Garden places materially more Streetlit-worthy from combined PAB + Baldwin Park evidence: ${placesGainingRicherClaim.size} ---\n`,
  );
  for (const p of strongestPlaces) {
    console.log(`  [${p.address}] ${p.title}`);
    console.log(
      `    PAB gave: ${p.pabContribution.map((c) => c.claimType).join(", ") || "(none admitted)"}`,
    );
    console.log(
      `    Baldwin Park gave: ${p.baldwinParkContribution.map((c) => c.claimType).join(", ") || "(none admitted)"}`,
    );
    if (p.heldOrSuppressed.length)
      console.log(
        `    Held/suppressed: ${p.heldOrSuppressed.map((h) => `${h.claimType}(${h.decision})`).join(", ")}`,
      );
  }

  writeFileSync(
    join(outDir, "report-cross-source-enrichment.json"),
    JSON.stringify(
      {
        dataSourceNote,
        placesSearched,
        placesWithConfidentMatch,
        narrativeClaimsExtracted: bpClaims.length,
        placesGainingRicherClaimCount: placesGainingRicherClaim.size,
        crossClassCorroboratedCount: joinResult.corroboratedClaimIds.length,
        conflicts: joinResult.conflicts,
        narrativeClaimTotals: {
          autoAdmit: bpAdmit,
          hold: bpHold,
          suppress: bpSuppress,
          total: bpOutcomes.length,
        },
        nonDominantSkippedPages: placeResults.flatMap((p) =>
          p.skippedNonDominantPages.map((pg) => ({
            placeKey: p.placeKey,
            address: p.address,
            pageSlug: pg.slug,
          })),
        ),
        strongestPlaces,
        placeResultsSummary: placeResults.map((p) => ({
          placeKey: p.placeKey,
          address: p.address,
          title: p.title,
          proposedIdentityType: p.proposedIdentityType,
          matchedPageSlugs: p.matchedPages.map((pg) => pg.slug),
          skippedNonDominantPageSlugs: p.skippedNonDominantPages.map(
            (pg) => pg.slug,
          ),
        })),
        outcomes,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nFull structured output written to ${join(outDir, "report-cross-source-enrichment.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
