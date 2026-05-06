import multer from "multer";
import type { Request, Response, NextFunction } from "express";

/**
 * Express error-handling middleware that intercepts multer size-limit errors
 * and returns a friendly 413 JSON response instead of a generic 500.
 *
 * Mount this **after** the global error handler in app.ts, or delegate to it
 * from inside the global error handler, so that `MulterError` instances are
 * caught before the catch-all 500 branch runs.
 *
 * Any upload route automatically benefits from this handler once it is
 * registered — no per-route duplication is required.
 *
 * @example
 * // In app.ts, delegate from the global error handler:
 * import { uploadErrorHandler } from "./middlewares/uploadErrorHandler";
 *
 * app.use((err, req, res, next) => {
 *   if (uploadErrorHandler(err, req, res, next)) return;
 *   // ... rest of global error handling
 * });
 */
export function uploadErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction,
): boolean {
  if (!(err instanceof multer.MulterError)) {
    return false;
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      error: "Uploaded file is too large. Please choose a smaller file.",
    });
    return true;
  }

  if (err.code === "LIMIT_FILE_COUNT") {
    res.status(400).json({
      error: "Too many files uploaded at once.",
    });
    return true;
  }

  if (err.code === "LIMIT_FIELD_COUNT") {
    res.status(400).json({
      error: "Too many form fields in the request.",
    });
    return true;
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    res.status(400).json({
      error: `Unexpected upload field: ${err.field ?? "unknown"}.`,
    });
    return true;
  }

  next(err);
  return true;
}
