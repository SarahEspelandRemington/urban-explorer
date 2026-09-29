/**
 * Automated claim extraction for "claim-bearing" PAB records. Offline/
 * non-production, experimental — see ../README.md.
 *
 * Fully automated: no human approval gates which records become claims.
 * Every claim-bearing record (per pabInterpreter.ts's deterministic
 * classification) produces claims here, using the same generic templates
 * for every record. proposedIdentityType is always left "unresolved" —
 * this module has no live-map/OSM lookup to confirm whether a record
 * corresponds to a surviving current building or a former site, and the
 * existing grounding layer already handles "unresolved" by holding rather
 * than auto-admitting, which is the correct behavior here (not a manual
 * verification requirement).
 */
import type { Claim, Source } from "../types";
import type { PabRetrievalRecord } from "./pabAdapter";
import type {
  PabChronologyEvent,
  PabInterpretedRecord,
  PabSignals,
} from "./pabInterpreter";

/** Normalizes M/D/YYYY or M/D/YY to an ISO yyyy-mm-dd string; returns undefined if unparseable. */
function toIsoDate(usDate: string): string | undefined {
  const m = usDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return undefined;
  const [, mo, day, yr] = m;
  const year = yr.length === 2 ? `19${yr}` : yr;
  return `${year}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Chronology dates are bare years or year ranges (e.g. "1884", "1861-1863"), not M/D/YYYY. */
function parseChronologyDateRange(
  dateRaw: string,
): { start?: string; end?: string; precise: boolean } | undefined {
  const range = dateRaw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range)
    return {
      start: `${range[1]}-01-01`,
      end: `${range[2]}-01-01`,
      precise: true,
    };
  const single = dateRaw.match(/^(\d{4})$/);
  if (single) return { start: `${single[1]}-01-01`, precise: true };
  return undefined;
}

function chronologyEventYears(dateRaw: string): string[] {
  return [...dateRaw.matchAll(/\b(1[5-9]\d{2}|20\d{2})\b/g)].map((m) => m[0]);
}

function chronologyEventCategory(
  eventRaw: string,
): "construction-date" | "demolition" | "event" {
  const e = eventRaw.toUpperCase();
  if (e === "BUILT") return "construction-date";
  if (/DEMOLISH|RAZ/.test(e)) return "demolition";
  return "event";
}

function normalizeArchitectName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * True when a chronology event's architect is the SAME (year, architect) fact
 * already captured by the record's inline datedArchitectRecord signal — the
 * 143269 (Osteopathic Hospital) case, where the Overview's inline citation
 * and the Chronology's 1916 ADDITIONS/ALTERATIONS row name the same architect
 * for the same year. Prevents emitting two "architect" claims for one fact.
 */
function isDuplicateOfInlineArchitect(
  architectName: string,
  event: PabChronologyEvent,
  signals: PabSignals,
): boolean {
  if (!signals.datedArchitectRecord) return false;
  const inlineYear = toIsoDate(signals.datedArchitectRecord.date)?.slice(0, 4);
  if (!inlineYear || !chronologyEventYears(event.dateRaw).includes(inlineYear))
    return false;
  return (
    normalizeArchitectName(architectName) ===
    normalizeArchitectName(signals.datedArchitectRecord.architect)
  );
}

function primaryAddress(record: PabRetrievalRecord): string {
  return record.matchedCorridorAddresses[0] ?? record.addressBlock[0] ?? "";
}

/** Which new-claim-type signals actually fired on this record, used to keep buildPabSource's capabilities and extractClaimsFromPabRecord's emitted claims in lock-step. */
function chronologyCapabilityFlags(signals: PabSignals) {
  const events = signals.chronologyEvents ?? [];
  const hasConstructionDate = events.some(
    (e) => chronologyEventCategory(e.eventRaw) === "construction-date",
  );
  const hasDemolition = events.some(
    (e) => chronologyEventCategory(e.eventRaw) === "demolition",
  );
  const hasEvent = events.some(
    (e) => chronologyEventCategory(e.eventRaw) === "event",
  );
  const hasNonDuplicateChronologyArchitect = events.some((e) =>
    e.architects.some((a) => !isDuplicateOfInlineArchitect(a, e, signals)),
  );
  const hasContractor = events.some((e) => e.contractors.length > 0);
  const hasClient = !!signals.client;
  const hasRelationship = hasContractor || hasClient;
  return {
    hasConstructionDate,
    hasDemolition,
    hasEvent,
    hasNonDuplicateChronologyArchitect,
    hasContractor,
    hasClient,
    hasRelationship,
  };
}

/** One dynamically-generated Source per claim-bearing PAB record, with capabilities derived from which evidence signals actually fired — not hand-authored per record. */
export function buildPabSource(
  record: PabRetrievalRecord,
  interpreted: PabInterpretedRecord,
): Source {
  const { signals } = interpreted;
  const capabilities: Source["capabilities"] = [
    {
      claimType: "identity",
      strength: signals.namedCitationWithYear ? "high" : "medium",
      notes: signals.namedCitationWithYear
        ? "cites an independently published, dated source"
        : "identity inferred from PAB's own record content only",
    },
  ];
  const chronoFlags = chronologyCapabilityFlags(signals);
  if (
    signals.datedArchitectRecord ||
    chronoFlags.hasNonDuplicateChronologyArchitect
  ) {
    capabilities.push({
      claimType: "architect",
      strength: "high",
      notes: "names a specific architect and an explicit dated record",
    });
  }
  if (signals.registerDateEntry) {
    capabilities.push({ claimType: "register-status", strength: "high" });
  }
  if (chronoFlags.hasConstructionDate) {
    capabilities.push({
      claimType: "construction-date",
      strength: "medium",
      notes: "PAB's own curated Project Chronology BUILT entry",
    });
  }
  if (chronoFlags.hasDemolition) {
    capabilities.push({
      claimType: "demolition",
      strength: "medium",
      notes: "PAB's own curated Project Chronology demolition entry",
    });
  }
  if (chronoFlags.hasEvent) {
    capabilities.push({
      claimType: "event",
      strength: "medium",
      notes: "PAB's own curated Project Chronology dated event entry",
    });
  }
  if (chronoFlags.hasRelationship) {
    capabilities.push({
      claimType: "relationship",
      strength: "medium",
      notes: "PAB's own labeled Client/Contractor field",
    });
  }

  return {
    id: `pab-${record.pabId}`,
    title: `Philadelphia Architects and Buildings — ${interpreted.title} (${primaryAddress(record)})`,
    url: record.url,
    sourceClass: "built-environment-cultural-database",
    capabilities,
  };
}

export function extractClaimsFromPabRecord(
  record: PabRetrievalRecord,
  interpreted: PabInterpretedRecord,
): Claim[] {
  if (interpreted.classification !== "claim-bearing") return [];

  const { signals } = interpreted;
  const placeKey = `pab-record-${record.pabId}`;
  const address = primaryAddress(record);
  const sourceIds = [`pab-${record.pabId}`];
  const claims: Claim[] = [];

  const identitySpan =
    signals.namedCitationWithYear ??
    signals.namedCollection ??
    signals.datedArchitectRecord?.raw ??
    signals.registerDateEntry?.raw ??
    interpreted.title;

  claims.push({
    id: `pab-${record.pabId}-identity`,
    placeKey,
    address,
    proposedIdentityType: "unresolved",
    sourceIds,
    supportingSpan: identitySpan,
    claimType: "identity",
    claimText: `PAB's own record for ${address} identifies this as "${interpreted.title}."`,
    extractionMethod: "direct-source-text",
  });

  if (signals.datedArchitectRecord) {
    const iso = toIsoDate(signals.datedArchitectRecord.date);
    claims.push({
      id: `pab-${record.pabId}-architect`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: signals.datedArchitectRecord.raw,
      claimType: "architect",
      claimText: `PAB's record cites a dated architectural record for ${address} naming ${signals.datedArchitectRecord.architect}, dated ${signals.datedArchitectRecord.date}.`,
      relatedEntities: [signals.datedArchitectRecord.architect],
      dateRange: iso ? { start: iso, precise: true } : undefined,
      extractionMethod: "direct-source-text",
    });
  }

  if (signals.registerDateEntry) {
    const iso = toIsoDate(signals.registerDateEntry.date);
    claims.push({
      id: `pab-${record.pabId}-register-status`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: signals.registerDateEntry.raw,
      claimType: "register-status",
      claimText: `PAB's record shows a historic-register listing entry for ${address}, dated ${signals.registerDateEntry.date}.`,
      dateRange: iso ? { start: iso, precise: true } : undefined,
      extractionMethod: "direct-source-text",
    });
  }

  (signals.chronologyEvents ?? []).forEach((event, eventIdx) => {
    const category = chronologyEventCategory(event.eventRaw);
    const dateRange = parseChronologyDateRange(event.dateRaw);
    const namedEntities = [...event.architects, ...event.contractors];
    const eventSpan = `${event.dateRaw} ${event.eventRaw}${namedEntities.length ? ` (${namedEntities.join("; ")})` : ""}`;

    if (category === "construction-date") {
      claims.push({
        id: `pab-${record.pabId}-chrono-${eventIdx}-construction`,
        placeKey,
        address,
        proposedIdentityType: "unresolved",
        sourceIds,
        supportingSpan: eventSpan,
        claimType: "construction-date",
        claimText: `PAB's Project Chronology dates the construction of ${address} to ${event.dateRaw}${event.architects.length ? `, with architect ${event.architects.join(", ")}` : ""}.`,
        relatedEntities: namedEntities.length ? namedEntities : undefined,
        dateRange,
        extractionMethod: "direct-source-text",
      });
    } else if (category === "demolition") {
      claims.push({
        id: `pab-${record.pabId}-chrono-${eventIdx}-demolition`,
        placeKey,
        address,
        proposedIdentityType: "unresolved",
        sourceIds,
        supportingSpan: eventSpan,
        claimType: "demolition",
        claimText: `PAB's Project Chronology records ${address} as demolished (${event.eventRaw}), dated ${event.dateRaw}.`,
        relatedEntities: namedEntities.length ? namedEntities : undefined,
        dateRange,
        extractionMethod: "direct-source-text",
      });
    } else {
      claims.push({
        id: `pab-${record.pabId}-chrono-${eventIdx}-event`,
        placeKey,
        address,
        proposedIdentityType: "unresolved",
        sourceIds,
        supportingSpan: eventSpan,
        claimType: "event",
        claimText: `PAB's Project Chronology records a ${event.eventRaw} event at ${address}, dated ${event.dateRaw}${event.architects.length ? `, with architect ${event.architects.join(", ")}` : ""}${event.contractors.length ? `, contractor ${event.contractors.join(", ")}` : ""}.`,
        relatedEntities: namedEntities.length ? namedEntities : undefined,
        dateRange,
        extractionMethod: "direct-source-text",
      });
    }

    event.architects.forEach((architectName, architectIdx) => {
      if (isDuplicateOfInlineArchitect(architectName, event, signals)) return;
      claims.push({
        id: `pab-${record.pabId}-chrono-${eventIdx}-architect-${architectIdx}`,
        placeKey,
        address,
        proposedIdentityType: "unresolved",
        sourceIds,
        supportingSpan: `Architect: ${architectName} (${event.dateRaw} ${event.eventRaw})`,
        claimType: "architect",
        claimText: `PAB's Project Chronology names ${architectName} as architect for the ${event.eventRaw} event at ${address}, dated ${event.dateRaw}.`,
        relatedEntities: [architectName],
        dateRange,
        extractionMethod: "direct-source-text",
      });
    });

    event.contractors.forEach((contractorName, contractorIdx) => {
      claims.push({
        id: `pab-${record.pabId}-chrono-${eventIdx}-contractor-${contractorIdx}`,
        placeKey,
        address,
        proposedIdentityType: "unresolved",
        sourceIds,
        supportingSpan: `Contractor: ${contractorName} (${event.dateRaw} ${event.eventRaw})`,
        claimType: "relationship",
        claimText: `PAB's Project Chronology names ${contractorName} as contractor for the ${event.eventRaw} event at ${address}, dated ${event.dateRaw}.`,
        relatedEntities: [contractorName],
        dateRange,
        extractionMethod: "direct-source-text",
      });
    });
  });

  (signals.alsoKnownAs ?? []).forEach((altName, altIdx) => {
    claims.push({
      id: `pab-${record.pabId}-aka-${altIdx}`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: `Also known as: ${(signals.alsoKnownAs ?? []).join(" ; ")}`,
      claimType: "identity",
      claimText: `PAB's own record for ${address} lists an alternate/former name: "${altName}."`,
      relatedEntities: [altName],
      extractionMethod: "direct-source-text",
    });
  });

  if (signals.client) {
    claims.push({
      id: `pab-${record.pabId}-client`,
      placeKey,
      address,
      proposedIdentityType: "unresolved",
      sourceIds,
      supportingSpan: `Client: ${signals.client}`,
      claimType: "relationship",
      claimText: `PAB's own record names the client for ${address} as "${signals.client}."`,
      relatedEntities: [signals.client],
      extractionMethod: "direct-source-text",
    });
  }

  return claims;
}
