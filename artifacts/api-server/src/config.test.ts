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

describe("config — UPLOAD_STRICT_CONFIG", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when UPLOAD_STRICT_CONFIG=true and UPLOAD_MAX_FILE_SIZE exceeds UPLOAD_BODY_LIMIT", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "true";
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_MAX_FILE_SIZE"] = String(1024 * 1024 + 1);

    await expect(import("./config")).rejects.toThrow(
      /\[UPLOAD_STRICT_CONFIG\].*UPLOAD_MAX_FILE_SIZE/,
    );
  });

  it("throws when UPLOAD_STRICT_CONFIG=TRUE (case-insensitive) and there is a mismatch", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "TRUE";
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_MAX_FILE_SIZE"] = String(1024 * 1024 + 1);

    await expect(import("./config")).rejects.toThrow(
      /\[UPLOAD_STRICT_CONFIG\]/,
    );
  });

  it("does not throw when UPLOAD_STRICT_CONFIG=true but limits are within bounds", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "true";
    process.env["UPLOAD_BODY_LIMIT"] = "10mb";
    process.env["UPLOAD_MAX_FILE_SIZE"] = String(5 * 1024 * 1024);

    await expect(import("./config")).resolves.toBeDefined();
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG=false and there is a mismatch", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "false";
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_MAX_FILE_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_MAX_FILE_SIZE: 1024 * 1024 + 1 }),
      expect.stringContaining("UPLOAD_MAX_FILE_SIZE"),
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG is absent and there is a mismatch", async () => {
    delete process.env["UPLOAD_STRICT_CONFIG"];
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_MAX_FILE_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_MAX_FILE_SIZE: 1024 * 1024 + 1 }),
      expect.stringContaining("UPLOAD_MAX_FILE_SIZE"),
    );
  });

  it("warns about invalid value and falls back to false (no throw on mismatch)", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "yes";
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_MAX_FILE_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    const strictWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args) =>
      String(args[1]).includes("UPLOAD_STRICT_CONFIG"),
    );
    expect(strictWarnCalls).toHaveLength(1);
  });
});

describe("config — UPLOAD_MAX_PARTS vs UPLOAD_MAX_FILES startup check", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("emits a logger.warn when UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FILES", async () => {
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_PARTS"] = "5";

    const { logger } = await import("./lib/logger");
    await import("./config");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        UPLOAD_MAX_PARTS: 5,
        UPLOAD_MAX_FILES: 10,
      }),
      expect.stringContaining("UPLOAD_MAX_PARTS"),
    );
  });

  it("does not emit a logger.warn when UPLOAD_MAX_PARTS equals UPLOAD_MAX_FILES", async () => {
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_PARTS"] = "10";

    const { logger } = await import("./lib/logger");
    await import("./config");

    const partsWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (args) =>
        String(args[1]).includes("UPLOAD_MAX_PARTS") &&
        String(args[1]).includes("UPLOAD_MAX_FILES") &&
        !(
          typeof args[0] === "object" &&
          args[0] !== null &&
          "combinedLimit" in args[0]
        ),
    );
    expect(partsWarnCalls).toHaveLength(0);
  });

  it("does not emit a logger.warn when UPLOAD_MAX_PARTS is greater than UPLOAD_MAX_FILES", async () => {
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_PARTS"] = "30";

    const { logger } = await import("./lib/logger");
    await import("./config");

    const partsWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (args) =>
        String(args[1]).includes("UPLOAD_MAX_PARTS") &&
        String(args[1]).includes("UPLOAD_MAX_FILES"),
    );
    expect(partsWarnCalls).toHaveLength(0);
  });

  it("throws when UPLOAD_STRICT_CONFIG=true and UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FILES", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "true";
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_PARTS"] = "5";

    await expect(import("./config")).rejects.toThrow(
      /\[UPLOAD_STRICT_CONFIG\].*UPLOAD_MAX_PARTS/,
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG=false and UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FILES", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "false";
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_PARTS"] = "5";

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_MAX_PARTS: 5, UPLOAD_MAX_FILES: 10 }),
      expect.stringContaining("UPLOAD_MAX_PARTS"),
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG is absent and UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FILES", async () => {
    delete process.env["UPLOAD_STRICT_CONFIG"];
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_PARTS"] = "5";

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_MAX_PARTS: 5, UPLOAD_MAX_FILES: 10 }),
      expect.stringContaining("UPLOAD_MAX_PARTS"),
    );
  });
});

describe("config — UPLOAD_MAX_PARTS vs UPLOAD_MAX_FIELDS startup check", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("emits a logger.warn when UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FIELDS", async () => {
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "5";

    const { logger } = await import("./lib/logger");
    await import("./config");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        UPLOAD_MAX_PARTS: 5,
        UPLOAD_MAX_FIELDS: 20,
      }),
      expect.stringContaining("UPLOAD_MAX_PARTS"),
    );
  });

  it("does not emit a logger.warn when UPLOAD_MAX_PARTS equals UPLOAD_MAX_FIELDS", async () => {
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "20";

    const { logger } = await import("./lib/logger");
    await import("./config");

    const partsFieldsWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (args) =>
        String(args[1]).includes("UPLOAD_MAX_PARTS") &&
        String(args[1]).includes("UPLOAD_MAX_FIELDS") &&
        !(
          typeof args[0] === "object" &&
          args[0] !== null &&
          "combinedLimit" in args[0]
        ),
    );
    expect(partsFieldsWarnCalls).toHaveLength(0);
  });

  it("does not emit a logger.warn when UPLOAD_MAX_PARTS is greater than UPLOAD_MAX_FIELDS", async () => {
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "30";

    const { logger } = await import("./lib/logger");
    await import("./config");

    const partsFieldsWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (args) =>
        String(args[1]).includes("UPLOAD_MAX_PARTS") &&
        String(args[1]).includes("UPLOAD_MAX_FIELDS"),
    );
    expect(partsFieldsWarnCalls).toHaveLength(0);
  });

  it("throws when UPLOAD_STRICT_CONFIG=true and UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FIELDS", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "true";
    // Set UPLOAD_MAX_FILES <= UPLOAD_MAX_PARTS so only the fields check triggers
    process.env["UPLOAD_MAX_FILES"] = "5";
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "5";

    await expect(import("./config")).rejects.toThrow(
      /\[UPLOAD_STRICT_CONFIG\].*UPLOAD_MAX_FIELDS/,
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG=false and UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FIELDS", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "false";
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "5";

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_MAX_PARTS: 5, UPLOAD_MAX_FIELDS: 20 }),
      expect.stringContaining("UPLOAD_MAX_PARTS"),
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG is absent and UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FIELDS", async () => {
    delete process.env["UPLOAD_STRICT_CONFIG"];
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "5";

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_MAX_PARTS: 5, UPLOAD_MAX_FIELDS: 20 }),
      expect.stringContaining("UPLOAD_MAX_PARTS"),
    );
  });
});

describe("config — UPLOAD_FIELD_NAME_SIZE vs UPLOAD_BODY_LIMIT startup check", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not emit a logger.warn when UPLOAD_FIELD_NAME_SIZE is within UPLOAD_BODY_LIMIT bytes", async () => {
    process.env["UPLOAD_BODY_LIMIT"] = "10mb";
    process.env["UPLOAD_FIELD_NAME_SIZE"] = "100";

    const { logger } = await import("./lib/logger");
    await import("./config");

    const fieldNameWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args) =>
      String(args[1]).includes("UPLOAD_FIELD_NAME_SIZE"),
    );
    expect(fieldNameWarnCalls).toHaveLength(0);
  });

  it("does not emit a logger.warn when UPLOAD_FIELD_NAME_SIZE equals UPLOAD_BODY_LIMIT bytes", async () => {
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_NAME_SIZE"] = String(1024 * 1024);

    const { logger } = await import("./lib/logger");
    await import("./config");

    const fieldNameWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args) =>
      String(args[1]).includes("UPLOAD_FIELD_NAME_SIZE"),
    );
    expect(fieldNameWarnCalls).toHaveLength(0);
  });

  it("emits a logger.warn when UPLOAD_FIELD_NAME_SIZE exceeds UPLOAD_BODY_LIMIT bytes", async () => {
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_NAME_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await import("./config");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        UPLOAD_FIELD_NAME_SIZE: 1024 * 1024 + 1,
        UPLOAD_BODY_LIMIT: "1mb",
        UPLOAD_BODY_LIMIT_bytes: 1024 * 1024,
      }),
      expect.stringContaining("UPLOAD_FIELD_NAME_SIZE"),
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG=false and UPLOAD_FIELD_NAME_SIZE exceeds UPLOAD_BODY_LIMIT", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "false";
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_NAME_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_FIELD_NAME_SIZE: 1024 * 1024 + 1 }),
      expect.stringContaining("UPLOAD_FIELD_NAME_SIZE"),
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG is absent and UPLOAD_FIELD_NAME_SIZE exceeds UPLOAD_BODY_LIMIT", async () => {
    delete process.env["UPLOAD_STRICT_CONFIG"];
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_NAME_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_FIELD_NAME_SIZE: 1024 * 1024 + 1 }),
      expect.stringContaining("UPLOAD_FIELD_NAME_SIZE"),
    );
  });

  it("throws when UPLOAD_STRICT_CONFIG=true and UPLOAD_FIELD_NAME_SIZE exceeds UPLOAD_BODY_LIMIT", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "true";
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_NAME_SIZE"] = String(1024 * 1024 + 1);

    await expect(import("./config")).rejects.toThrow(
      /\[UPLOAD_STRICT_CONFIG\].*UPLOAD_FIELD_NAME_SIZE/,
    );
  });

  it("does not throw when UPLOAD_STRICT_CONFIG=true and UPLOAD_FIELD_NAME_SIZE is within UPLOAD_BODY_LIMIT", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "true";
    process.env["UPLOAD_BODY_LIMIT"] = "10mb";
    process.env["UPLOAD_FIELD_NAME_SIZE"] = "100";

    await expect(import("./config")).resolves.toBeDefined();
  });
});

describe("config — UPLOAD_FIELD_SIZE vs UPLOAD_BODY_LIMIT startup check", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not emit a logger.warn when UPLOAD_FIELD_SIZE is within UPLOAD_BODY_LIMIT bytes", async () => {
    process.env["UPLOAD_BODY_LIMIT"] = "10mb";
    process.env["UPLOAD_FIELD_SIZE"] = String(1024 * 1024);

    const { logger } = await import("./lib/logger");
    await import("./config");

    const fieldSizeWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args) =>
      String(args[1]).includes("UPLOAD_FIELD_SIZE"),
    );
    expect(fieldSizeWarnCalls).toHaveLength(0);
  });

  it("does not emit a logger.warn when UPLOAD_FIELD_SIZE equals UPLOAD_BODY_LIMIT bytes", async () => {
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_SIZE"] = String(1024 * 1024);

    const { logger } = await import("./lib/logger");
    await import("./config");

    const fieldSizeWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args) =>
      String(args[1]).includes("UPLOAD_FIELD_SIZE"),
    );
    expect(fieldSizeWarnCalls).toHaveLength(0);
  });

  it("emits a logger.warn when UPLOAD_FIELD_SIZE exceeds UPLOAD_BODY_LIMIT bytes", async () => {
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await import("./config");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        UPLOAD_FIELD_SIZE: 1024 * 1024 + 1,
        UPLOAD_BODY_LIMIT: "1mb",
        UPLOAD_BODY_LIMIT_bytes: 1024 * 1024,
      }),
      expect.stringContaining("UPLOAD_FIELD_SIZE"),
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG=false and UPLOAD_FIELD_SIZE exceeds UPLOAD_BODY_LIMIT", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "false";
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_FIELD_SIZE: 1024 * 1024 + 1 }),
      expect.stringContaining("UPLOAD_FIELD_SIZE"),
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG is absent and UPLOAD_FIELD_SIZE exceeds UPLOAD_BODY_LIMIT", async () => {
    delete process.env["UPLOAD_STRICT_CONFIG"];
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_SIZE"] = String(1024 * 1024 + 1);

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ UPLOAD_FIELD_SIZE: 1024 * 1024 + 1 }),
      expect.stringContaining("UPLOAD_FIELD_SIZE"),
    );
  });

  it("throws when UPLOAD_STRICT_CONFIG=true and UPLOAD_FIELD_SIZE exceeds UPLOAD_BODY_LIMIT", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "true";
    process.env["UPLOAD_BODY_LIMIT"] = "1mb";
    process.env["UPLOAD_FIELD_SIZE"] = String(1024 * 1024 + 1);

    await expect(import("./config")).rejects.toThrow(
      /\[UPLOAD_STRICT_CONFIG\].*UPLOAD_FIELD_SIZE/,
    );
  });

  it("does not throw when UPLOAD_STRICT_CONFIG=true and UPLOAD_FIELD_SIZE is within UPLOAD_BODY_LIMIT", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "true";
    process.env["UPLOAD_BODY_LIMIT"] = "10mb";
    process.env["UPLOAD_FIELD_SIZE"] = String(1024 * 1024);

    await expect(import("./config")).resolves.toBeDefined();
  });
});

describe("config — UPLOAD_MAX_PARTS vs UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS combined startup check", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("emits a logger.warn when UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS", async () => {
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "25";

    const { logger } = await import("./lib/logger");
    await import("./config");

    const combinedWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (args) =>
        typeof args[0] === "object" &&
        args[0] !== null &&
        "combinedLimit" in args[0],
    );
    expect(combinedWarnCalls).toHaveLength(1);
    expect(combinedWarnCalls[0][0]).toEqual(
      expect.objectContaining({
        UPLOAD_MAX_PARTS: 25,
        UPLOAD_MAX_FILES: 10,
        UPLOAD_MAX_FIELDS: 20,
        combinedLimit: 30,
      }),
    );
    expect(String(combinedWarnCalls[0][1])).toMatch(/UPLOAD_MAX_PARTS/);
  });

  it("does not emit a logger.warn when UPLOAD_MAX_PARTS equals UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS", async () => {
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "30";

    const { logger } = await import("./lib/logger");
    await import("./config");

    const combinedWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (args) =>
        typeof args[0] === "object" &&
        args[0] !== null &&
        "combinedLimit" in args[0],
    );
    expect(combinedWarnCalls).toHaveLength(0);
  });

  it("does not emit a logger.warn when UPLOAD_MAX_PARTS is greater than UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS", async () => {
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "50";

    const { logger } = await import("./lib/logger");
    await import("./config");

    const combinedWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (args) =>
        typeof args[0] === "object" &&
        args[0] !== null &&
        "combinedLimit" in args[0],
    );
    expect(combinedWarnCalls).toHaveLength(0);
  });

  it("throws when UPLOAD_STRICT_CONFIG=true and UPLOAD_MAX_PARTS is less than UPLOAD_MAX_FILES + UPLOAD_MAX_FIELDS", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "true";
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "25";

    await expect(import("./config")).rejects.toThrow(
      /\[UPLOAD_STRICT_CONFIG\].*UPLOAD_MAX_PARTS/,
    );
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG=false and UPLOAD_MAX_PARTS is less than combined limit", async () => {
    process.env["UPLOAD_STRICT_CONFIG"] = "false";
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "25";

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    const combinedWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (args) =>
        typeof args[0] === "object" &&
        args[0] !== null &&
        "combinedLimit" in args[0],
    );
    expect(combinedWarnCalls).toHaveLength(1);
  });

  it("warns but does not throw when UPLOAD_STRICT_CONFIG is absent and UPLOAD_MAX_PARTS is less than combined limit", async () => {
    delete process.env["UPLOAD_STRICT_CONFIG"];
    process.env["UPLOAD_MAX_FILES"] = "10";
    process.env["UPLOAD_MAX_FIELDS"] = "20";
    process.env["UPLOAD_MAX_PARTS"] = "25";

    const { logger } = await import("./lib/logger");
    await expect(import("./config")).resolves.toBeDefined();

    const combinedWarnCalls = (
      logger.warn as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (args) =>
        typeof args[0] === "object" &&
        args[0] !== null &&
        "combinedLimit" in args[0],
    );
    expect(combinedWarnCalls).toHaveLength(1);
  });
});
