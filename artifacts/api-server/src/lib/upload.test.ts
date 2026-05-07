import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";
import type { IncomingMessage } from "http";
import multer from "multer";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import request from "supertest";
import { handleUploadError, createUpload } from "./upload";

vi.mock("../config", () => ({
  UPLOAD_BODY_LIMIT: "10mb",
  UPLOAD_STRICT_CONFIG: false,
  UPLOAD_MAX_FILE_SIZE: 100,
  UPLOAD_MAX_FILES: 10,
  UPLOAD_MAX_FIELDS: 20,
  UPLOAD_MAX_PARTS: 30,
  UPLOAD_FIELD_NAME_SIZE: 100,
  UPLOAD_FIELD_SIZE: 1048576,
}));

vi.mock("./logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  (res.json as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

function makeReq(uploadLimits?: {
  fileSize: number;
  files: number;
  fields: number;
  parts: number;
  fieldSize: number;
}) {
  const req = {} as Request;
  if (uploadLimits !== undefined) {
    (req as Request & { _uploadLimits?: unknown })._uploadLimits = uploadLimits;
  }
  return req;
}

function makeNext() {
  return vi.fn() as unknown as NextFunction;
}

function multerError(code: string): multer.MulterError {
  return new multer.MulterError(code as multer.MulterError["code"]);
}

function multerErrorWithField(code: string, field: string): multer.MulterError {
  const err = new multer.MulterError(code as multer.MulterError["code"]);
  err.field = field;
  return err;
}

describe("handleUploadError", () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = makeRes();
    next = makeNext();
  });

  it("maps LIMIT_FILE_SIZE to 413 with the configured limit in the message", () => {
    handleUploadError(multerError("LIMIT_FILE_SIZE"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Uploaded file is too large (limit: 100 B).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FILE_SIZE using _uploadLimits fileSize override when present", () => {
    handleUploadError(
      multerError("LIMIT_FILE_SIZE"),
      makeReq({
        fileSize: 5242880,
        files: 10,
        fields: 20,
        parts: 30,
        fieldSize: 1048576,
      }),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Uploaded file is too large (limit: 5 MB).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("includes the field name in LIMIT_FILE_SIZE message when MulterError.field is set", () => {
    handleUploadError(
      multerErrorWithField("LIMIT_FILE_SIZE", "photo"),
      makeReq(),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Uploaded file in field 'photo' is too large (limit: 100 B).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("omits the field name in LIMIT_FILE_SIZE message when MulterError.field is not set", () => {
    handleUploadError(multerError("LIMIT_FILE_SIZE"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Uploaded file is too large (limit: 100 B).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FILE_COUNT to 422 with the configured limit in the message", () => {
    handleUploadError(multerError("LIMIT_FILE_COUNT"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many files uploaded (limit: 10).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FILE_COUNT using _uploadLimits files override when present", () => {
    handleUploadError(
      multerError("LIMIT_FILE_COUNT"),
      makeReq({
        fileSize: 100,
        files: 3,
        fields: 20,
        parts: 30,
        fieldSize: 1048576,
      }),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many files uploaded (limit: 3).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("includes field name in LIMIT_FILE_COUNT message when err.field is set (wrapper-converted per-field overflow)", () => {
    // Simulates the state after wrapWithActiveLimits converts a declared-field
    // LIMIT_UNEXPECTED_FILE to LIMIT_FILE_COUNT with err.field preserved.
    handleUploadError(
      multerErrorWithField("LIMIT_FILE_COUNT", "attachments"),
      makeReq(),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many files in field 'attachments' (limit: 10).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("omits the field name in LIMIT_FILE_COUNT message when err.field is not set (global files cap path)", () => {
    // Multer's global files cap fires LIMIT_FILE_COUNT without err.field;
    // the handler falls back to the generic "Too many files uploaded" message.
    handleUploadError(multerError("LIMIT_FILE_COUNT"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many files uploaded (limit: 10).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FIELD_COUNT to 422 with the configured limit in the message", () => {
    handleUploadError(multerError("LIMIT_FIELD_COUNT"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many form fields in the request (limit: 20).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FIELD_COUNT using _uploadLimits fields override when present", () => {
    handleUploadError(
      multerError("LIMIT_FIELD_COUNT"),
      makeReq({
        fileSize: 100,
        files: 10,
        fields: 5,
        parts: 30,
        fieldSize: 1048576,
      }),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many form fields in the request (limit: 5).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("includes the field name in LIMIT_FIELD_COUNT message when err.field is set", () => {
    handleUploadError(
      multerErrorWithField("LIMIT_FIELD_COUNT", "metadata"),
      makeReq(),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error:
        "Too many form fields in the request (field: 'metadata', limit: 20).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("omits the field name in LIMIT_FIELD_COUNT message when err.field is not set", () => {
    handleUploadError(multerError("LIMIT_FIELD_COUNT"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many form fields in the request (limit: 20).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_PART_COUNT to 400 with the configured limit in the message", () => {
    handleUploadError(multerError("LIMIT_PART_COUNT"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many parts in the multipart request (limit: 30).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_PART_COUNT using _uploadLimits parts override when present", () => {
    handleUploadError(
      multerError("LIMIT_PART_COUNT"),
      makeReq({
        fileSize: 100,
        files: 10,
        fields: 20,
        parts: 7,
        fieldSize: 1048576,
      }),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many parts in the multipart request (limit: 7).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_UNEXPECTED_FILE to 422 without field name when MulterError.field is not set", () => {
    handleUploadError(
      multerError("LIMIT_UNEXPECTED_FILE"),
      makeReq(),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Unexpected file field in the request.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("includes the field name in LIMIT_UNEXPECTED_FILE message when MulterError.field is set", () => {
    handleUploadError(
      multerErrorWithField("LIMIT_UNEXPECTED_FILE", "photo"),
      makeReq(),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Unexpected file field 'photo' in the request.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FIELD_VALUE to 413 with the configured limit in the message", () => {
    handleUploadError(multerError("LIMIT_FIELD_VALUE"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Form field value is too large (limit: 1 MB).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FIELD_VALUE using _uploadLimits fieldSize override when present", () => {
    handleUploadError(
      multerError("LIMIT_FIELD_VALUE"),
      makeReq({
        fileSize: 100,
        files: 10,
        fields: 20,
        parts: 30,
        fieldSize: 512,
      }),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Form field value is too large (limit: 512 B).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("includes the field name in LIMIT_FIELD_VALUE message when MulterError.field is set", () => {
    handleUploadError(
      multerErrorWithField("LIMIT_FIELD_VALUE", "description"),
      makeReq(),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Form field 'description' value is too large (limit: 1 MB).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("omits the field name in LIMIT_FIELD_VALUE message when MulterError.field is not set", () => {
    handleUploadError(multerError("LIMIT_FIELD_VALUE"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Form field value is too large (limit: 1 MB).",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FIELD_KEY to 400", () => {
    handleUploadError(multerError("LIMIT_FIELD_KEY"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Form field name is too long.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps an unknown MulterError code to 400", () => {
    const err = new multer.MulterError(
      "LIMIT_PART_COUNT" as multer.MulterError["code"],
    );
    Object.defineProperty(err, "code", { value: "LIMIT_UNKNOWN_CODE" });
    handleUploadError(err, makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Upload error." });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes a non-multer Error to next without responding", () => {
    const err = new Error("something went wrong");
    handleUploadError(err, makeReq(), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("passes a non-multer non-Error value to next without responding", () => {
    const err = { message: "plain object error" };
    handleUploadError(err, makeReq(), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Integration: createUpload enforces file-size limits via real multer middleware
// ---------------------------------------------------------------------------

const BOUNDARY = "----TestBoundary001";

/**
 * Build a multipart/form-data body with one or more plain text fields (no files).
 */
function buildMultipartBodyWithFields(
  fields: Array<{ name: string; value: string }>,
): Buffer {
  const parts: Buffer[] = [];
  for (const { name, value } of fields) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n` +
          `\r\n` +
          `${value}\r\n`,
      ),
    );
  }
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(parts);
}

/**
 * Build a minimal multipart/form-data body with a single file field.
 * `fieldName` defaults to `"file"` when omitted.
 */
function buildMultipartBody(
  filename: string,
  fileContent: Buffer,
  fieldName = "file",
): Buffer {
  const parts: Buffer[] = [
    Buffer.from(
      `--${BOUNDARY}\r\n` +
        `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n` +
        `\r\n`,
    ),
    fileContent,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ];
  return Buffer.concat(parts);
}

/**
 * Create a mock IncomingMessage-like object multer can read from.
 */
function makeMultipartReq(body: Buffer): IncomingMessage {
  const stream = new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  }) as unknown as IncomingMessage;
  (stream as unknown as Record<string, unknown>).headers = {
    "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
    "content-length": String(body.length),
  };
  return stream;
}

/**
 * Invoke a multer middleware function and resolve with whatever the middleware
 * passed to `next` (if anything) plus the annotated request object.
 * Resolves with `err: undefined` when multer calls `next()` without an
 * argument (i.e. success).
 */
function runMiddleware(
  middleware: (
    req: unknown,
    res: unknown,
    next: (err?: unknown) => void,
  ) => void,
  req: IncomingMessage,
): Promise<{ err: unknown; req: IncomingMessage }> {
  return new Promise((resolve) => {
    middleware(req, {}, (err?: unknown) => resolve({ err, req }));
  });
}

describe("createUpload integration", () => {
  it("rejects a file that exceeds fileSizeOverride with LIMIT_FILE_SIZE", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const oversizedContent = Buffer.alloc(LIMIT_BYTES + 1, "x");
    const body = buildMultipartBody("oversized.bin", oversizedContent);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.single("file") as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FILE_SIZE");
  });

  it("shows the fileSizeOverride value in the LIMIT_FILE_SIZE error message", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const oversizedContent = Buffer.alloc(LIMIT_BYTES + 1, "x");
    const body = buildMultipartBody("oversized.bin", oversizedContent);
    const req = makeMultipartReq(body);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.single("file") as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Uploaded file in field 'file' is too large (limit: 10 B).",
    });
  });

  it("accepts a file that is within the fileSizeOverride limit", async () => {
    const LIMIT_BYTES = 100;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const smallContent = Buffer.alloc(LIMIT_BYTES - 1, "x");
    const body = buildMultipartBody("small.bin", smallContent);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.single("file") as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeUndefined();
  });

  it("rejects a file that exceeds the UPLOAD_MAX_FILE_SIZE baseline (100) without any fileSizeOverride", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const oversizedContent = Buffer.alloc(101, "x");
    const body = buildMultipartBody("oversized.bin", oversizedContent);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.single("file") as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FILE_SIZE");
  });

  it("accepts a file within the UPLOAD_MAX_FILE_SIZE baseline (100) without any fileSizeOverride", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const okContent = Buffer.alloc(99, "x");
    const body = buildMultipartBody("ok.bin", okContent);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.single("file") as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeUndefined();
  });

  it("rejects when file count exceeds maxFiles override", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const combinedBody = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="files"; filename="a.bin"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from("hello"),
      Buffer.from(`\r\n--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="files"; filename="b.bin"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from("world"),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);

    const req = makeMultipartReq(combinedBody);

    const { err } = await runMiddleware(
      uploadInstance.array("files", 2) as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FILE_COUNT");
  });

  it("shows the maxFiles override value in the LIMIT_FILE_COUNT error message", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const combinedBody = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="files"; filename="a.bin"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from("hello"),
      Buffer.from(`\r\n--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="files"; filename="b.bin"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from("world"),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);

    const req = makeMultipartReq(combinedBody);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.array("files", 2) as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many files uploaded (limit: 1).",
    });
  });

  it("rejects when non-file field count exceeds maxFields override with LIMIT_FIELD_COUNT", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const body = buildMultipartBodyWithFields([
      { name: "alpha", value: "first" },
      { name: "beta", value: "second" },
    ]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FIELD_COUNT");
  });

  it("shows the maxFields override value in the LIMIT_FIELD_COUNT error message", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const body = buildMultipartBodyWithFields([
      { name: "alpha", value: "first" },
      { name: "beta", value: "second" },
    ]);
    const req = makeMultipartReq(body);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many form fields in the request (limit: 1).",
    });
  });

  it("emits LIMIT_FIELD_COUNT without err.field when the fields limit fires and produces the generic message", async () => {
    // Multer fires LIMIT_FIELD_COUNT via busboy's 'fieldsLimit' event (global
    // non-file fields cap). That event does not carry a field name, so
    // err.field is not set on the resulting MulterError. The handler therefore
    // falls back to the generic "Too many form fields in the request" message
    // for this path.
    //
    // The with-field message format ("Too many form fields in the request
    // (field: 'X', limit: N).") is exercised by the unit tests above and would
    // apply if err.field were populated by a custom middleware or a future
    // multer version.
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const body = buildMultipartBodyWithFields([
      { name: "alpha", value: "first" },
      { name: "beta", value: "second" },
    ]);
    const req = makeMultipartReq(body);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FIELD_COUNT");
    expect((err as multer.MulterError).field).toBeUndefined();

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many form fields in the request (limit: 1).",
    });
  });

  it("rejects a field value that exceeds fieldSizeOverride with LIMIT_FIELD_VALUE", async () => {
    const FIELD_SIZE_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const body = buildMultipartBodyWithFields([
      { name: "description", value: oversizedValue },
    ]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FIELD_VALUE");
  });

  it("shows the fieldSizeOverride value in the LIMIT_FIELD_VALUE error message", async () => {
    const FIELD_SIZE_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const body = buildMultipartBodyWithFields([
      { name: "description", value: oversizedValue },
    ]);
    const req = makeMultipartReq(body);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Form field 'description' value is too large (limit: 10 B).",
    });
  });

  it("shows the global UPLOAD_FIELD_SIZE in the LIMIT_FIELD_VALUE error message without a fieldSizeOverride", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const oversizedValue = "x".repeat(1048576 + 1);
    const body = buildMultipartBodyWithFields([
      { name: "description", value: oversizedValue },
    ]);
    const req = makeMultipartReq(body);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Form field 'description' value is too large (limit: 1 MB).",
    });
  });

  it("includes the field name in the LIMIT_FIELD_VALUE error message when fieldSizeOverride is set", async () => {
    const FIELD_SIZE_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const body = buildMultipartBodyWithFields([
      { name: "description", value: oversizedValue },
    ]);
    const req = makeMultipartReq(body);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).field).toBe("description");

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Form field 'description' value is too large (limit: 10 B).",
    });
  });

  it("emits LIMIT_FIELD_VALUE with err.field populated by multer when a field value exceeds the limit", async () => {
    // Multer fires LIMIT_FIELD_VALUE via busboy's 'field' event and does
    // populate err.field with the offending field name for this code path.
    // This differs from LIMIT_FILE_COUNT and LIMIT_FIELD_COUNT (global caps),
    // where the busboy limit events carry no field name and err.field is not
    // set. Here, using the global UPLOAD_FIELD_SIZE baseline (no
    // fieldSizeOverride), we confirm multer's real behavior so the handler's
    // "Form field 'X' value is too large" branch is reachable without any
    // per-endpoint override.
    const uploadInstance = createUpload(multer.memoryStorage());

    const oversizedValue = "x".repeat(1048576 + 1);
    const body = buildMultipartBodyWithFields([
      { name: "description", value: oversizedValue },
    ]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FIELD_VALUE");
    expect((err as multer.MulterError).field).toBe("description");
  });

  it("rejects a field whose name exceeds fieldNameSizeOverride with LIMIT_FIELD_KEY", async () => {
    const FIELD_NAME_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldNameSizeOverride: FIELD_NAME_SIZE_BYTES,
    });

    const tooLongName = "x".repeat(FIELD_NAME_SIZE_BYTES + 1);
    const body = buildMultipartBodyWithFields([
      { name: tooLongName, value: "ok" },
    ]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FIELD_KEY");
  });

  it("rejects a field whose name exceeds the UPLOAD_FIELD_NAME_SIZE baseline without any override", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const tooLongName = "x".repeat(101);
    const body = buildMultipartBodyWithFields([
      { name: tooLongName, value: "ok" },
    ]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FIELD_KEY");
  });

  it("accepts a field whose name is within the UPLOAD_FIELD_NAME_SIZE baseline without any override", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const okName = "x".repeat(100);
    const body = buildMultipartBodyWithFields([{ name: okName, value: "ok" }]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeUndefined();
  });

  it("rejects a field value that exceeds the UPLOAD_FIELD_SIZE baseline without any override", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const oversizedValue = "x".repeat(1048576 + 1);
    const body = buildMultipartBodyWithFields([
      { name: "description", value: oversizedValue },
    ]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FIELD_VALUE");
  });

  it("accepts a field value that is within the UPLOAD_FIELD_SIZE baseline without any override", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const okValue = "x".repeat(1048576 - 1);
    const body = buildMultipartBodyWithFields([
      { name: "description", value: okValue },
    ]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeUndefined();
  });

  it("rejects when total parts exceed the UPLOAD_MAX_PARTS baseline (30) without a maxParts override", async () => {
    // Override maxFields to 50 so the field-count limit is not the binding
    // constraint; only the UPLOAD_MAX_PARTS config value (30) should fire.
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 50,
    });

    const fields = Array.from({ length: 31 }, (_, i) => ({
      name: `field${i}`,
      value: "v",
    }));
    const body = buildMultipartBodyWithFields(fields);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_PART_COUNT");
  });

  it("accepts total parts below the UPLOAD_MAX_PARTS baseline (30) without a maxParts override", async () => {
    // Override maxFields to 50 so the field-count limit is not the binding
    // constraint; sending 29 fields (< 30) should succeed.
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 50,
    });

    const fields = Array.from({ length: 29 }, (_, i) => ({
      name: `field${i}`,
      value: "v",
    }));
    const body = buildMultipartBodyWithFields(fields);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeUndefined();
  });

  it("rejects when total parts exceed maxParts override with LIMIT_PART_COUNT", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxParts: 2,
    });

    const body = buildMultipartBodyWithFields([
      { name: "alpha", value: "1" },
      { name: "beta", value: "2" },
      { name: "gamma", value: "3" },
    ]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_PART_COUNT");
  });

  it("accepts total parts within the maxParts override", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxParts: 3,
    });

    const body = buildMultipartBodyWithFields([
      { name: "alpha", value: "1" },
      { name: "beta", value: "2" },
    ]);
    const req = makeMultipartReq(body);

    const { err } = await runMiddleware(
      uploadInstance.none() as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeUndefined();
  });

  it("populates err.field with the file field name on LIMIT_FILE_SIZE and includes it in the error message", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const oversizedContent = Buffer.alloc(LIMIT_BYTES + 1, "x");
    const body = buildMultipartBody("oversized.bin", oversizedContent, "photo");
    const req = makeMultipartReq(body);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.single("photo") as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FILE_SIZE");
    expect((err as multer.MulterError).field).toBe("photo");

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Uploaded file in field 'photo' is too large (limit: 10 B).",
    });
  });

  it("populates err.field with the unexpected field name on LIMIT_UNEXPECTED_FILE and includes it in the error message", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const body = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="photo"; filename="pic.jpg"\r\n` +
          `Content-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from("fakeimagecontent"),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const req = makeMultipartReq(body);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.single("avatar") as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_UNEXPECTED_FILE");
    expect((err as multer.MulterError).field).toBe("photo");

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Unexpected file field 'photo' in the request.",
    });
  });

  it("emits LIMIT_FILE_COUNT without err.field when the global files limit fires and produces the generic message", async () => {
    // Multer fires LIMIT_FILE_COUNT via busboy's 'filesLimit' event (global
    // files cap). That event does not carry a field name, so err.field is not
    // set on the resulting MulterError. The handler therefore falls back to the
    // generic "Too many files uploaded" message for this path.
    //
    // The with-field message format ("Too many files in field 'X'...") is
    // exercised by the unit tests above and would apply if err.field were
    // populated by a custom middleware or a future multer version.
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const twoFiles = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="attachments"; filename="a.bin"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from("hello"),
      Buffer.from(`\r\n--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="attachments"; filename="b.bin"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from("world"),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const req = makeMultipartReq(twoFiles);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.array("attachments", 5) as Parameters<
        typeof runMiddleware
      >[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FILE_COUNT");
    expect((err as multer.MulterError).field).toBeUndefined();

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many files uploaded (limit: 1).",
    });
  });

  it("converts a per-field count overflow to LIMIT_FILE_COUNT with field name via upload.fields", async () => {
    // upload.fields([{ name, maxCount }]) exceeding maxCount fires
    // LIMIT_UNEXPECTED_FILE internally. The wrapWithActiveLimits wrapper
    // detects that the field was declared, converts the error to
    // LIMIT_FILE_COUNT with err.field set, and handleUploadError emits the
    // clear "Too many files in field 'X' (limit: N)." message.
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 10,
    });

    const twoFilesInAttachments = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="attachments"; filename="a.bin"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from("hello"),
      Buffer.from(`\r\n--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="attachments"; filename="b.bin"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from("world"),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const req = makeMultipartReq(twoFilesInAttachments);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.fields([
        { name: "attachments", maxCount: 1 },
      ]) as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FILE_COUNT");
    expect((err as multer.MulterError).field).toBe("attachments");

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many files in field 'attachments' (limit: 1).",
    });
  });

  it("converts a per-field count overflow to LIMIT_FILE_COUNT with field name via upload.array", async () => {
    // upload.array(fieldname, maxCount) exceeding maxCount fires
    // LIMIT_UNEXPECTED_FILE internally. Same conversion as fields().
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 10,
    });

    const twoFilesInPhotos = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="photos"; filename="a.jpg"\r\n` +
          `Content-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from("fakeimage1"),
      Buffer.from(`\r\n--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="photos"; filename="b.jpg"\r\n` +
          `Content-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from("fakeimage2"),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const req = makeMultipartReq(twoFilesInPhotos);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.array("photos", 1) as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_FILE_COUNT");
    expect((err as multer.MulterError).field).toBe("photos");

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many files in field 'photos' (limit: 1).",
    });
  });

  it("leaves a truly unexpected file field as LIMIT_UNEXPECTED_FILE when using upload.fields", async () => {
    // A field that was NOT declared in upload.fields([...]) should still
    // produce the "Unexpected file field" message — the conversion only
    // applies to declared fields that exceed their per-field maxCount.
    const uploadInstance = createUpload(multer.memoryStorage());

    const bodyWithUndeclaredField = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="avatar"; filename="pic.jpg"\r\n` +
          `Content-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from("fakeimagecontent"),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const req = makeMultipartReq(bodyWithUndeclaredField);

    const { err, req: annotatedReq } = await runMiddleware(
      uploadInstance.fields([
        { name: "attachments", maxCount: 3 },
      ]) as Parameters<typeof runMiddleware>[0],
      req,
    );

    expect(err).toBeInstanceOf(multer.MulterError);
    expect((err as multer.MulterError).code).toBe("LIMIT_UNEXPECTED_FILE");
    expect((err as multer.MulterError).field).toBe("avatar");

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    handleUploadError(err, annotatedReq as unknown as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Unexpected file field 'avatar' in the request.",
    });
  });
});

// ---------------------------------------------------------------------------
// End-to-end: real Express route — all upload error codes
// ---------------------------------------------------------------------------

describe("upload error codes end-to-end via real Express route", () => {
  // ---- LIMIT_FILE_SIZE -------------------------------------------------------

  it("LIMIT_FILE_SIZE: returns 413 with field name when a file exceeds fileSizeOverride", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("photo"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.alloc(LIMIT_BYTES + 1, "x"), "oversized.bin");

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Uploaded file in field 'photo' is too large (limit: 10 B).",
    });
  });

  it("LIMIT_FILE_SIZE: returns 413 with the global UPLOAD_MAX_FILE_SIZE baseline (100 B) when no override is set", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("file"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.alloc(101, "x"), "oversized.bin");

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Uploaded file in field 'file' is too large (limit: 100 B).",
    });
  });

  // ---- LIMIT_FILE_COUNT ------------------------------------------------------

  it("LIMIT_FILE_COUNT: returns 422 with limit when more files are uploaded than maxFiles allows", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.array("files", 5),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("files", Buffer.from("hello"), "a.bin")
      .attach("files", Buffer.from("world"), "b.bin");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many files uploaded (limit: 1).",
    });
  });

  it("LIMIT_FILE_COUNT (per-field via array): returns 422 with per-field limit when the declared field maxCount is exceeded", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 10,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.array("photos", 1),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photos", Buffer.from("img1"), "a.jpg")
      .attach("photos", Buffer.from("img2"), "b.jpg");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many files in field 'photos' (limit: 1).",
    });
  });

  it("LIMIT_FILE_COUNT (per-field via fields): returns 422 with per-field limit when declared field maxCount is exceeded", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 10,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.fields([{ name: "attachments", maxCount: 1 }]),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("attachments", Buffer.from("hello"), "a.bin")
      .attach("attachments", Buffer.from("world"), "b.bin");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many files in field 'attachments' (limit: 1).",
    });
  });

  // ---- LIMIT_FIELD_COUNT -----------------------------------------------------

  it("LIMIT_FIELD_COUNT: returns 422 with limit when more non-file fields are sent than maxFields allows", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "first")
      .field("beta", "second");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many form fields in the request (limit: 1).",
    });
  });

  it("LIMIT_FIELD_COUNT: returns 422 with the global UPLOAD_MAX_FIELDS baseline (20) when no override is set", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const bodyBuilder = request(app).post("/upload");
    for (let i = 0; i <= 20; i++) {
      bodyBuilder.field(`field${i}`, "v");
    }
    const res = await bodyBuilder;

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many form fields in the request (limit: 20).",
    });
  });

  // ---- LIMIT_PART_COUNT ------------------------------------------------------

  it("LIMIT_PART_COUNT: returns 400 with limit when total parts exceed maxParts override", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxParts: 2,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "1")
      .field("beta", "2")
      .field("gamma", "3");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Too many parts in the multipart request (limit: 2).",
    });
  });

  it("LIMIT_PART_COUNT: returns 400 with the global UPLOAD_MAX_PARTS baseline (30) when no override is set", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 50,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const bodyBuilder = request(app).post("/upload");
    for (let i = 0; i <= 30; i++) {
      bodyBuilder.field(`field${i}`, "v");
    }
    const res = await bodyBuilder;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Too many parts in the multipart request (limit: 30).",
    });
  });

  // ---- LIMIT_UNEXPECTED_FILE -------------------------------------------------

  it("LIMIT_UNEXPECTED_FILE: returns 422 with the unexpected field name when a file is sent in an undeclared field", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("avatar"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.from("fakeimagecontent"), "pic.jpg");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Unexpected file field 'photo' in the request.",
    });
  });

  it("LIMIT_UNEXPECTED_FILE: returns 422 with the unexpected field name when using upload.fields and an undeclared file field is sent", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.fields([{ name: "attachments", maxCount: 3 }]),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("avatar", Buffer.from("fakeimagecontent"), "pic.jpg");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Unexpected file field 'avatar' in the request.",
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-middleware stack: upload errors survive preceding error handlers and
// non-multer errors reach downstream handlers untouched
// ---------------------------------------------------------------------------

describe("handleUploadError in a multi-middleware error stack", () => {
  // A lightweight "auth error handler" that only handles errors with a
  // specific marker, passing everything else to the next error handler.
  // This simulates real production stacks where several domain-specific
  // error handlers are chained before the upload handler.
  function authErrorHandler(
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (
      err instanceof Error &&
      (err as Error & { type?: string }).type === "auth"
    ) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    next(err);
  }

  // A simple validation-error handler that only handles errors with a
  // `validationErrors` array, passing everything else downstream.
  function validationErrorHandler(
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (
      err != null &&
      typeof err === "object" &&
      Array.isArray((err as Record<string, unknown>).validationErrors)
    ) {
      res
        .status(422)
        .json({ errors: (err as Record<string, unknown>).validationErrors });
      return;
    }
    next(err);
  }

  // A catch-all fallback that records whatever it receives so tests can
  // assert on it without sending a response themselves.
  function makeFallbackHandler(): {
    handler: (
      err: unknown,
      req: Request,
      res: Response,
      next: NextFunction,
    ) => void;
    captured: { err: unknown }[];
  } {
    const captured: { err: unknown }[] = [];
    return {
      handler(err, _req, res, _next) {
        captured.push({ err });
        res.status(500).json({ error: "fallback" });
      },
      captured,
    };
  }

  it("multer LIMIT_FILE_SIZE still resolves to 413 when a preceding auth error handler is mounted first", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("photo"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Auth handler fires first — it does not recognise MulterError and calls next(err).
    app.use(authErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.alloc(LIMIT_BYTES + 1, "x"), "oversized.bin");

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Uploaded file in field 'photo' is too large (limit: 10 B).",
    });
  });

  it("multer LIMIT_FILE_SIZE still resolves to 413 when a preceding validation handler is mounted first", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("photo"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Validation handler fires first — it does not recognise MulterError and calls next(err).
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.alloc(LIMIT_BYTES + 1, "x"), "oversized.bin");

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Uploaded file in field 'photo' is too large (limit: 10 B).",
    });
  });

  it("multer LIMIT_FILE_SIZE still resolves to 413 when both an auth and a validation handler precede handleUploadError", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("photo"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.alloc(LIMIT_BYTES + 1, "x"), "oversized.bin");

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Uploaded file in field 'photo' is too large (limit: 10 B).",
    });
  });

  it("multer LIMIT_FILE_COUNT still resolves to 422 when both an auth and a validation handler precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.array("files", 5),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("files", Buffer.from("hello"), "a.bin")
      .attach("files", Buffer.from("world"), "b.bin");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many files uploaded (limit: 1).",
    });
  });

  it("multer LIMIT_FILE_COUNT still resolves to 422 when a preceding validation handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.array("files", 5),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("files", Buffer.from("hello"), "a.bin")
      .attach("files", Buffer.from("world"), "b.bin");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many files uploaded (limit: 1).",
    });
  });

  it("multer LIMIT_FILE_COUNT still resolves to 422 when a preceding auth error handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.array("files", 5),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Auth handler fires first — it does not recognise MulterError and calls next(err).
    app.use(authErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("files", Buffer.from("hello"), "a.bin")
      .attach("files", Buffer.from("world"), "b.bin");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many files uploaded (limit: 1).",
    });
  });

  it("multer LIMIT_FIELD_COUNT still resolves to 422 when a preceding validation handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "first")
      .field("beta", "second");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many form fields in the request (limit: 1).",
    });
  });

  it("multer LIMIT_FIELD_COUNT still resolves to 422 when a preceding auth error handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Auth handler fires first — it does not recognise MulterError and calls next(err).
    app.use(authErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "first")
      .field("beta", "second");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many form fields in the request (limit: 1).",
    });
  });

  it("multer LIMIT_FIELD_COUNT still resolves to 422 when both an auth and a validation handler precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "first")
      .field("beta", "second");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many form fields in the request (limit: 1).",
    });
  });

  it("multer LIMIT_UNEXPECTED_FILE still resolves to 422 when a preceding auth handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("avatar"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(authErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.from("fakeimagecontent"), "pic.jpg");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Unexpected file field 'photo' in the request.",
    });
  });

  it("multer LIMIT_UNEXPECTED_FILE still resolves to 422 when a preceding validation handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("avatar"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.from("fakeimagecontent"), "pic.jpg");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Unexpected file field 'photo' in the request.",
    });
  });

  it("multer LIMIT_UNEXPECTED_FILE still resolves to 422 when both an auth and a validation handler precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("avatar"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.from("fakeimagecontent"), "pic.jpg");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Unexpected file field 'photo' in the request.",
    });
  });

  it("auth errors are handled by the preceding auth handler and do not reach handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());
    const { handler: fallback, captured } = makeFallbackHandler();

    const app = express();
    app.post("/upload", (_req: Request, _res: Response, next: NextFunction) => {
      const err = new Error("not logged in") as Error & { type: string };
      err.type = "auth";
      next(err);
    });
    app.use(authErrorHandler);
    app.use(handleUploadError);
    app.use(fallback);

    const res = await request(app).post("/upload").field("x", "y");

    // Auth handler should have responded; handleUploadError should not fire.
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized." });
    // Nothing should have fallen through to the fallback.
    expect(captured).toHaveLength(0);
  });

  it("non-multer generic Error passes through handleUploadError and reaches the downstream fallback handler", async () => {
    const { handler: fallback, captured } = makeFallbackHandler();

    const genericError = new Error("database exploded");

    const app = express();
    app.post("/upload", (_req: Request, _res: Response, next: NextFunction) => {
      next(genericError);
    });
    app.use(handleUploadError);
    app.use(fallback);

    const res = await request(app).post("/upload").field("x", "y");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "fallback" });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.err).toBe(genericError);
  });

  it("non-multer non-Error plain object passes through handleUploadError and reaches the downstream fallback handler", async () => {
    const { handler: fallback, captured } = makeFallbackHandler();

    const plainError = { message: "custom plain-object error", code: 42 };

    const app = express();
    app.post("/upload", (_req: Request, _res: Response, next: NextFunction) => {
      next(plainError);
    });
    app.use(handleUploadError);
    app.use(fallback);

    const res = await request(app).post("/upload").field("x", "y");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "fallback" });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.err).toBe(plainError);
  });

  it("non-multer error is not double-handled when handleUploadError is sandwiched between two handlers", async () => {
    // A second catch-all mounted after handleUploadError ensures that if
    // handleUploadError accidentally responds AND calls next(), the second
    // handler would also fire (and we can assert it didn't).
    const { handler: fallback, captured } = makeFallbackHandler();

    const genericError = new Error("something broke");

    const app = express();
    app.post("/upload", (_req: Request, _res: Response, next: NextFunction) => {
      next(genericError);
    });
    // Preceding handler does not match — passes through.
    app.use(authErrorHandler);
    // handleUploadError must not respond and must call next(err) exactly once.
    app.use(handleUploadError);
    // Only this fallback should produce the response.
    app.use(fallback);

    const res = await request(app).post("/upload").field("x", "y");

    expect(res.status).toBe(500);
    // Fallback fires exactly once — no double response.
    expect(captured).toHaveLength(1);
    expect(captured[0]!.err).toBe(genericError);
  });

  // A lightweight "rate-limit error handler" that only handles errors with a
  // specific marker, passing everything else to the next error handler.
  // This simulates express-rate-limit's custom handler or any 429 responder
  // that sits before handleUploadError in the production middleware stack.
  function rateLimitErrorHandler(
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (
      err instanceof Error &&
      (err as Error & { type?: string }).type === "rate_limit"
    ) {
      res.status(429).json({ error: "Too many requests." });
      return;
    }
    next(err);
  }

  it("multer LIMIT_FILE_SIZE still resolves to 413 when a preceding rate-limit error handler is mounted first", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("photo"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Rate-limit handler fires first — it does not recognise MulterError and calls next(err).
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.alloc(LIMIT_BYTES + 1, "x"), "oversized.bin");

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Uploaded file in field 'photo' is too large (limit: 10 B).",
    });
  });

  it("multer LIMIT_FILE_COUNT still resolves to 422 when a preceding rate-limit error handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.array("files", 5),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Rate-limit handler fires first — it does not recognise MulterError and calls next(err).
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("files", Buffer.from("hello"), "a.bin")
      .attach("files", Buffer.from("world"), "b.bin");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many files uploaded (limit: 1).",
    });
  });

  it("multer LIMIT_FIELD_COUNT still resolves to 422 when a preceding rate-limit error handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Rate-limit handler fires first — it does not recognise MulterError and calls next(err).
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "first")
      .field("beta", "second");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many form fields in the request (limit: 1).",
    });
  });

  it("multer LIMIT_PART_COUNT still resolves to 400 when a preceding rate-limit error handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxParts: 2,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Rate-limit handler fires first — it does not recognise MulterError and calls next(err).
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "1")
      .field("beta", "2")
      .field("gamma", "3");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Too many parts in the multipart request (limit: 2).",
    });
  });

  it("multer LIMIT_PART_COUNT still resolves to 400 when a preceding validation handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxParts: 2,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Validation handler fires first — it does not recognise MulterError and calls next(err).
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "1")
      .field("beta", "2")
      .field("gamma", "3");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Too many parts in the multipart request (limit: 2).",
    });
  });

  it("multer LIMIT_UNEXPECTED_FILE still resolves to 422 when a preceding rate-limit error handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("avatar"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Rate-limit handler fires first — it does not recognise MulterError and calls next(err).
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.from("fakeimagecontent"), "pic.jpg");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Unexpected file field 'photo' in the request.",
    });
  });

  it("multer LIMIT_FIELD_VALUE still resolves to 413 when a preceding rate-limit error handler is mounted first", async () => {
    const FIELD_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Rate-limit handler fires first — it does not recognise MulterError and calls next(err).
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const res = await request(app)
      .post("/upload")
      .field("description", oversizedValue);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Form field 'description' value is too large (limit: 5 B).",
    });
  });

  it("multer LIMIT_FIELD_VALUE still resolves to 413 when a preceding validation handler is mounted first", async () => {
    const FIELD_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Validation handler fires first — it does not recognise MulterError and calls next(err).
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const res = await request(app)
      .post("/upload")
      .field("description", oversizedValue);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Form field 'description' value is too large (limit: 5 B).",
    });
  });

  it("multer LIMIT_FIELD_KEY still resolves to 400 when a preceding rate-limit error handler is mounted first", async () => {
    const FIELD_NAME_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldNameSizeOverride: FIELD_NAME_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Rate-limit handler fires first — it does not recognise MulterError and calls next(err).
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const tooLongFieldName = "toolongname";
    const res = await request(app)
      .post("/upload")
      .field(tooLongFieldName, "value");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Form field name is too long.",
    });
  });

  it("multer LIMIT_FIELD_KEY still resolves to 400 when a preceding validation handler is mounted first", async () => {
    const FIELD_NAME_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldNameSizeOverride: FIELD_NAME_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Validation handler fires first — it does not recognise MulterError and calls next(err).
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const tooLongFieldName = "toolongname";
    const res = await request(app)
      .post("/upload")
      .field(tooLongFieldName, "value");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Form field name is too long.",
    });
  });

  it("multer LIMIT_FIELD_VALUE still resolves to 413 when both an auth and a rate-limit handler precede handleUploadError", async () => {
    const FIELD_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const res = await request(app)
      .post("/upload")
      .field("description", oversizedValue);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Form field 'description' value is too large (limit: 5 B).",
    });
  });

  it("multer LIMIT_FIELD_VALUE still resolves to 413 when both an auth and a validation handler precede handleUploadError", async () => {
    const FIELD_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const res = await request(app)
      .post("/upload")
      .field("description", oversizedValue);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Form field 'description' value is too large (limit: 5 B).",
    });
  });

  it("multer LIMIT_FIELD_VALUE still resolves to 413 when a preceding auth error handler is mounted first", async () => {
    const FIELD_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Auth handler fires first — it does not recognise MulterError and calls next(err).
    app.use(authErrorHandler);
    app.use(handleUploadError);

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const res = await request(app)
      .post("/upload")
      .field("description", oversizedValue);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Form field 'description' value is too large (limit: 5 B).",
    });
  });

  it("multer LIMIT_FIELD_KEY still resolves to 400 when both an auth and a rate-limit handler precede handleUploadError", async () => {
    const FIELD_NAME_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldNameSizeOverride: FIELD_NAME_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const tooLongFieldName = "toolongname";
    const res = await request(app)
      .post("/upload")
      .field(tooLongFieldName, "value");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Form field name is too long.",
    });
  });

  it("multer LIMIT_FIELD_KEY still resolves to 400 when both an auth and a validation handler precede handleUploadError", async () => {
    const FIELD_NAME_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldNameSizeOverride: FIELD_NAME_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const tooLongFieldName = "toolongname";
    const res = await request(app)
      .post("/upload")
      .field(tooLongFieldName, "value");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Form field name is too long.",
    });
  });

  it("multer LIMIT_FIELD_KEY still resolves to 400 when a preceding auth error handler is mounted first", async () => {
    const FIELD_NAME_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldNameSizeOverride: FIELD_NAME_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Auth handler fires first — it does not recognise MulterError and calls next(err).
    app.use(authErrorHandler);
    app.use(handleUploadError);

    const tooLongFieldName = "toolongname";
    const res = await request(app)
      .post("/upload")
      .field(tooLongFieldName, "value");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Form field name is too long.",
    });
  });

  it("multer LIMIT_FILE_SIZE still resolves to 413 when both an auth and a rate-limit handler precede handleUploadError", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("photo"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.alloc(LIMIT_BYTES + 1, "x"), "oversized.bin");

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Uploaded file in field 'photo' is too large (limit: 10 B).",
    });
  });

  it("multer LIMIT_FILE_COUNT still resolves to 422 when both an auth and a rate-limit handler precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.array("files", 5),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("files", Buffer.from("hello"), "a.bin")
      .attach("files", Buffer.from("world"), "b.bin");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many files uploaded (limit: 1).",
    });
  });

  it("multer LIMIT_FIELD_COUNT still resolves to 422 when both an auth and a rate-limit handler precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );

    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "first")
      .field("beta", "second");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many form fields in the request (limit: 1).",
    });
  });

  it("multer LIMIT_UNEXPECTED_FILE still resolves to 422 when both an auth and a rate-limit handler precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("avatar"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.from("fakeimagecontent"), "pic.jpg");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Unexpected file field 'photo' in the request.",
    });
  });

  it("multer LIMIT_PART_COUNT still resolves to 400 when both an auth and a rate-limit handler precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxParts: 2,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "1")
      .field("beta", "2")
      .field("gamma", "3");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Too many parts in the multipart request (limit: 2).",
    });
  });

  it("multer LIMIT_PART_COUNT still resolves to 400 when both an auth and a validation handler precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxParts: 2,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Two preceding error handlers — neither handles MulterError.
    app.use(authErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "1")
      .field("beta", "2")
      .field("gamma", "3");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Too many parts in the multipart request (limit: 2).",
    });
  });

  it("multer LIMIT_PART_COUNT still resolves to 400 when a preceding auth error handler is mounted first", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxParts: 2,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Auth handler fires first — it does not recognise MulterError and calls next(err).
    app.use(authErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "1")
      .field("beta", "2")
      .field("gamma", "3");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Too many parts in the multipart request (limit: 2).",
    });
  });

  it("a rate-limit error produces 429 and does not reach handleUploadError", async () => {
    const { handler: fallback, captured } = makeFallbackHandler();

    const app = express();
    app.post("/upload", (_req: Request, _res: Response, next: NextFunction) => {
      const err = new Error("rate limit exceeded") as Error & { type: string };
      err.type = "rate_limit";
      next(err);
    });
    app.use(rateLimitErrorHandler);
    app.use(handleUploadError);
    app.use(fallback);

    const res = await request(app).post("/upload").field("x", "y");

    // Rate-limit handler should have responded with 429.
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Too many requests." });
    // handleUploadError (and the fallback) must not have been reached.
    expect(captured).toHaveLength(0);
  });

  it("multer LIMIT_FILE_SIZE still resolves to 413 when auth, rate-limit, and validation handlers all precede handleUploadError", async () => {
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("photo"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Three preceding error handlers — none handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.alloc(LIMIT_BYTES + 1, "x"), "oversized.bin");

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Uploaded file in field 'photo' is too large (limit: 10 B).",
    });
  });

  it("multer LIMIT_FILE_COUNT still resolves to 422 when auth, rate-limit, and validation handlers all precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFiles: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.array("files", 5),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Three preceding error handlers — none handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("files", Buffer.from("hello"), "a.bin")
      .attach("files", Buffer.from("world"), "b.bin");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many files uploaded (limit: 1).",
    });
  });

  it("multer LIMIT_FIELD_COUNT still resolves to 422 when auth, rate-limit, and validation handlers all precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxFields: 1,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Three preceding error handlers — none handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "first")
      .field("beta", "second");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Too many form fields in the request (limit: 1).",
    });
  });

  it("multer LIMIT_UNEXPECTED_FILE still resolves to 422 when auth, rate-limit, and validation handlers all precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("avatar"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Three preceding error handlers — none handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .attach("photo", Buffer.from("fakeimagecontent"), "pic.jpg");

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Unexpected file field 'photo' in the request.",
    });
  });

  it("multer LIMIT_FIELD_VALUE still resolves to 413 when auth, rate-limit, and validation handlers all precede handleUploadError", async () => {
    const FIELD_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Three preceding error handlers — none handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const res = await request(app)
      .post("/upload")
      .field("description", oversizedValue);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Form field 'description' value is too large (limit: 5 B).",
    });
  });

  it("multer LIMIT_FIELD_KEY still resolves to 400 when auth, rate-limit, and validation handlers all precede handleUploadError", async () => {
    const FIELD_NAME_SIZE_BYTES = 5;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldNameSizeOverride: FIELD_NAME_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Three preceding error handlers — none handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const tooLongFieldName = "toolongname";
    const res = await request(app)
      .post("/upload")
      .field(tooLongFieldName, "value");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Form field name is too long.",
    });
  });

  it("multer LIMIT_PART_COUNT still resolves to 400 when auth, rate-limit, and validation handlers all precede handleUploadError", async () => {
    const uploadInstance = createUpload(multer.memoryStorage(), {
      maxParts: 2,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    // Three preceding error handlers — none handles MulterError.
    app.use(authErrorHandler);
    app.use(rateLimitErrorHandler);
    app.use(validationErrorHandler);
    app.use(handleUploadError);

    const res = await request(app)
      .post("/upload")
      .field("alpha", "1")
      .field("beta", "2")
      .field("gamma", "3");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Too many parts in the multipart request (limit: 2).",
    });
  });

  it("multer error is not passed to downstream fallback when handleUploadError handles it", async () => {
    // Ensures handleUploadError does NOT call next() after responding to a
    // multer error (i.e. it terminates the error chain, not double-handles).
    const LIMIT_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fileSizeOverride: LIMIT_BYTES,
    });
    const { handler: fallback, captured } = makeFallbackHandler();

    const app = express();
    app.post(
      "/upload",
      uploadInstance.single("file"),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);
    // If handleUploadError incorrectly called next() the fallback would fire.
    app.use(fallback);

    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.alloc(LIMIT_BYTES + 1, "x"), "big.bin");

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Uploaded file in field 'file' is too large (limit: 10 B).",
    });
    // Fallback must not have been called — the error chain terminated in handleUploadError.
    expect(captured).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: real Express route returns 413 with field name in body
// ---------------------------------------------------------------------------

describe("LIMIT_FIELD_VALUE end-to-end via real Express route", () => {
  it("returns 413 with the field name in the JSON error body when a field value exceeds fieldSizeOverride", async () => {
    const FIELD_SIZE_BYTES = 10;
    const uploadInstance = createUpload(multer.memoryStorage(), {
      fieldSizeOverride: FIELD_SIZE_BYTES,
    });

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const oversizedValue = "x".repeat(FIELD_SIZE_BYTES + 1);
    const res = await request(app)
      .post("/upload")
      .field("description", oversizedValue);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Form field 'description' value is too large (limit: 10 B).",
    });
  });

  it("returns 413 with the field name in the JSON error body using the global UPLOAD_FIELD_SIZE baseline", async () => {
    const uploadInstance = createUpload(multer.memoryStorage());

    const app = express();
    app.post(
      "/upload",
      uploadInstance.none(),
      (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(handleUploadError);

    const oversizedValue = "x".repeat(1048576 + 1);
    const res = await request(app)
      .post("/upload")
      .field("biography", oversizedValue);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: "Form field 'biography' value is too large (limit: 1 MB).",
    });
  });
});

// ---------------------------------------------------------------------------
// createUpload — fileSizeOverride vs UPLOAD_BODY_LIMIT guard
// ---------------------------------------------------------------------------

describe("createUpload — fileSizeOverride vs UPLOAD_BODY_LIMIT check", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not warn when fileSizeOverride equals UPLOAD_BODY_LIMIT bytes", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");
    cu(multer.memoryStorage(), { fileSizeOverride: 10485760 });

    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("does not warn when fileSizeOverride is below UPLOAD_BODY_LIMIT bytes", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");
    cu(multer.memoryStorage(), { fileSizeOverride: 5 * 1024 * 1024 });

    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("does not warn when no fileSizeOverride is provided even though UPLOAD_MAX_FILE_SIZE is within limits", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");
    cu(multer.memoryStorage());

    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("logs a warning when fileSizeOverride exceeds UPLOAD_BODY_LIMIT bytes and strict mode is off", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");
    cu(multer.memoryStorage(), { fileSizeOverride: 10485760 + 1 });

    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        fileSizeOverride: 10485760 + 1,
        UPLOAD_BODY_LIMIT: "10mb",
        UPLOAD_BODY_LIMIT_bytes: 10485760,
      }),
      expect.stringContaining("fileSizeOverride"),
    );
  });

  it("does not throw when fileSizeOverride exceeds UPLOAD_BODY_LIMIT bytes and strict mode is off", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");

    expect(() =>
      cu(multer.memoryStorage(), { fileSizeOverride: 10485760 + 1 }),
    ).not.toThrow();
  });

  it("throws when fileSizeOverride exceeds UPLOAD_BODY_LIMIT bytes and UPLOAD_STRICT_CONFIG is true", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: true,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");

    expect(() =>
      cu(multer.memoryStorage(), { fileSizeOverride: 10485760 + 1 }),
    ).toThrow(/\[UPLOAD_STRICT_CONFIG\].*fileSizeOverride/);
  });

  it("does not throw when fileSizeOverride is within limit and UPLOAD_STRICT_CONFIG is true", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: true,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");

    expect(() =>
      cu(multer.memoryStorage(), { fileSizeOverride: 5 * 1024 * 1024 }),
    ).not.toThrow();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createUpload — fieldSizeOverride vs UPLOAD_BODY_LIMIT guard
// ---------------------------------------------------------------------------

describe("createUpload — fieldSizeOverride vs UPLOAD_BODY_LIMIT check", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not warn when fieldSizeOverride is within UPLOAD_BODY_LIMIT bytes", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");
    cu(multer.memoryStorage(), { fieldSizeOverride: 5 * 1024 * 1024 });

    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("does not warn when fieldSizeOverride equals UPLOAD_BODY_LIMIT bytes", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");
    cu(multer.memoryStorage(), { fieldSizeOverride: 10485760 });

    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("does not warn when no fieldSizeOverride is provided", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");
    cu(multer.memoryStorage());

    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("logs a warning when fieldSizeOverride exceeds UPLOAD_BODY_LIMIT bytes and strict mode is off", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");
    cu(multer.memoryStorage(), { fieldSizeOverride: 10485760 + 1 });

    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldSizeOverride: 10485760 + 1,
        UPLOAD_BODY_LIMIT: "10mb",
        UPLOAD_BODY_LIMIT_bytes: 10485760,
      }),
      expect.stringContaining("fieldSizeOverride"),
    );
  });

  it("does not throw when fieldSizeOverride exceeds UPLOAD_BODY_LIMIT bytes and strict mode is off", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: false,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");

    expect(() =>
      cu(multer.memoryStorage(), { fieldSizeOverride: 10485760 + 1 }),
    ).not.toThrow();
  });

  it("throws when fieldSizeOverride exceeds UPLOAD_BODY_LIMIT bytes and UPLOAD_STRICT_CONFIG is true", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: true,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");

    expect(() =>
      cu(multer.memoryStorage(), { fieldSizeOverride: 10485760 + 1 }),
    ).toThrow(/\[UPLOAD_STRICT_CONFIG\].*fieldSizeOverride/);
  });

  it("does not throw when fieldSizeOverride is within limit and UPLOAD_STRICT_CONFIG is true", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("./logger", () => ({ logger: loggerMock }));
    vi.doMock("../config", () => ({
      UPLOAD_BODY_LIMIT: "10mb",
      UPLOAD_STRICT_CONFIG: true,
      UPLOAD_MAX_FILE_SIZE: 10485760,
      UPLOAD_MAX_FILES: 10,
      UPLOAD_MAX_FIELDS: 20,
      UPLOAD_MAX_PARTS: 30,
      UPLOAD_FIELD_NAME_SIZE: 100,
      UPLOAD_FIELD_SIZE: 1048576,
    }));

    const { createUpload: cu } = await import("./upload");

    expect(() =>
      cu(multer.memoryStorage(), { fieldSizeOverride: 5 * 1024 * 1024 }),
    ).not.toThrow();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});
