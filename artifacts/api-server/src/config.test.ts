import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("config — UPLOAD_MAX_FILE_SIZE vs UPLOAD_BODY_LIMIT startup check", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("emits a logger.warn when UPLOAD_MAX_FILE_SIZE exceeds UPLOAD_BODY_LIMIT bytes", async () => {
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_MAX_FILE_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await import("./config");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        UPLOAD_MAX_FILE_SIZE: 1024 * 1024 + 1,
        UPLOAD_BODY_LIMIT: "1mb",
        UPLOAD_BODY_LIMIT_bytes: 1024 * 1024,
      }),
      expect.stringContaining("UPLOAD_MAX_FILE_SIZE"),
    );
  });

  it("does not emit a logger.warn when UPLOAD_MAX_FILE_SIZE equals UPLOAD_BODY_LIMIT bytes", async () => {
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_MAX_FILE_SIZE"] = String(1024 * 1024);

    const { logger } = await import("./lib/logger");
    await import("./config");

    const uploadWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args) =>
      String(args[1]).includes("UPLOAD_MAX_FILE_SIZE"),
    );
    expect(uploadWarnCalls).toHaveLength(0);
  });

  it("does not emit a logger.warn when UPLOAD_MAX_FILE_SIZE is below UPLOAD_BODY_LIMIT bytes", async () => {
    process.env["UPLOAD_BODY_LIMIT"] = "10mb";
    process.env["UPLOAD_MAX_FILE_SIZE"] = String(5 * 1024 * 1024);

    const { logger } = await import("./lib/logger");
    await import("./config");

    const uploadWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args) =>
      String(args[1]).includes("UPLOAD_MAX_FILE_SIZE"),
    );
    expect(uploadWarnCalls).toHaveLength(0);
  });
});
