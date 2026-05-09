/**
 * Centralised environment-variable configuration for the API server.
 *
 * Every tunable server setting is parsed and validated here with Zod at
 * module-load time. Invalid values emit a structured warning and fall back to
 * a safe default so a misconfiguration is caught immediately at startup rather
 * than silently producing wrong behaviour at runtime.
 *
 * Import the named exports from this module instead of reading process.env
 * directly in route/handler/lib files.
 *
 * Note: PORT is validated in index.ts (hard-fail on missing/invalid — the
 * server cannot start without it). LOG_LEVEL and NODE_ENV are consumed by
 * logger.ts at construction time (before this module loads) and do not appear
 * here to avoid a circular import.
 */

import { z } from "zod/v4";
import { logger } from "./lib/logger";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Parse a single environment variable with a Zod schema.
 * - If the variable is absent or empty → return `defaultVal` silently.
 * - If the variable is present but fails validation → log a warning and return
 *   `defaultVal`.
 * - Otherwise → return the parsed/coerced value.
 */
function envVar<T>(name: string, schema: z.ZodType<T>, defaultVal: T): T {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultVal;
  const result = schema.safeParse(raw);
  if (!result.success) {
    logger.warn(
      { name, value: raw },
      `Environment variable ${name} has an invalid value; falling back to default (${String(defaultVal)})`,
    );
    return defaultVal;
  }
  return result.data;
}

/**
 * Parse an optional environment variable with a Zod schema.
 * - If the variable is absent or empty → return `undefined` silently.
 * - If the variable is present but fails validation → log a warning and return
 *   `undefined` (treat as if unset).
 * - Otherwise → return the parsed/coerced value.
 */
function envOptional<T>(name: string, schema: z.ZodType<T>): T | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const result = schema.safeParse(raw);
  if (!result.success) {
    logger.warn(
      { name, value: raw },
      `Environment variable ${name} has an invalid value; ignoring and falling back to built-in default`,
    );
    return undefined;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Audio cache
// ---------------------------------------------------------------------------

/**
 * Maximum number of audio rows to keep in the database.
 * Each row is roughly 30–200 KB of base64-encoded MP3, so 100 rows ≈ 5–20 MB.
 * Rows are ranked by expires_at DESC so the freshest entries are preserved.
 *
 * Env var : AUDIO_DB_MAX_ENTRIES
 * Expects : positive integer
 * Default : 100
 */
export const AUDIO_DB_MAX_ENTRIES = envVar(
  "AUDIO_DB_MAX_ENTRIES",
  z.coerce.number().int().positive(),
  100,
);

// ---------------------------------------------------------------------------
// Photo cache
// ---------------------------------------------------------------------------

/**
 * Maximum age (in days) for cached place photos stored in the database.
 * Rows older than this cutoff are deleted by the scheduled cleanup job.
 *
 * Env var : PHOTO_CACHE_MAX_AGE_DAYS
 * Expects : positive finite number
 * Default : 7
 */
export const PHOTO_CACHE_MAX_AGE_DAYS = envVar(
  "PHOTO_CACHE_MAX_AGE_DAYS",
  z.coerce.number().positive().finite(),
  7,
);

// ---------------------------------------------------------------------------
// Walk Mode heading-bias tuning
// ---------------------------------------------------------------------------

/**
 * Distance in metres that the Walk Mode scoring algorithm favours places
 * that lie ahead of the user's current heading.
 *
 * Env var : WALK_FORWARD_BIAS_METERS
 * Expects : finite number
 * Default : 200
 */
export const WALK_FORWARD_BIAS_METERS = envVar(
  "WALK_FORWARD_BIAS_METERS",
  z.coerce.number().finite(),
  200,
);

/**
 * Angular threshold in degrees beyond which a place is considered "off-axis"
 * relative to the user's heading and receives a distance penalty.
 *
 * Env var : WALK_OFF_AXIS_PENALTY_DEG
 * Expects : finite number
 * Default : 45
 */
export const WALK_OFF_AXIS_PENALTY_DEG = envVar(
  "WALK_OFF_AXIS_PENALTY_DEG",
  z.coerce.number().finite(),
  45,
);

/**
 * Extra virtual distance (in metres) added to off-axis places during Walk
 * Mode scoring to de-prioritise them relative to on-axis candidates.
 *
 * Env var : WALK_OFF_AXIS_PENALTY_METERS
 * Expects : finite number
 * Default : 180
 */
export const WALK_OFF_AXIS_PENALTY_METERS = envVar(
  "WALK_OFF_AXIS_PENALTY_METERS",
  z.coerce.number().finite(),
  180,
);

// ---------------------------------------------------------------------------
// Boring building types
// ---------------------------------------------------------------------------

/**
 * Comma-separated list of OSM building types to exclude from discovery results.
 * When set, this takes precedence over BORING_BUILDING_TYPES_FILE and the
 * bundled default JSON. The consuming code splits this string and builds a Set.
 * Whitespace-only values are treated the same as absent and trigger a warning.
 *
 * Env var : BORING_BUILDING_TYPES
 * Expects : non-empty, non-whitespace-only string
 * Default : undefined (falls through to file or bundled defaults)
 */
export const BORING_BUILDING_TYPES_ENV = envOptional(
  "BORING_BUILDING_TYPES",
  z.string().trim().min(1),
);

/**
 * Absolute or relative path to a JSON file containing an array of boring
 * building type strings. Used when BORING_BUILDING_TYPES is not set.
 * Whitespace-only paths are treated as absent and trigger a warning.
 *
 * Env var : BORING_BUILDING_TYPES_FILE
 * Expects : non-empty, non-whitespace-only string (file path)
 * Default : undefined (falls through to bundled defaults)
 */
export const BORING_BUILDING_TYPES_FILE_ENV = envOptional(
  "BORING_BUILDING_TYPES_FILE",
  z.string().trim().min(1),
);

// ---------------------------------------------------------------------------
// Request body size limit
// ---------------------------------------------------------------------------

/**
 * Maximum allowed size for incoming request bodies, passed directly to
 * `express.json()` and `express.urlencoded()`. Uses Express / bytes notation
 * (e.g. "512kb", "1mb"). Applies to both JSON and URL-encoded payloads.
 *
 * Several explore endpoints accept free-text fields, coordinate arrays, and
 * GeoJSON route geometries that can be sizeable; a conservative upper bound
 * prevents pathologically large payloads from exhausting memory or stalling
 * the event loop.
 *
 * Env var : REQUEST_BODY_LIMIT
 * Expects : string matching ^\d+(?:\.\d+)?\s*(?:b|kb|mb|gb)$ (case-insensitive)
 * Default : "512kb"
 */
export const REQUEST_BODY_LIMIT = envVar(
  "REQUEST_BODY_LIMIT",
  z.string().regex(/^\d+(?:\.\d+)?\s*(?:b|kb|mb|gb)$/i, {
    message:
      'Must be a size string such as "512kb" or "1mb" (number + b/kb/mb/gb)',
  }),
  "512kb",
);

// ---------------------------------------------------------------------------
// Upload strict-config mode
// ---------------------------------------------------------------------------

/**
 * When set to "true" (case-insensitive), any upload configuration mismatch
 * that would otherwise emit a logger.warn (e.g. UPLOAD_MAX_FILE_SIZE exceeding
 * UPLOAD_BODY_LIMIT) is instead treated as a hard startup failure: a
 * descriptive Error is thrown and the process exits with code 1. This is
 * intended for CI/CD pipelines where a misconfiguration should block
 * deployment rather than silently degrade behaviour.
 *
 * Env var : UPLOAD_STRICT_CONFIG
 * Expects : "true" or "false" (case-insensitive); any other value falls back
 *           to false with a warning.
 * Default : false
 */
export const UPLOAD_STRICT_CONFIG = envVar(
  "UPLOAD_STRICT_CONFIG",
  z
    .string()
    .regex(/^(true|false)$/i, { message: 'Must be "true" or "false"' })
    .transform((v) => v.toLowerCase() === "true"),
  false,
);

// ---------------------------------------------------------------------------
// Upload (multipart/form-data) size limit
// ---------------------------------------------------------------------------

/**
 * Maximum allowed size for a single uploaded file, passed to the shared
 * multer factory in `lib/upload.ts`. Uses Express / bytes notation (e.g.
 * "5mb", "10mb"). The value is independent from REQUEST_BODY_LIMIT so that
 * upload endpoints can have a larger (or smaller) cap without relaxing the
 * general JSON body limit.
 *
 * Any route that handles multipart/form-data MUST use the multer instance
 * exported from `lib/upload.ts` — do NOT create a bare, unconfigured multer
 * instance.
 *
 * Env var : UPLOAD_BODY_LIMIT
 * Expects : string matching ^\d+(?:\.\d+)?\s*(?:b|kb|mb|gb)$ (case-insensitive)
 * Default : "10mb"
 */
export const UPLOAD_BODY_LIMIT = envVar(
  "UPLOAD_BODY_LIMIT",
  z.string().regex(/^\d+(?:\.\d+)?\s*(?:b|kb|mb|gb)$/i, {
    message:
      'Must be a size string such as "5mb" or "10mb" (number + b/kb/mb/gb)',
  }),
  "10mb",
);

/**
 * Convert a validated size string (e.g. "10mb", "512kb") to an integer byte
 * count. Used only within config.ts to derive numeric defaults from string
 * size vars. Throws on unrecognised input (should never happen after Zod
 * validation).
 */
function sizeStringToBytes(sizeStr: string): number {
  const match = sizeStr.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i);
  if (!match) {
    throw new Error(
      `config.ts: cannot parse size string "${sizeStr}" — expected format like "10mb"`,
    );
  }
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  return Math.floor(
    parseFloat(match[1]) * (multipliers[match[2].toLowerCase()] ?? 1),
  );
}

/**
 * Maximum allowed size in bytes for a single uploaded file, passed to the
 * shared multer factory in `lib/upload.ts`. This is the independently
 * configurable numeric equivalent of UPLOAD_BODY_LIMIT, allowing operators to
 * tighten or loosen the per-file size cap at deploy time without code changes.
 *
 * Per-call `fileSizeOverride` in `createUpload` still takes precedence over
 * this value so individual endpoints can enforce a tighter limit in code.
 *
 * Env var : UPLOAD_MAX_FILE_SIZE
 * Expects : positive integer (bytes)
 * Default : derived from UPLOAD_BODY_LIMIT (10 MB = 10485760 with stock defaults)
 */
export const UPLOAD_MAX_FILE_SIZE = envVar(
  "UPLOAD_MAX_FILE_SIZE",
  z.coerce.number().int().positive(),
  sizeStringToBytes(UPLOAD_BODY_LIMIT),
);

{
  const uploadBodyLimitBytes = sizeStringToBytes(UPLOAD_BODY_LIMIT);
  if (UPLOAD_MAX_FILE_SIZE > uploadBodyLimitBytes) {
    const message = `UPLOAD_MAX_FILE_SIZE (${UPLOAD_MAX_FILE_SIZE} bytes) exceeds UPLOAD_BODY_LIMIT ("${UPLOAD_BODY_LIMIT}" = ${uploadBodyLimitBytes} bytes); the multer per-file cap is looser than UPLOAD_BODY_LIMIT implies`;
    const context = {
      UPLOAD_MAX_FILE_SIZE,
      UPLOAD_BODY_LIMIT,
      UPLOAD_BODY_LIMIT_bytes: uploadBodyLimitBytes,
    };
    if (UPLOAD_STRICT_CONFIG) {
      throw new Error(
        `[UPLOAD_STRICT_CONFIG] Upload configuration mismatch — ${message}`,
      );
    }
    logger.warn(context, message);
  }
}

// ---------------------------------------------------------------------------
// Upload (multipart/form-data) cardinality limits
// ---------------------------------------------------------------------------

/**
 * Maximum number of files allowed in a single multipart/form-data upload
 * request, passed to the shared multer factory in `lib/upload.ts`.
 *
 * A low cap prevents attackers from exhausting server memory by submitting
 * many small files that each stay under the per-file size limit.
 *
 * Env var : UPLOAD_MAX_FILES
 * Expects : positive integer
 * Default : 10
 */
export const UPLOAD_MAX_FILES = envVar(
  "UPLOAD_MAX_FILES",
  z.coerce.number().int().positive(),
  10,
);

/**
 * Maximum number of non-file fields allowed in a single multipart/form-data
 * upload request, passed to the shared multer factory in `lib/upload.ts`.
 *
 * Env var : UPLOAD_MAX_FIELDS
 * Expects : positive integer
 * Default : 20
 */
export const UPLOAD_MAX_FIELDS = envVar(
  "UPLOAD_MAX_FIELDS",
  z.coerce.number().int().positive(),
  20,
);

/**
 * Maximum byte length allowed for a non-file field name in any multipart
 * upload request, passed to the shared multer factory in `lib/upload.ts`.
 * This makes the project-wide default explicit and auditable rather than
 * relying on multer's undocumented built-in value. Individual endpoints can
 * still tighten the limit via `fieldNameSizeOverride` in `createUpload`.
 *
 * Env var : UPLOAD_FIELD_NAME_SIZE
 * Expects : positive integer
 * Default : 100
 */
export const UPLOAD_FIELD_NAME_SIZE = envVar(
  "UPLOAD_FIELD_NAME_SIZE",
  z.coerce.number().int().positive(),
  100,
);

{
  const uploadBodyLimitBytes = sizeStringToBytes(UPLOAD_BODY_LIMIT);
  if (UPLOAD_FIELD_NAME_SIZE > uploadBodyLimitBytes) {
    const message = `UPLOAD_FIELD_NAME_SIZE (${UPLOAD_FIELD_NAME_SIZE} bytes) exceeds UPLOAD_BODY_LIMIT ("${UPLOAD_BODY_LIMIT}" = ${uploadBodyLimitBytes} bytes); a field name larger than the body limit can never be transmitted, so this configuration is inconsistent`;
    const context = {
      UPLOAD_FIELD_NAME_SIZE,
      UPLOAD_BODY_LIMIT,
      UPLOAD_BODY_LIMIT_bytes: uploadBodyLimitBytes,
    };
    if (UPLOAD_STRICT_CONFIG) {
      throw new Error(
        `[UPLOAD_STRICT_CONFIG] Upload configuration mismatch — ${message}`,
      );
    }
    logger.warn(context, message);
  }
}

/**
 * Maximum byte length allowed for a non-file field *value* in any multipart
 * upload request, passed to the shared multer factory in `lib/upload.ts`.
 * This makes the project-wide default explicit and auditable rather than
 * relying on multer's undocumented built-in 1 MB cap. Individual endpoints can
 * still override this limit via `fieldSizeOverride` in `createUpload`.
 *
 * Env var : UPLOAD_FIELD_SIZE
 * Expects : positive integer (bytes)
 * Default : 1048576 (1 MB)
 */
export const UPLOAD_FIELD_SIZE = envVar(
  "UPLOAD_FIELD_SIZE",
  z.coerce.number().int().positive(),
  1048576,
);

{
  const uploadBodyLimitBytes = sizeStringToBytes(UPLOAD_BODY_LIMIT);
  if (UPLOAD_FIELD_SIZE > uploadBodyLimitBytes) {
    const message = `UPLOAD_FIELD_SIZE (${UPLOAD_FIELD_SIZE} bytes) exceeds UPLOAD_BODY_LIMIT ("${UPLOAD_BODY_LIMIT}" = ${uploadBodyLimitBytes} bytes); a field value larger than the body limit can never be transmitted, so this configuration is inconsistent`;
    const context = {
      UPLOAD_FIELD_SIZE,
      UPLOAD_BODY_LIMIT,
      UPLOAD_BODY_LIMIT_bytes: uploadBodyLimitBytes,
    };
    if (UPLOAD_STRICT_CONFIG) {
      throw new Error(
        `[UPLOAD_STRICT_CONFIG] Upload configuration mismatch — ${message}`,
      );
    }
    logger.warn(context, message);
  }
}

/**
 * Maximum total number of parts (files + non-file fields combined) allowed in
 * a single multipart/form-data upload request, passed to the shared multer
 * factory in `lib/upload.ts`.
 *
 * This gives operators a single, independent ceiling for the total multipart
 * part count that is evaluated in addition to the per-category caps
 * (UPLOAD_MAX_FILES and UPLOAD_MAX_FIELDS). For example, an endpoint might
 * permit up to 10 files and 20 fields individually, but an operator can reduce
 * UPLOAD_MAX_PARTS to 15 to cap the combined total without touching the
 * per-category limits.
 *
 * Env var : UPLOAD_MAX_PARTS
 * Expects : positive integer
 * Default : UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS (i.e. 30 with stock defaults)
 */
export const UPLOAD_MAX_PARTS = envVar(
  "UPLOAD_MAX_PARTS",
  z.coerce.number().int().positive(),
  UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS,
);

{
  if (UPLOAD_MAX_PARTS < UPLOAD_MAX_FILES) {
    const message = `UPLOAD_MAX_PARTS (${UPLOAD_MAX_PARTS}) is less than UPLOAD_MAX_FILES (${UPLOAD_MAX_FILES}); the total-parts ceiling is tighter than the per-category file ceiling, which will silently cut off uploads that would otherwise be within the file limit`;
    const context = { UPLOAD_MAX_PARTS, UPLOAD_MAX_FILES };
    if (UPLOAD_STRICT_CONFIG) {
      throw new Error(
        `[UPLOAD_STRICT_CONFIG] Upload configuration mismatch — ${message}`,
      );
    }
    logger.warn(context, message);
  }
}

{
  if (UPLOAD_MAX_PARTS < UPLOAD_MAX_FIELDS) {
    const message = `UPLOAD_MAX_PARTS (${UPLOAD_MAX_PARTS}) is less than UPLOAD_MAX_FIELDS (${UPLOAD_MAX_FIELDS}); the total-parts ceiling is tighter than the per-category field ceiling, which will silently cut off field-only multipart requests that would otherwise be within the field limit`;
    const context = { UPLOAD_MAX_PARTS, UPLOAD_MAX_FIELDS };
    if (UPLOAD_STRICT_CONFIG) {
      throw new Error(
        `[UPLOAD_STRICT_CONFIG] Upload configuration mismatch — ${message}`,
      );
    }
    logger.warn(context, message);
  }
}

{
  const combinedLimit = UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS;
  if (UPLOAD_MAX_PARTS < combinedLimit) {
    const message = `UPLOAD_MAX_PARTS (${UPLOAD_MAX_PARTS}) is less than UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS (${UPLOAD_MAX_FILES} + ${UPLOAD_MAX_FIELDS} = ${combinedLimit}); mixed file-and-field requests that stay within the individual per-category limits can still be silently truncated by the combined-parts ceiling`;
    const context = {
      UPLOAD_MAX_PARTS,
      UPLOAD_MAX_FILES,
      UPLOAD_MAX_FIELDS,
      combinedLimit,
    };
    if (UPLOAD_STRICT_CONFIG) {
      throw new Error(
        `[UPLOAD_STRICT_CONFIG] Upload configuration mismatch — ${message}`,
      );
    }
    logger.warn(context, message);
  }
}

// ---------------------------------------------------------------------------
// In-memory cache TTLs and size caps
// ---------------------------------------------------------------------------

/**
 * Time-to-live for the short proximity OSM cache (osmCache), in milliseconds.
 * Entries are keyed by (lat,lng) and expire when a request hits the same area
 * again after this duration.
 *
 * Env var : OSM_CACHE_TTL_MS
 * Expects : positive integer (milliseconds)
 * Default : 300000 (5 minutes)
 */
export const OSM_CACHE_TTL_MS = envVar(
  "OSM_CACHE_TTL_MS",
  z.coerce.number().int().positive(),
  5 * 60 * 1000,
);

/**
 * Time-to-live for LLM response entries in the in-memory LLM cache, in
 * milliseconds. Longer values reduce OpenAI spend at the cost of serving
 * slightly stale AI-generated descriptions.
 *
 * Env var : LLM_CACHE_TTL_MS
 * Expects : positive integer (milliseconds)
 * Default : 3600000 (60 minutes)
 */
export const LLM_CACHE_TTL_MS = envVar(
  "LLM_CACHE_TTL_MS",
  z.coerce.number().int().positive(),
  60 * 60 * 1000,
);

/**
 * Time-to-live for in-memory TTS audio cache entries, in milliseconds.
 * TTS synthesis is expensive; a longer TTL amortises the cost over more
 * requests but increases memory usage proportionally.
 *
 * Env var : AUDIO_CACHE_TTL_MS
 * Expects : positive integer (milliseconds)
 * Default : 1800000 (30 minutes)
 */
export const AUDIO_CACHE_TTL_MS = envVar(
  "AUDIO_CACHE_TTL_MS",
  z.coerce.number().int().positive(),
  30 * 60 * 1000,
);

/**
 * Maximum number of entries kept in the in-memory LLM response cache.
 * When the cap is reached, the oldest entry is evicted before inserting a new
 * one. Each entry is a parsed JSON object (a few KB at most).
 *
 * Env var : LLM_CACHE_MAX_SIZE
 * Expects : positive integer
 * Default : 200
 */
export const LLM_CACHE_MAX_SIZE = envVar(
  "LLM_CACHE_MAX_SIZE",
  z.coerce.number().int().positive(),
  200,
);

/**
 * Maximum number of entries kept in the short proximity OSM cache (osmCache).
 * When the cap is reached, the oldest entry is evicted before inserting a new
 * one. Each entry holds an array of OSMPlace objects (a few KB at most).
 *
 * Env var : OSM_CACHE_MAX_SIZE
 * Expects : positive integer
 * Default : 200
 */
export const OSM_CACHE_MAX_SIZE = envVar(
  "OSM_CACHE_MAX_SIZE",
  z.coerce.number().int().positive(),
  200,
);

/**
 * Time-to-live for the long-lived OSM suggestions cache (osmSuggestionsCache),
 * in milliseconds. This cache is keyed by a coarse ~100 m coordinate grid and
 * persists entries to the DB, so its TTL is deliberately longer than the short
 * proximity osmCache (OSM_CACHE_TTL_MS). Increase this to reduce Overpass
 * traffic; decrease it to surface fresher OSM data.
 *
 * Env var : OSM_SUGGESTIONS_CACHE_TTL_MS
 * Expects : positive integer (milliseconds)
 * Default : 1800000 (30 minutes)
 */
export const OSM_SUGGESTIONS_CACHE_TTL_MS = envVar(
  "OSM_SUGGESTIONS_CACHE_TTL_MS",
  z.coerce.number().int().positive(),
  30 * 60 * 1000,
);

/**
 * Maximum number of entries kept in the in-memory OSM suggestions cache
 * (osmSuggestionsCache), keyed by a coarse coordinate bucket (~100 m grid).
 *
 * Env var : OSM_SUGGESTIONS_CACHE_MAX_SIZE
 * Expects : positive integer
 * Default : 500
 */
export const OSM_SUGGESTIONS_CACHE_MAX_SIZE = envVar(
  "OSM_SUGGESTIONS_CACHE_MAX_SIZE",
  z.coerce.number().int().positive(),
  500,
);

/**
 * Maximum number of entries kept in the in-memory TTS audio cache.
 * Each entry holds a raw MP3 Buffer (roughly 30–200 KB), so the ceiling for
 * memory consumed by this cache is approximately
 * AUDIO_CACHE_MAX_SIZE × 200 KB.
 *
 * Env var : AUDIO_CACHE_MAX_SIZE
 * Expects : positive integer
 * Default : 50
 */
export const AUDIO_CACHE_MAX_SIZE = envVar(
  "AUDIO_CACHE_MAX_SIZE",
  z.coerce.number().int().positive(),
  50,
);

// ---------------------------------------------------------------------------
// Auth / OIDC
// ---------------------------------------------------------------------------

/**
 * OpenID Connect issuer base URL used for OIDC discovery.
 *
 * Env var : ISSUER_URL
 * Expects : valid URL string
 * Default : "https://replit.com/oidc"
 */
export const ISSUER_URL = envVar(
  "ISSUER_URL",
  z.string().url(),
  "https://replit.com/oidc",
);

/**
 * Replit application ID, injected automatically by the platform.
 * Required for OIDC client registration and end-session redirect URLs.
 * A warning is emitted at startup when this is absent so the misconfiguration
 * is surfaced before any OIDC request is attempted.
 *
 * Env var : REPL_ID
 * Expects : non-empty string (platform-injected; should always be present)
 */
export const REPL_ID = envOptional("REPL_ID", z.string().trim().min(1));
if (REPL_ID === undefined) {
  logger.warn(
    { name: "REPL_ID" },
    "REPL_ID environment variable is not set; OIDC authentication will fail at runtime",
  );
}
