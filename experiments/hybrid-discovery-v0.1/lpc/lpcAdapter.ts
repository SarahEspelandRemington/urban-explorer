/**
 * NYC LPC (Landmarks Preservation Commission) Individual Landmark and
 * Historic District Building Database retrieval adapter prototype.
 * Offline/non-production, experimental — see ../README.md.
 *
 * Source role: government/preservation/structured built-environment
 * (same SourceClass as PAB — "built-environment-cultural-database" is not
 * quite right either; this is closer to PAB's role but issued by a
 * government preservation agency, so it is registered as
 * "government-preservation-record" — see lpcClaimExtractor.ts).
 *
 * Ingestion mechanism: Socrata SoQL REST API (dataset 7mgd-s57w on
 * data.cityofnewyork.us), NOT HTML scraping. This is the deliberate
 * portability test: does the shared claim/check/grounding/decision/
 * worthiness pipeline travel unchanged when only the retrieval mechanism
 * changes from PAB's HTML form-POST to a structured government open-data
 * API? Retrieval-only: this module fetches and normalizes LPC's own rows
 * into structured retrieval records. It does NOT interpret, classify, or
 * turn records into Streetlit claims — that is lpcClaimExtractor.ts,
 * deliberately kept separate (mirroring pabAdapter.ts / pabInterpreter.ts /
 * pabClaimExtractor.ts's separation of concerns).
 *
 * Retrieval strategy:
 * 1. Field-name discovery is NOT hardcoded from the dataset's published data
 *    dictionary alone. This adapter fetches one live sample record first
 *    and matches each logical field (address, architect, use, etc.) against
 *    a small alias list, using whichever key actually exists in the live
 *    response. This is a genuinely reusable "structured government
 *    open-data API" capability, not an LPC-specific hack: any Socrata
 *    dataset whose columns roughly match the dictionary-documented mnemonics
 *    can be pointed at this same discovery routine.
 * 2. Source-native enumeration mechanism: SoQL's own spatial function,
 *    `intersects(<geometry field>, 'POLYGON(...)')`, run directly against
 *    LPC's geometry column (auto-detected as whichever field holds a
 *    GeoJSON Point/Polygon/MultiPolygon value in the live sample — the
 *    live LPC data is MultiPolygon building footprints, not points, so
 *    detection deliberately does not assume a single geometry shape) — the
 *    same enumeration ROLE as PAB's own address-street-search endpoint, but
 *    a different concrete mechanism because this source exposes a live
 *    spatial query capability that PAB's site does not. `intersects()` (not
 *    `within_box()`, which is Point-only) is used so this works against
 *    polygon geometry. If no such geometry field is found live, this
 *    adapter fails closed rather than guessing a field name or falling back
 *    to an unbounded fetch — mirroring pabAdapter.ts's "does not fall back
 *    to scraping an unexpected page shape" posture.
 * 3. Corridor scope for this test: W38th–W53rd, centered on 8th/9th/10th
 *    Avenues, Manhattan (Sarah's 515 W 38th St <-> 7th Ave/W53rd walk),
 *    with a buffer. Bounding box is a hand-picked approximation (not a
 *    geocoded lookup): lat 40.7515–40.7675, lon -74.0030–-73.9880. This
 *    intentionally overshoots the exact corridor slightly on all four sides
 *    to catch nearby/side-street discoveries per the task brief, and is
 *    documented here rather than derived from any external geocoding call.
 */

// The catalog id the task named, "7mgd-s57w" ("...Building Database (Map)"),
// is a map/visualization VIEW wrapper: assetType "map", 0 columns, every row
// resolves to `{}` over the resource API. Confirmed live (not from docs):
// its own `displayFormat.visualizationCanvasMetadata.vifs[0].series[0]
// .dataSource.datasetUid` field points at the actual backing tabular
// dataset, "gpmc-yuvp", which is what actually serves the real columns
// (bin, bbl, des_addres, arch_build, the_geom, etc.). This is the same
// "confirm live, don't trust the label" principle already applied to field
// names, extended to the resource id itself — the map-view id would
// otherwise permanently (not just during an outage) fail closed with zero
// rows, since it has no columns to discover in the first place.
const LPC_DATASET_ID = "gpmc-yuvp";
const LPC_RESOURCE_URL = `https://data.cityofnewyork.us/resource/${LPC_DATASET_ID}.json`;

export interface LpcCorridorBbox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Sarah's actual W38th-W53rd / 8th-10th Ave walking corridor, buffered on all sides. */
export const W38_W53_CORRIDOR_BBOX: LpcCorridorBbox = {
  minLat: 40.7515,
  maxLat: 40.7675,
  minLon: -74.003,
  maxLon: -73.988,
};

// Logical field -> ordered list of candidate live API field-name spellings,
// derived from the dataset's own official data dictionary
// (LPC_Historic_Buildings_Data_Dictionary.xlsx, fetched via Wayback while
// the live Socrata API was under a confirmed scheduled maintenance window —
// see the portability report for full provenance). The FIRST candidate that
// actually exists as a key on a live sample record is the one used; nothing
// here is asserted as the real field name without that live check.
const FIELD_ALIASES: Record<string, string[]> = {
  bin: ["bin"],
  bbl: ["bbl"],
  borough: ["borough"],
  block: ["block"],
  lot: ["lot"],
  address: ["des_addres", "des_address", "address"],
  dateLow: ["date_low"],
  dateHigh: ["date_high"],
  dateCombo: ["date_combo"],
  circa: ["circa"],
  altDate1: ["alt_date_1"],
  altDate2: ["alt_date_2"],
  archBuild: ["arch_build"],
  ownDevel: ["own_devel"],
  altArch1: ["alt_arch_1"],
  altArch2: ["alt_arch_2"],
  stylePrim: ["style_prim"],
  styleSec: ["style_sec"],
  styleOth: ["style_oth"],
  matPrim: ["mat_prim"],
  matSec: ["mat_sec"],
  matThird: ["mat_third"],
  matFour: ["mat_four"],
  matOther: ["mat_other"],
  useOrig: ["use_orig"],
  useOther: ["use_other"],
  buildOth: ["build_oth"],
  buildNme: ["build_nme"],
  histDist: ["hist_dist"],
  buildType: ["build_type"],
  lmOrig: ["lm_orig"],
  lmNew: ["lm_new"],
  notes: ["notes"],
};

export interface LpcFieldMap {
  /** logical name -> actual live API field key */
  fields: Record<string, string | undefined>;
  /** the field holding a GeoJSON geometry value (Point, Polygon, MultiPolygon, etc.), if any was found on the sample record */
  geometryField: string | undefined;
  /** the raw sample record used for discovery, kept for diagnostics */
  sampleRecord: Record<string, unknown>;
}

const GEOJSON_GEOMETRY_TYPES = new Set([
  "Point",
  "Polygon",
  "MultiPolygon",
  "LineString",
  "MultiLineString",
]);

function isGeoJsonGeometry(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string" && GEOJSON_GEOMETRY_TYPES.has(v.type);
}

/**
 * Fetches ONE live sample record and discovers the real field-name spelling
 * for every logical field this adapter cares about, plus which field (if
 * any) carries point geometry. Never asserts a field name exists without
 * this live check having found it.
 */
export async function discoverLpcFieldMap(): Promise<LpcFieldMap> {
  const res = await fetch(`${LPC_RESOURCE_URL}?$limit=1`);
  if (!res.ok) {
    throw new Error(
      `LPC Socrata field-discovery fetch failed: HTTP ${res.status} ${res.statusText}. ` +
        `This adapter does not proceed with hardcoded/guessed field names when the live API cannot confirm them.`,
    );
  }
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  const sample = rows[0];
  if (!sample) {
    throw new Error(
      "LPC Socrata field-discovery returned zero rows for $limit=1 — cannot discover live field names.",
    );
  }

  const sampleKeys = Object.keys(sample);
  const sampleKeysLower = new Map(sampleKeys.map((k) => [k.toLowerCase(), k]));

  const fields: Record<string, string | undefined> = {};
  for (const [logical, candidates] of Object.entries(FIELD_ALIASES)) {
    fields[logical] = candidates
      .map((c) => sampleKeysLower.get(c.toLowerCase()))
      .find((k): k is string => !!k);
  }

  const geometryField = sampleKeys.find((k) => isGeoJsonGeometry(sample[k]));

  return { fields, geometryField, sampleRecord: sample };
}

export interface LpcRetrievalRecord {
  /** Socrata's stable internal row identifier (:id), the closest analogue to PabRetrievalRecord.pabId. */
  lpcRowId: string;
  /** Best-effort stable, bookmarkable-ish reference for this specific record — the dataset+row, since LPC rows have no individually dedicated detail-page URL the way PAB records do. */
  url: string;
  address: string | undefined;
  borough: string | undefined;
  bin: string | undefined;
  bbl: string | undefined;
  buildName: string | undefined;
  lmOrig: string | undefined;
  lmNew: string | undefined;
  histDist: string | undefined;
  raw: Record<string, unknown>;
}

export interface LpcAdapterResult {
  totalRetrieved: number;
  records: LpcRetrievalRecord[];
  fieldMap: LpcFieldMap;
  /** The exact SoQL query URL fetched, for provenance/reproducibility. */
  queryUrl: string;
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/**
 * Retrieves LPC records within a bounding box via Socrata's own
 * intersects() spatial SoQL function (a WKT polygon literal built from the
 * bbox corners, tested against the live-discovered geometry field).
 * intersects() is used rather than within_box() because it works against
 * any geometry shape — LPC's own geometry field is MultiPolygon building
 * footprints, not points. Fails closed (throws) if no geometry field was
 * found on the live sample record, rather than falling back to a guessed
 * field name or an unbounded citywide fetch.
 */
export async function retrieveLpcCorridor(
  bbox: LpcCorridorBbox,
  options: { limit?: number } = {},
): Promise<LpcAdapterResult> {
  const fieldMap = await discoverLpcFieldMap();
  if (!fieldMap.geometryField) {
    throw new Error(
      "LPC Socrata field-discovery found no live field carrying a GeoJSON geometry value. " +
        "This adapter's bbox-based enumeration mechanism cannot proceed without a confirmed live geometry field — " +
        "it does not fall back to guessing a field name or an unbounded citywide fetch.",
    );
  }

  const limit = options.limit ?? 5000;
  const polygon =
    `POLYGON((${bbox.minLon} ${bbox.minLat}, ${bbox.maxLon} ${bbox.minLat}, ` +
    `${bbox.maxLon} ${bbox.maxLat}, ${bbox.minLon} ${bbox.maxLat}, ${bbox.minLon} ${bbox.minLat}))`;
  const where = `intersects(${fieldMap.geometryField}, '${polygon}')`;
  const queryUrl = `${LPC_RESOURCE_URL}?$where=${encodeURIComponent(where)}&$limit=${limit}`;

  const res = await fetch(queryUrl);
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(
      `LPC Socrata corridor query failed: HTTP ${res.status} ${res.statusText}. Body: ${bodyText.slice(0, 300)}`,
    );
  }
  const rows = (await res.json()) as Array<Record<string, unknown>>;

  const f = fieldMap.fields;
  const records: LpcRetrievalRecord[] = rows.map((row, idx) => {
    const rowId = str(row[":id"]) ?? `row-${idx}`;
    return {
      lpcRowId: rowId,
      url: `${LPC_RESOURCE_URL}?$where=${encodeURIComponent(`:id='${rowId}'`)}`,
      address: f.address ? str(row[f.address]) : undefined,
      borough: f.borough ? str(row[f.borough]) : undefined,
      bin: f.bin ? str(row[f.bin]) : undefined,
      bbl: f.bbl ? str(row[f.bbl]) : undefined,
      buildName: f.buildNme ? str(row[f.buildNme]) : undefined,
      lmOrig: f.lmOrig ? str(row[f.lmOrig]) : undefined,
      lmNew: f.lmNew ? str(row[f.lmNew]) : undefined,
      histDist: f.histDist ? str(row[f.histDist]) : undefined,
      raw: row,
    };
  });

  return { totalRetrieved: records.length, records, fieldMap, queryUrl };
}
