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
 * The per-file size limit is read from UPLOAD_MAX_FILE_SIZE (config.ts).
 * Defaults to the numeric byte equivalent of UPLOAD_BODY_LIMIT ("10mb" =
 * 10485760 bytes). Set UPLOAD_MAX_FILE_SIZE in environment variables if your
 * deployment requires a tighter or looser bound without code changes.
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
import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  UPLOAD_MAX_FILE_SIZE,
  UPLOAD_MAX_FILES,
  UPLOAD_MAX_FIELDS,
  UPLOAD_MAX_PARTS,
  UPLOAD_FIELD_NAME_SIZE,
  UPLOAD_FIELD_SIZE,
  UPLOAD_BODY_LIMIT,
  UPLOAD_STRICT_CONFIG,
} from "../config";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Active-limits annotation
// ---------------------------------------------------------------------------

/**
 * Shape of the active upload limits attached to a request by the middleware
 * created by {@link createUpload}. `handleUploadError` reads these values to
 * produce accurate error messages even when per-endpoint overrides differ from
 * the global config defaults.
 */
interface ActiveUploadLimits {
  fileSize: number;
  files: number;
  fields: number;
  parts: number;
  fieldSize: number;
  /**
   * Per-field file-count limits declared via `single()`, `array()`, or
   * `fields()`. When a `LIMIT_FILE_COUNT` error carries a field name (because
   * the wrapper converted it from a per-field `LIMIT_UNEXPECTED_FILE`), this
   * map is used to embed the per-field ceiling in the error message rather
   * than the global `files` cap.
   */
  perFieldFileCounts?: Record<string, number>;
}

/**
 * Extension of Express `Request` with the optional active-limits annotation
 * attached by the wrappers returned from {@link createUpload}.
 */
interface RequestWithUploadLimits extends Request {
  _uploadLimits?: ActiveUploadLimits;
}

// ---------------------------------------------------------------------------
// Shared multer-error handler
// ---------------------------------------------------------------------------

/**
 * Format a byte count as a human-readable string (e.g. "10 MB", "512 KB", "200 B").
 * Uses base-1024 units, rounded to the nearest whole number.
 */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * HTTP status code for each multer error code.
 */
const MULTER_ERROR_STATUS: Record<string, number> = {
  LIMIT_FILE_SIZE: 413,
  LIMIT_FILE_COUNT: 422,
  LIMIT_FIELD_COUNT: 422,
  LIMIT_PART_COUNT: 400,
  LIMIT_FIELD_VALUE: 413,
  LIMIT_FIELD_KEY: 400,
  LIMIT_UNEXPECTED_FILE: 422,
};

/**
 * Build the user-facing error message for a multer error.
 *
 * For limit-count codes (`LIMIT_FILE_COUNT`, `LIMIT_FIELD_COUNT`,
 * `LIMIT_PART_COUNT`) the active limit value is embedded in the message.
 * `activeLimits` is provided by the middleware wrapper created in
 * {@link createUpload} and reflects per-endpoint overrides. When it is absent
 * (e.g. an upload instance created outside this module), the global config
 * values are used as a fallback.
 *
 * For `LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`, and `LIMIT_FIELD_VALUE`, the
 * `field` property on the `MulterError` (when present) is included so callers
 * immediately know which field to fix, e.g. "Uploaded file in field 'photo' is
 * too large (limit: 5 MB).", "Too many files in field 'attachments' (limit: 3).",
 * or "Form field 'description' value is too large (limit: 1 MB)."
 *
 * `LIMIT_FILE_COUNT` errors that carry a field name were converted from a
 * per-field `LIMIT_UNEXPECTED_FILE` by {@link wrapWithActiveLimits}. In that
 * case `activeLimits.perFieldFileCounts` holds the declared per-field ceiling
 * and is used in preference to the global `files` cap.
 */
function buildMulterErrorMessage(
  err: multer.MulterError,
  activeLimits: ActiveUploadLimits | undefined,
): string {
  switch (err.code) {
    case "LIMIT_FILE_SIZE": {
      const limit = activeLimits?.fileSize ?? UPLOAD_MAX_FILE_SIZE;
      const fieldClause = err.field ? ` in field '${err.field}'` : "";
      return `Uploaded file${fieldClause} is too large (limit: ${formatBytes(limit)}).`;
    }
    case "LIMIT_FILE_COUNT": {
      if (err.field) {
        const perFieldLimit =
          err.field && activeLimits?.perFieldFileCounts?.[err.field];
        const limit = perFieldLimit ?? activeLimits?.files ?? UPLOAD_MAX_FILES;
        return `Too many files in field '${err.field}' (limit: ${limit}).`;
      }
      const limit = activeLimits?.files ?? UPLOAD_MAX_FILES;
      return `Too many files uploaded (limit: ${limit}).`;
    }
    case "LIMIT_FIELD_COUNT": {
      const limit = activeLimits?.fields ?? UPLOAD_MAX_FIELDS;
      if (err.field) {
        return `Too many form fields in the request (field: '${err.field}', limit: ${limit}).`;
      }
      return `Too many form fields in the request (limit: ${limit}).`;
    }
    case "LIMIT_PART_COUNT": {
      const limit = activeLimits?.parts ?? UPLOAD_MAX_PARTS;
      return `Too many parts in the multipart request (limit: ${limit}).`;
    }
    case "LIMIT_FIELD_VALUE": {
      const limit = activeLimits?.fieldSize ?? UPLOAD_FIELD_SIZE;
      const fieldClause = err.field ? ` '${err.field}'` : "";
      return `Form field${fieldClause} value is too large (limit: ${formatBytes(limit)}).`;
    }
    case "LIMIT_FIELD_KEY":
      return "Form field name is too long.";
    case "LIMIT_UNEXPECTED_FILE": {
      const fieldClause = err.field ? ` '${err.field}'` : "";
      return `Unexpected file field${fieldClause} in the request.`;
    }
    default:
      return "Upload error.";
  }
}

/**
 * Maps multer `MulterError` codes to HTTP status codes and user-facing
 * messages. All size/count violations → 413; malformed field names or
 * unexpected file fields → 400.
 *
 * For `LIMIT_FILE_COUNT`, `LIMIT_FIELD_COUNT`, and `LIMIT_PART_COUNT` the
 * active per-endpoint limit is embedded in the message. The value is read from
 * `req._uploadLimits` (attached by the wrappers returned by
 * {@link createUpload}) and falls back to the global config when not present.
 *
 * **Behavior contract note**: when a request uses `single()`, `array()`, or
 * `fields()`, per-field count overflows that multer emits as
 * `LIMIT_UNEXPECTED_FILE` are converted to `LIMIT_FILE_COUNT` with `err.field`
 * set by {@link wrapWithActiveLimits} before this handler is invoked. Code
 * that keys on multer error codes should treat `LIMIT_FILE_COUNT` with a field
 * as the canonical per-field count signal rather than `LIMIT_UNEXPECTED_FILE`.
 *
 * This middleware is mounted in `app.ts` so that every upload route benefits
 * automatically. Mount it before the global catch-all error handler.
 */
export function handleUploadError(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof multer.MulterError) {
    const status = MULTER_ERROR_STATUS[err.code] ?? 400;
    const activeLimits = (req as RequestWithUploadLimits)._uploadLimits;
    const message = buildMulterErrorMessage(err, activeLimits);
    res.status(status).json({ error: message });
    return;
  }
  next(err);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a validated UPLOAD_BODY_LIMIT string (e.g. "10mb", "512kb") to an
 * integer byte count. Mirrors the private `sizeStringToBytes` in config.ts.
 * Returns 0 for unrecognised input (should never happen after Zod validation).
 */
function bodyLimitToBytes(sizeStr: string): number {
  const match = sizeStr.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i);
  if (!match) return 0;
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link createUpload}.
 */
export interface CreateUploadOptions {
  /**
   * Per-file size cap in bytes. Overrides the global UPLOAD_MAX_FILE_SIZE env
   * var. When omitted, UPLOAD_MAX_FILE_SIZE is used.
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
   * Maximum total number of parts (files + non-file fields combined) allowed
   * in the request. Overrides the global UPLOAD_MAX_PARTS env var. When
   * omitted, UPLOAD_MAX_PARTS is used. Use this to set a tighter combined cap
   * for a specific endpoint without changing the per-category limits.
   */
  maxParts?: number;
  /**
   * Maximum size in bytes for each non-file field value. Overrides the global
   * UPLOAD_FIELD_SIZE env var (default 1 MB). Use this to enforce a tighter cap
   * on text field values for a given endpoint.
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
 * Wrap an entire multer instance so that every middleware method it exposes
 * (`single`, `array`, `fields`, `none`, `any`) annotates the request with the
 * active upload limits before processing. This makes `handleUploadError` able
 * to reflect per-endpoint overrides in its error messages.
 *
 * For `single`, `array`, and `fields`, multer fires `LIMIT_UNEXPECTED_FILE`
 * when a *declared* file field exceeds its per-field `maxCount` (because the
 * per-field budget reaches zero before the global `files` cap fires). That
 * code is misleading — the field is expected, just over-count. This wrapper
 * intercepts those errors and converts them to `LIMIT_FILE_COUNT` with
 * `err.field` set, so `handleUploadError` can emit the clear message
 * "Too many files in field 'X' (limit: N)." instead.
 *
 * Errors on fields that were not declared (truly unexpected) are left as
 * `LIMIT_UNEXPECTED_FILE` and pass through unchanged.
 */
function wrapWithActiveLimits(
  instance: multer.Multer,
  limits: ActiveUploadLimits,
): multer.Multer {
  /**
   * Build a request handler that:
   * 1. Annotates `req._uploadLimits` (including per-field counts when known).
   * 2. Converts `LIMIT_UNEXPECTED_FILE` on a declared field to
   *    `LIMIT_FILE_COUNT` with the field name preserved.
   */
  function makeHandler(
    handler: RequestHandler,
    declaredFieldCounts?: Record<string, number>,
  ): RequestHandler {
    const effectiveLimits: ActiveUploadLimits =
      declaredFieldCounts != null
        ? { ...limits, perFieldFileCounts: declaredFieldCounts }
        : limits;

    return (req, res, next) => {
      (req as RequestWithUploadLimits)._uploadLimits = effectiveLimits;
      handler(req, res, (err?: unknown) => {
        if (
          declaredFieldCounts != null &&
          err instanceof multer.MulterError &&
          err.code === "LIMIT_UNEXPECTED_FILE" &&
          err.field != null &&
          Object.prototype.hasOwnProperty.call(declaredFieldCounts, err.field)
        ) {
          const converted = new multer.MulterError("LIMIT_FILE_COUNT");
          converted.field = err.field;
          return next(converted);
        }
        next(err);
      });
    };
  }

  return {
    single: (fieldname) =>
      makeHandler(instance.single(fieldname), { [fieldname]: 1 }),
    array: (fieldname, maxCount) =>
      makeHandler(
        instance.array(fieldname, maxCount),
        typeof maxCount === "number" ? { [fieldname]: maxCount } : undefined,
      ),
    fields: (fields) => {
      const declaredFieldCounts = Object.fromEntries(
        fields
          .filter((f) => typeof f.maxCount === "number")
          .map((f) => [f.name, f.maxCount as number]),
      );
      return makeHandler(
        instance.fields(fields),
        Object.keys(declaredFieldCounts).length > 0
          ? declaredFieldCounts
          : undefined,
      );
    },
    none: () => makeHandler(instance.none()),
    any: () => makeHandler(instance.any()),
  } as multer.Multer;
}

/**
 * Create a new multer instance with the given storage engine and the
 * UPLOAD_MAX_FILE_SIZE cap applied. Use this when you need disk storage or a
 * custom per-endpoint file-size, file-count, or field-count limit.
 *
 * Per-call overrides in `options` take precedence over the corresponding
 * global config values (`UPLOAD_MAX_FILE_SIZE`, `UPLOAD_MAX_FILES`,
 * `UPLOAD_MAX_FIELDS`).
 *
 * The returned instance annotates every request it processes with the resolved
 * active limits so that `handleUploadError` can embed the exact ceiling in its
 * error messages, even when per-endpoint overrides differ from the global
 * defaults.
 *
 * @param storage - Multer storage engine (defaults to memoryStorage).
 * @param options - Optional per-call limit overrides.
 */
export function createUpload(
  storage: multer.StorageEngine = multer.memoryStorage(),
  options?: CreateUploadOptions,
): multer.Multer {
  const fileSize = options?.fileSizeOverride ?? UPLOAD_MAX_FILE_SIZE;

  if (options?.fileSizeOverride !== undefined) {
    const bodyLimitBytes = bodyLimitToBytes(UPLOAD_BODY_LIMIT);
    if (options.fileSizeOverride > bodyLimitBytes) {
      const message = `createUpload fileSizeOverride (${options.fileSizeOverride} bytes) exceeds UPLOAD_BODY_LIMIT ("${UPLOAD_BODY_LIMIT}" = ${bodyLimitBytes} bytes); the per-endpoint file-size cap is looser than the body limit implies, so oversized files cannot be fully received`;
      const context = {
        fileSizeOverride: options.fileSizeOverride,
        UPLOAD_BODY_LIMIT,
        UPLOAD_BODY_LIMIT_bytes: bodyLimitBytes,
      };
      if (UPLOAD_STRICT_CONFIG) {
        throw new Error(
          `[UPLOAD_STRICT_CONFIG] Upload configuration mismatch — ${message}`,
        );
      }
      logger.warn(context, message);
    }
  }

  const files = options?.maxFiles ?? UPLOAD_MAX_FILES;
  const fields = options?.maxFields ?? UPLOAD_MAX_FIELDS;
  const parts = options?.maxParts ?? UPLOAD_MAX_PARTS;
  const fieldSize = options?.fieldSizeOverride ?? UPLOAD_FIELD_SIZE;

  if (options?.fieldSizeOverride !== undefined) {
    const bodyLimitBytes = bodyLimitToBytes(UPLOAD_BODY_LIMIT);
    if (options.fieldSizeOverride > bodyLimitBytes) {
      const message = `createUpload fieldSizeOverride (${options.fieldSizeOverride} bytes) exceeds UPLOAD_BODY_LIMIT ("${UPLOAD_BODY_LIMIT}" = ${bodyLimitBytes} bytes); the per-endpoint field-size cap is looser than the body limit implies, so oversized field values cannot be fully received`;
      const context = {
        fieldSizeOverride: options.fieldSizeOverride,
        UPLOAD_BODY_LIMIT,
        UPLOAD_BODY_LIMIT_bytes: bodyLimitBytes,
      };
      if (UPLOAD_STRICT_CONFIG) {
        throw new Error(
          `[UPLOAD_STRICT_CONFIG] Upload configuration mismatch — ${message}`,
        );
      }
      logger.warn(context, message);
    }
  }

  const fieldNameSize =
    options?.fieldNameSizeOverride ?? UPLOAD_FIELD_NAME_SIZE;

  const instance = multer({
    storage,
    limits: {
      fileSize,
      fields,
      files,
      parts,
      fieldSize,
      fieldNameSize,
    },
  });

  return wrapWithActiveLimits(instance, {
    fileSize,
    files,
    fields,
    parts,
    fieldSize,
  });
}

// ---------------------------------------------------------------------------
// Default instance (memory storage, UPLOAD_MAX_FILE_SIZE cap)
// ---------------------------------------------------------------------------

/**
 * Pre-configured multer instance using in-memory storage and a file-size cap
 * derived from UPLOAD_MAX_FILE_SIZE (default: 10 MB).
 *
 * Import and use this in upload route handlers. Do NOT call `multer()` directly
 * in route files.
 */
export const upload = createUpload();
