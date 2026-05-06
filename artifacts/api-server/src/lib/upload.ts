/**
 * Shared multer factory for multipart/form-data upload endpoints.
 *
 * ## Why this exists
 *
 * Express's built-in `express.json()` / `express.urlencoded()` body parsers
 * respect REQUEST_BODY_LIMIT, but that limit does NOT cover multipart
 * (`Content-Type: multipart/form-data`) payloads handled by multer. Without
 * an explicit size cap on the multer instance, upload endpoints would be
 * unprotected and an attacker could exhaust server memory with an arbitrarily
 * large POST.
 *
 * ## How to use
 *
 * Import the pre-configured `upload` instance instead of constructing a raw
 * `multer()` instance yourself. Never call `multer()` directly in route files.
 *
 * ```ts
 * import { upload } from "../lib/upload";
 *
 * // Single file in the "photo" field:
 * router.post("/photo", upload.single("photo"), (req, res) => { ... });
 *
 * // Up to 5 files in the "attachments" field:
 * router.post("/attachments", upload.array("attachments", 5), (req, res) => { ... });
 * ```
 *
 * ## Size cap
 *
 * The per-file size limit is read from UPLOAD_BODY_LIMIT (config.ts).
 * Defaults to "10mb". Set a different value in environment variables if your
 * endpoint requires a tighter or looser bound.
 *
 * ## Storage
 *
 * By default files are buffered in memory (`memoryStorage`). If an endpoint
 * needs disk storage, create a second multer instance via `createUpload` with
 * a custom storage engine.
 *
 * ## Error handling
 *
 * Multer emits a `MulterError` with `code === "LIMIT_FILE_SIZE"` when the
 * limit is exceeded. The global error handler in `app.ts` delegates all
 * `MulterError` instances to `middlewares/uploadErrorHandler.ts`, which
 * returns a friendly 413 JSON response automatically. No per-route error
 * handler is needed — just mount the multer middleware and let the global
 * handler take care of the rest.
 */

import multer from "multer";
import {
  UPLOAD_BODY_LIMIT,
  UPLOAD_MAX_FILES,
  UPLOAD_MAX_FIELDS,
} from "../config";

// ---------------------------------------------------------------------------
// Internal helper: parse "512kb" / "10mb" → bytes as a number
// ---------------------------------------------------------------------------

const UNIT_MULTIPLIERS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

/**
 * Convert a size string (e.g. "10mb", "512kb") to bytes.
 * The input is expected to already be validated by the Zod schema in config.ts,
 * so this function throws if the format is unrecognised (which should never
 * happen in practice).
 */
function parseSizeToBytes(sizeStr: string): number {
  const match = sizeStr.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i);
  if (!match) {
    throw new Error(
      `upload.ts: cannot parse size string "${sizeStr}" — expected format like "10mb"`,
    );
  }
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  return Math.floor(value * (UNIT_MULTIPLIERS[unit] ?? 1));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link createUpload}.
 */
export interface CreateUploadOptions {
  /**
   * Per-file size cap in bytes. Overrides the global UPLOAD_BODY_LIMIT env var.
   * When omitted, UPLOAD_BODY_LIMIT is used.
   */
  fileSizeOverride?: number;
  /**
   * Maximum number of files allowed in the request. Overrides the global
   * UPLOAD_MAX_FILES env var. When omitted, UPLOAD_MAX_FILES is used.
   * Use this to enforce the tightest sensible limit for a given endpoint
   * (e.g. `maxFiles: 1` for a single-photo upload) without touching env vars.
   */
  maxFiles?: number;
  /**
   * Maximum number of non-file fields allowed in the request. Overrides the
   * global UPLOAD_MAX_FIELDS env var. When omitted, UPLOAD_MAX_FIELDS is used.
   */
  maxFields?: number;
}

/**
 * Create a new multer instance with the given storage engine and the
 * UPLOAD_BODY_LIMIT cap applied. Use this when you need disk storage or a
 * custom per-endpoint file-size, file-count, or field-count limit.
 *
 * Per-call overrides in `options` take precedence over the corresponding
 * global config values (`UPLOAD_BODY_LIMIT`, `UPLOAD_MAX_FILES`,
 * `UPLOAD_MAX_FIELDS`).
 *
 * @param storage - Multer storage engine (defaults to memoryStorage).
 * @param options - Optional per-call limit overrides.
 */
export function createUpload(
  storage: multer.StorageEngine = multer.memoryStorage(),
  options?: CreateUploadOptions,
): multer.Multer {
  const fileSize =
    options?.fileSizeOverride ?? parseSizeToBytes(UPLOAD_BODY_LIMIT);
  const files = options?.maxFiles ?? UPLOAD_MAX_FILES;
  const fields = options?.maxFields ?? UPLOAD_MAX_FIELDS;
  return multer({
    storage,
    limits: {
      fileSize,
      fields,
      files,
      parts: files + fields,
    },
  });
}

// ---------------------------------------------------------------------------
// Default instance (memory storage, UPLOAD_BODY_LIMIT cap)
// ---------------------------------------------------------------------------

/**
 * Pre-configured multer instance using in-memory storage and a file-size cap
 * derived from UPLOAD_BODY_LIMIT (default: 10 MB).
 *
 * Import and use this in upload route handlers. Do NOT call `multer()` directly
 * in route files.
 */
export const upload = createUpload();
