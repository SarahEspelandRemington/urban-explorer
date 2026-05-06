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
 * import { upload, handleUploadError } from "../lib/upload";
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
 * Multer emits `MulterError` for all limit violations. The `handleUploadError`
 * middleware exported from this module maps every `MulterError` code to an
 * appropriate HTTP status and a user-facing message. Mount it in `app.ts` (or
 * at the route level) so callers always receive a clear 400/413 response
 * instead of a generic 500.
 *
 * The global error handler in `app.ts` already mounts `handleUploadError`
 * before its own catch-all, so individual routes do NOT need to add their own
 * handler. If a route needs custom logic for a specific code, add a route-level
 * handler first and call `next(err)` for anything it does not recognise:
 *
 * ```ts
 * import { upload, handleUploadError } from "../lib/upload";
 *
 * router.post("/photo", upload.single("photo"), (req, res) => { ... });
 *
 * // Optional route-level override for custom behaviour:
 * router.use("/photo", (err, _req, res, next) => {
 *   // custom handling …
 *   next(err); // fall through to handleUploadError / global handler
 * });
 * ```
 */

import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import {
  UPLOAD_BODY_LIMIT,
  UPLOAD_MAX_FILES,
  UPLOAD_MAX_FIELDS,
  UPLOAD_FIELD_NAME_SIZE,
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
// Shared multer-error handler
// ---------------------------------------------------------------------------

/**
 * Maps multer `MulterError` codes to HTTP status codes and user-facing
 * messages. All size/count violations → 413; malformed field names or
 * unexpected file fields → 400.
 *
 * This middleware is mounted in `app.ts` so that every upload route benefits
 * automatically. Mount it before the global catch-all error handler.
 */
const MULTER_ERROR_RESPONSES: Record<
  string,
  { status: number; message: string }
> = {
  LIMIT_FILE_SIZE: { status: 413, message: "Uploaded file is too large." },
  LIMIT_FILE_COUNT: { status: 422, message: "Too many files uploaded." },
  LIMIT_FIELD_COUNT: {
    status: 422,
    message: "Too many form fields in the request.",
  },
  LIMIT_PART_COUNT: {
    status: 422,
    message: "Too many parts in the multipart request.",
  },
  LIMIT_FIELD_VALUE: { status: 413, message: "Form field value is too large." },
  LIMIT_FIELD_KEY: {
    status: 400,
    message: "Form field name is too long.",
  },
  LIMIT_UNEXPECTED_FILE: {
    status: 422,
    message: "Unexpected file field in the request.",
  },
};

export function handleUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof multer.MulterError) {
    const mapped = MULTER_ERROR_RESPONSES[err.code] ?? {
      status: 400,
      message: "Upload error.",
    };
    res.status(mapped.status).json({ error: mapped.message });
    return;
  }
  next(err);
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
  /**
   * Maximum size in bytes for each non-file field value. When omitted, multer's
   * built-in default (1 MB) is used. Use this to enforce a tighter cap on text
   * field values for a given endpoint.
   */
  fieldSizeOverride?: number;
  /**
   * Maximum byte length allowed for a non-file field name. When omitted,
   * UPLOAD_FIELD_NAME_SIZE (default 100 bytes) is used. Use this to enforce a
   * tighter cap on field-name length for a given endpoint.
   */
  fieldNameSizeOverride?: number;
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
  const fieldSize = options?.fieldSizeOverride;
  const fieldNameSize =
    options?.fieldNameSizeOverride ?? UPLOAD_FIELD_NAME_SIZE;
  return multer({
    storage,
    limits: {
      fileSize,
      fields,
      files,
      parts: files + fields,
      ...(fieldSize !== undefined && { fieldSize }),
      fieldNameSize,
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
