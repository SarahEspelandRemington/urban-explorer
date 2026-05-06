import { describe, it, expect, vi, beforeEach } from "vitest";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { handleUploadError } from "./upload";

vi.mock("../config", () => ({
  UPLOAD_BODY_LIMIT: "10mb",
  UPLOAD_MAX_FILES: 10,
  UPLOAD_MAX_FIELDS: 20,
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

function makeReq() {
  return {} as Request;
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

  it("maps LIMIT_FILE_SIZE to 413", () => {
    handleUploadError(multerError("LIMIT_FILE_SIZE"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Uploaded file is too large.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FILE_COUNT to 422", () => {
    handleUploadError(multerError("LIMIT_FILE_COUNT"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many files uploaded.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps LIMIT_FIELD_COUNT to 422", () => {
    handleUploadError(multerError("LIMIT_FIELD_COUNT"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many form fields in the request.",
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

  it("maps LIMIT_FIELD_VALUE to 413", () => {
    handleUploadError(multerError("LIMIT_FIELD_VALUE"), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Form field value is too large.",
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
