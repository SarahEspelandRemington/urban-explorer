/**
 * TEMP-WALK-CANDIDATE-FUNNEL-DIAGNOSTIC: remove after one successful
 * dense-area field session has been captured and analyzed.
 *
 * Walk-only diagnostic making the pre-copy-gen candidate funnel observable
 * for one bounded field session (2026-11 Nov. 3 Midtown-missed-landmarks
 * follow-up). Answers, from a single server log, which of these stages a
 * given candidate fell out at:
 *   1. never entered the raw OSM candidate set;
 *   2. entered raw OSM but was excluded before copyGenCandidates;
 *   3. entered copyGenCandidates but ranked below the 22 cap;
 *   4. ranked below the cap and would/would not qualify for reserved-slot
 *      promotion under the existing (separate, shadow-only) rule.
 *
 * Reuses the SAME Walk-only / over-cap gate as walkReservedSlotShadow.ts,
 * and the exact SAME exact-knowledge-tag / displacement-protection
 * definitions (imported, not reimplemented) so results are directly
 * comparable to that shadow's output. Pure: no I/O, no mutation of its
 * inputs, never affects live candidate selection, ranking, or response
 * content. Logs only osmId/name/distance/rank/boolean flags and a
 * deterministic exclusion-reason enum — never evidence text, descriptions,
 * generated copy, or Wikipedia content.
 *
 * Pre-copy-gen exclusion reasons are derived by re-applying the SAME
 * existing, already-imported pure predicates production uses at each
 * stage (denylist Set membership, isBoringResidentialBuilding,
 * isOrdinaryCommercialUse, STALE_OSM_IDS, radius math, osm_bare +
 * curated-entry check) to each raw candidate that didn't make it into
 * copyGenCandidates — in the same order production applies them. This is
 * not a new taxonomy; it is the existing filtering logic replayed for
 * diagnostic classification only. If no stage's predicate matches (should
 * not happen given the stages above are exhaustive), the reason falls back
 * to "not_retained" rather than guessing.
 */
import { computeOsmTrustLevel } from "./osmTrustLevel";
import { isBoringResidentialBuilding } from "./residentialBuildingFilter";
import { isOrdinaryCommercialUse } from "./commercialUseFilter";
import { STALE_OSM_IDS } from "./streetlitPlaces";
import { getApprovedCuratedEntry } from "./curatedLocalHistory";
import {
  exactKnowledgeTags,
  isDisplacementProtected,
  type ReservedSlotShadowCandidate,
} from "./walkReservedSlotShadow";

export type FunnelExclusionReason =
  | "denylist_building"
  | "boring_residential"
  | "ordinary_commercial_use"
  | "stale_osm_id"
  | "outside_radius"
  | "osm_bare_no_curated"
  | "not_retained";

export interface FunnelRawCandidate {
  osmId: string;
  name: string;
  tags: Record<string, string>;
  distanceMeters: number;
}

export interface FunnelCopyGenCandidateInput {
  osmId: string;
  name: string;
  tags: Record<string, string>;
  candidateOrigin?: "streetlit" | "approvedRescue";
  distanceMeters: number;
}

export interface WalkCandidateFunnelCandidateRow {
  osmId: string;
  name: string;
  distanceMeters: number;
  distanceRank: number;
  insideCap: boolean;
  hasExactKnowledgeTag: boolean;
  isDisplacementProtected: boolean;
}

export interface WalkCandidateFunnelExcludedRow {
  osmId: string;
  name: string;
  distanceMeters: number;
  reason: FunnelExclusionReason;
}

export interface WalkCandidateFunnelDiagnostic {
  timestamp: string;
  requestCenter: { lat: number; lon: number };
  requestedRadiusMeters: number;
  candidateCap: number;
  counts: { rawOsmCandidates: number; copyGenCandidates: number };
  /** Full ordered copyGenCandidates list — both inside and below the cap. */
  copyGenCandidateList: WalkCandidateFunnelCandidateRow[];
  /** Raw OSM candidates present in rawOsmCandidates but absent from copyGenCandidates. */
  excludedBeforeCopyGen: WalkCandidateFunnelExcludedRow[];
}

/**
 * Classifies why a raw OSM candidate that is NOT in copyGenCandidates was
 * excluded, by replaying the same deterministic predicates production
 * already applies, in production's own order. Pure, cheap (no new network
 * or model calls).
 */
export function classifyPreCopyGenExclusionReason(
  candidate: FunnelRawCandidate,
  deps: {
    effectiveDenylist: ReadonlySet<string>;
    searchRadiusMeters: number;
  },
): FunnelExclusionReason {
  const building = (candidate.tags["building"] ?? "").toLowerCase();
  if (building && deps.effectiveDenylist.has(building)) {
    return "denylist_building";
  }
  const hasCurated = getApprovedCuratedEntry(candidate.osmId) !== undefined;
  if (isBoringResidentialBuilding(candidate.tags) && !hasCurated) {
    return "boring_residential";
  }
  if (isOrdinaryCommercialUse(candidate.tags) && !hasCurated) {
    return "ordinary_commercial_use";
  }
  if (STALE_OSM_IDS.has(candidate.osmId)) {
    return "stale_osm_id";
  }
  if (candidate.distanceMeters > deps.searchRadiusMeters * 1.1) {
    return "outside_radius";
  }
  if (computeOsmTrustLevel(candidate.tags) === "osm_bare" && !hasCurated) {
    return "osm_bare_no_curated";
  }
  return "not_retained";
}

/**
 * Mirrors the exact Walk-only / over-cap gate used by both this diagnostic
 * and walkReservedSlotShadow.ts, extracted to a pure function so the gate
 * itself is directly unit-testable without exercising the route handler.
 */
export function shouldEmitWalkCandidateFunnelDiagnostic(
  walkMode: boolean | undefined,
  copyGenCandidatesCount: number,
  candidateCap: number,
): boolean {
  return Boolean(walkMode) && copyGenCandidatesCount > candidateCap;
}

export function buildWalkCandidateFunnelDiagnostic(input: {
  requestCenter: { lat: number; lon: number };
  requestedRadiusMeters: number;
  candidateCap: number;
  rawOsmCandidates: readonly FunnelRawCandidate[];
  copyGenCandidates: readonly FunnelCopyGenCandidateInput[];
  effectiveDenylist: ReadonlySet<string>;
  now?: () => Date;
}): WalkCandidateFunnelDiagnostic {
  const ranked = [...input.copyGenCandidates].sort(
    (a, b) => a.distanceMeters - b.distanceMeters,
  );
  const copyGenCandidateList: WalkCandidateFunnelCandidateRow[] = ranked.map(
    (c, i) => {
      const distanceRank = i + 1;
      const isCuratedBareException =
        computeOsmTrustLevel(c.tags) === "osm_bare" &&
        getApprovedCuratedEntry(c.osmId) !== undefined;
      const shadowCandidate: ReservedSlotShadowCandidate = {
        osmId: c.osmId,
        name: c.name,
        tags: c.tags,
        candidateOrigin: c.candidateOrigin,
        isCuratedBareException,
        distanceMeters: c.distanceMeters,
      };
      return {
        osmId: c.osmId,
        name: c.name,
        distanceMeters: c.distanceMeters,
        distanceRank,
        insideCap: distanceRank <= input.candidateCap,
        hasExactKnowledgeTag: exactKnowledgeTags(c.tags).length > 0,
        isDisplacementProtected: isDisplacementProtected(shadowCandidate),
      };
    },
  );

  const copyGenIds = new Set(input.copyGenCandidates.map((c) => c.osmId));
  const excludedBeforeCopyGen: WalkCandidateFunnelExcludedRow[] =
    input.rawOsmCandidates
      .filter((c) => !copyGenIds.has(c.osmId))
      .map((c) => ({
        osmId: c.osmId,
        name: c.name,
        distanceMeters: c.distanceMeters,
        reason: classifyPreCopyGenExclusionReason(c, {
          effectiveDenylist: input.effectiveDenylist,
          searchRadiusMeters: input.requestedRadiusMeters,
        }),
      }));

  const timestamp = (input.now ?? (() => new Date()))().toISOString();

  return {
    timestamp,
    requestCenter: input.requestCenter,
    requestedRadiusMeters: input.requestedRadiusMeters,
    candidateCap: input.candidateCap,
    counts: {
      rawOsmCandidates: input.rawOsmCandidates.length,
      copyGenCandidates: input.copyGenCandidates.length,
    },
    copyGenCandidateList,
    excludedBeforeCopyGen,
  };
}

/** Rows per log chunk, shared by both copyGenCandidateList and
 * excludedBeforeCopyGen, chosen to keep each emitted log line comfortably
 * under common log-pipeline size limits even in a very dense area — no
 * official Render per-line byte limit is published, so this targets a
 * conservative ceiling well under commonly-seen hosted-logging thresholds
 * (measured ~191 bytes/copyGenCandidateList row worst case: 40 rows + shared
 * context ≈ 7.9KB per event). Lowered from an earlier 80-row value, which
 * left copyGenCandidateList entirely unchunked on event 0 — unbounded by
 * real-world candidate density. See module caller's size estimate. */
export const WALK_CANDIDATE_FUNNEL_ROWS_PER_CHUNK = 40;

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Converts one diagnostic into one or more plain log-payload objects. Pure —
 * callers do the actual logger.info(...) call per returned object, adding
 * reqId themselves (not part of this pure function's output, same as
 * walkReservedSlotShadow.ts's pattern — reqId is a logging concern, not a
 * diagnostic-computation input).
 *
 * copyGenCandidateList and excludedBeforeCopyGen are each split into their
 * own numbered, deterministically-ordered chunk sequence (never bundled
 * together on one event), since copyGenCandidateList's length is unbounded
 * by this module and dumping it whole onto one event defeated the purpose
 * of chunking excludedBeforeCopyGen. The returned array is every
 * copyGenCandidateList-chunk event followed by every
 * excludedBeforeCopyGen-chunk event. requestCenter/requestedRadiusMeters/
 * candidateCap/counts/timestamp are repeated on every event so each is
 * independently identifiable and reassemblable; copyGenChunkCount and
 * excludedChunkCount are also present on every event (so either list's
 * total chunk count is knowable from any single event), while
 * copyGenChunkIndex/excludedChunkIndex are present only on the events that
 * actually carry that list's data.
 */
export function buildWalkCandidateFunnelLogEvents(
  diagnostic: WalkCandidateFunnelDiagnostic,
  rowsPerChunk: number = WALK_CANDIDATE_FUNNEL_ROWS_PER_CHUNK,
): Array<Record<string, unknown>> {
  const copyGenChunks: WalkCandidateFunnelCandidateRow[][] =
    diagnostic.copyGenCandidateList.length === 0
      ? [[]]
      : chunk(diagnostic.copyGenCandidateList, rowsPerChunk);
  const excludedChunks: WalkCandidateFunnelExcludedRow[][] =
    diagnostic.excludedBeforeCopyGen.length === 0
      ? [[]]
      : chunk(diagnostic.excludedBeforeCopyGen, rowsPerChunk);
  const copyGenChunkCount = copyGenChunks.length;
  const excludedChunkCount = excludedChunks.length;

  const sharedContext = {
    timestamp: diagnostic.timestamp,
    requestCenter: diagnostic.requestCenter,
    requestedRadiusMeters: diagnostic.requestedRadiusMeters,
    candidateCap: diagnostic.candidateCap,
    counts: diagnostic.counts,
  };

  const copyGenEvents = copyGenChunks.map(
    (copyGenChunk, copyGenChunkIndex) => ({
      ...sharedContext,
      copyGenChunkIndex,
      copyGenChunkCount,
      excludedChunkCount,
      copyGenCandidateList: copyGenChunk,
    }),
  );

  const excludedEvents = excludedChunks.map(
    (excludedChunk, excludedChunkIndex) => ({
      ...sharedContext,
      excludedChunkIndex,
      excludedChunkCount,
      copyGenChunkCount,
      excludedBeforeCopyGen: excludedChunk,
    }),
  );

  return [...copyGenEvents, ...excludedEvents];
}
