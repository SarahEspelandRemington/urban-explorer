import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";
import type { IncomingMessage } from "http";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { handleUploadError, createUpload } from "./upload";

vi.mock("../config", () => ({
  UPLOAD_BODY_LIMIT: "10mb",
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

  it("maps LIMIT_UNEXPECTED_FILE to 422", () => {
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
 */
function buildMultipartBody(filename: string, fileContent: Buffer): Buffer {
  const parts: Buffer[] = [
    Buffer.from(
      `--${BOUNDARY}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
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
      error: "Uploaded file is too large (limit: 10 B).",
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
      error: "Form field value is too large (limit: 10 B).",
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
      error: "Form field value is too large (limit: 1 MB).",
    });
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
});
