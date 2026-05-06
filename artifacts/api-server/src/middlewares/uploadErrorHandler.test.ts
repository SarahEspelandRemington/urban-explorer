import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { uploadErrorHandler } from "./uploadErrorHandler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Express app that:
 *  1. Exposes a POST /upload route protected by multer with the given limit.
 *  2. Wires a global error handler that delegates to uploadErrorHandler first,
 *     then falls back to a generic 500 with the original error message —
 *     mirroring the pattern in app.ts.
 */
function buildApp(fileSizeLimitBytes: number) {
  const app = express();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: fileSizeLimitBytes },
  });

  app.post("/upload", upload.single("file"), (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Simulate a route that throws a plain (non-multer) error.
  app.post("/boom", (_req: Request, _res: Response, next: NextFunction) => {
    next(new Error("generic failure"));
  });

  // Global error handler — mirrors app.ts
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (uploadErrorHandler(err, req, res, next)) return;
    res.status(500).json({ error: "other error", message: err.message });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploadErrorHandler middleware", () => {
  describe("oversized multipart upload", () => {
    it("responds 413 with a friendly message when a file exceeds the size limit", async () => {
      const app = buildApp(100); // 100-byte cap

      // 200-byte payload — definitely over the 100-byte cap
      const oversizedBuffer = Buffer.alloc(200, "x");

      const res = await request(app)
        .post("/upload")
        .attach("file", oversizedBuffer, "big.txt");

      expect(res.status).toBe(413);
      expect(res.body).toEqual({
        error: "Uploaded file is too large. Please choose a smaller file.",
      });
    });

    it("responds 200 when a file is within the size limit", async () => {
      const app = buildApp(1024); // 1 KB cap

      const smallBuffer = Buffer.alloc(100, "x");

      const res = await request(app)
        .post("/upload")
        .attach("file", smallBuffer, "small.txt");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe("non-multer errors pass through", () => {
    it("returns false and does not send a response for a plain Error", () => {
      const err = new Error("something unrelated");
      const req = {} as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      } as unknown as Response;
      const next = vi.fn();

      const handled = uploadErrorHandler(err, req, res, next);

      expect(handled).toBe(false);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("delegates non-multer errors to the next error handler in the chain", async () => {
      const app = buildApp(1024);

      const res = await request(app).post("/boom");

      // uploadErrorHandler should have returned false, so the fallback
      // handler runs and returns 500 with the original error message.
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        error: "other error",
        message: "generic failure",
      });
    });
  });
});
