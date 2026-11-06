// Core, DB-independent import pipeline: takes a parsed OPL extract plus the
// approved-rescue target list, and produces the exact row set that would be
// written to osm_places_staging for one region. Pure function — no I/O, no
// @workspace/db dependency — so it is fully testable via tsx/vitest without
// a database. Staging-write/row-count-check/swap are separate, DB-dependent
// steps in stagingWriter.ts.

import type { ParsedOpl } from "./opl";
import { matchesAnySelector, matchingSelectorIds } from "./selectors";
import { nodeCoordinate, wayBBoxCenter, relationBBoxCenter } from "./geometry";
import type { ApprovedRescueTarget } from "./approvedRescue";

export interface ImportCandidateRow {
  osmType: "node" | "way" | "relation";
  osmId: string;
  name: string | null;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  isApprovedRescue: boolean;
  osmVersion: number | null;
  matchedSelectorIds: string[]; // diagnostics only, not written to the DB row shape
}

export interface ImportRunDiagnostics {
  nodeCount: number;
  wayCount: number;
  relationCount: number;
  selectorMatchCount: number;
  approvedRescueMatchCount: number;
  approvedRescueMissingIds: string[]; // approved target ids not found anywhere in this extract
  unresolvedGeometryIds: string[]; // way/relation ids skipped because no coordinate could be resolved
  duplicateIdsCollapsed: number; // how many extra selector/rescue matches for an id already seen were discarded by dedupe
}

export interface ImportRunResult {
  rows: ImportCandidateRow[];
  diagnostics: ImportRunDiagnostics;
}

export function runImportPipeline(
  parsed: ParsedOpl,
  approvedTargets: ApprovedRescueTarget[],
): ImportRunResult {
  const rowsByKey = new Map<string, ImportCandidateRow>();
  const unresolvedGeometryIds: string[] = [];
  let selectorMatchCount = 0;
  let duplicateIdsCollapsed = 0;

  function dedupeKey(osmType: string, osmId: string): string {
    return `${osmType}/${osmId}`;
  }

  function addRow(row: ImportCandidateRow): void {
    const key = dedupeKey(row.osmType, row.osmId);
    const existing = rowsByKey.get(key);
    if (existing) {
      duplicateIdsCollapsed++;
      // A later rescue-pass hit on an id already admitted by the selector
      // pass should still mark isApprovedRescue=true (rescue status is
      // informational, not mutually exclusive with a genuine selector
      // match), and vice versa.
      if (row.isApprovedRescue) existing.isApprovedRescue = true;
      for (const id of row.matchedSelectorIds) {
        if (!existing.matchedSelectorIds.includes(id)) {
          existing.matchedSelectorIds.push(id);
        }
      }
      return;
    }
    rowsByKey.set(key, row);
  }

  // --- Pass 1: normal selector matching over nodes/ways/relations ---
  for (const node of parsed.nodes.values()) {
    if (!matchesAnySelector(node.tags)) continue;
    selectorMatchCount++;
    const { lat, lon } = nodeCoordinate(node);
    addRow({
      osmType: "node",
      osmId: node.id,
      name: node.tags.name ?? null,
      lat,
      lon,
      tags: node.tags,
      isApprovedRescue: false,
      osmVersion: null,
      matchedSelectorIds: matchingSelectorIds(node.tags),
    });
  }

  for (const way of parsed.ways.values()) {
    if (!matchesAnySelector(way.tags)) continue;
    selectorMatchCount++;
    try {
      const center = wayBBoxCenter(way);
      addRow({
        osmType: "way",
        osmId: way.id,
        name: way.tags.name ?? null,
        lat: center.lat,
        lon: center.lon,
        tags: way.tags,
        isApprovedRescue: false,
        osmVersion: null,
        matchedSelectorIds: matchingSelectorIds(way.tags),
      });
    } catch {
      unresolvedGeometryIds.push(`way/${way.id}`);
    }
  }

  for (const relation of parsed.relations.values()) {
    if (!matchesAnySelector(relation.tags)) continue;
    selectorMatchCount++;
    const center = relationBBoxCenter(relation, parsed);
    if (Number.isNaN(center.lat) || Number.isNaN(center.lon)) {
      unresolvedGeometryIds.push(`relation/${relation.id}`);
      continue;
    }
    addRow({
      osmType: "relation",
      osmId: relation.id,
      name: relation.tags.name ?? null,
      lat: center.lat,
      lon: center.lon,
      tags: relation.tags,
      isApprovedRescue: false,
      osmVersion: null,
      matchedSelectorIds: matchingSelectorIds(relation.tags),
    });
  }

  // --- Pass 2: approved-subject exact-ID rescue, bypassing every selector ---
  let approvedRescueMatchCount = 0;
  const approvedRescueMissingIds: string[] = [];

  for (const target of approvedTargets) {
    let element: { tags: Record<string, string> } | undefined;
    let coord: { lat: number; lon: number } | undefined;

    if (target.osmType === "node") {
      const node = parsed.nodes.get(target.osmId);
      if (node) {
        element = node;
        coord = nodeCoordinate(node);
      }
    } else if (target.osmType === "way") {
      const way = parsed.ways.get(target.osmId);
      if (way) {
        element = way;
        try {
          coord = wayBBoxCenter(way);
        } catch {
          coord = undefined;
        }
      }
    } else {
      const relation = parsed.relations.get(target.osmId);
      if (relation) {
        element = relation;
        const center = relationBBoxCenter(relation, parsed);
        if (!Number.isNaN(center.lat) && !Number.isNaN(center.lon)) {
          coord = center;
        }
      }
    }

    if (!element || !coord) {
      approvedRescueMissingIds.push(`${target.osmType}/${target.osmId}`);
      continue;
    }

    approvedRescueMatchCount++;
    addRow({
      osmType: target.osmType,
      osmId: target.osmId,
      name: element.tags.name ?? null,
      lat: coord.lat,
      lon: coord.lon,
      tags: element.tags,
      isApprovedRescue: true,
      osmVersion: null,
      matchedSelectorIds: [],
    });
  }

  return {
    rows: [...rowsByKey.values()],
    diagnostics: {
      nodeCount: parsed.nodes.size,
      wayCount: parsed.ways.size,
      relationCount: parsed.relations.size,
      selectorMatchCount,
      approvedRescueMatchCount,
      approvedRescueMissingIds,
      unresolvedGeometryIds,
      duplicateIdsCollapsed,
    },
  };
}

// --- Row validation ahead of a staging write ---

export interface RowValidationError {
  osmType: string;
  osmId: string;
  reason: string;
}

export function validateRows(rows: ImportCandidateRow[]): RowValidationError[] {
  const errors: RowValidationError[] = [];
  for (const row of rows) {
    if (typeof row.lat !== "number" || Number.isNaN(row.lat)) {
      errors.push({
        osmType: row.osmType,
        osmId: row.osmId,
        reason: "missing/invalid lat",
      });
    }
    if (typeof row.lon !== "number" || Number.isNaN(row.lon)) {
      errors.push({
        osmType: row.osmType,
        osmId: row.osmId,
        reason: "missing/invalid lon",
      });
    }
    if (!row.tags || typeof row.tags !== "object") {
      errors.push({
        osmType: row.osmType,
        osmId: row.osmId,
        reason: "missing tags",
      });
    }
    if (
      row.osmType !== "node" &&
      row.osmType !== "way" &&
      row.osmType !== "relation"
    ) {
      errors.push({
        osmType: row.osmType,
        osmId: row.osmId,
        reason: "invalid osmType",
      });
    }
  }
  return errors;
}
