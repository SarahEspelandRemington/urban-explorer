import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ pool: {}, db: {} }));
vi.mock("@workspace/integrations-openai-ai-server", () => ({ openai: {} }));
vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  textToSpeech: vi.fn(),
}));

import {
  OVERPASS_PROVIDERS,
  OVERPASS_USER_AGENT,
  fetchFromOverpassProviders,
  getOverpassBudgetAllocation,
} from "../routes/explore/index";

const COOLDOWN_MS = 10 * 60 * 1000;

function mockResponse(
  status: number,
  ok: boolean,
  headers?: Record<string, string>,
): Response {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? null,
    },
  } as unknown as Response;
}

describe("OVERPASS_PROVIDERS / OVERPASS_USER_AGENT", () => {
  it("no longer includes the blocked openstreetmap.fr mirror", () => {
    expect(
      OVERPASS_PROVIDERS.some((url) => url.includes("openstreetmap.fr")),
    ).toBe(false);
  });

  it("uses the identifying Streetlit User-Agent", () => {
    expect(OVERPASS_USER_AGENT).toBe(
      "Streetlit/1.0 (+mailto:streetlit-contact.conflict277@simplelogin.com)",
    );
  });
});

describe("getOverpassBudgetAllocation", () => {
  it("full mode: 11s total budget, 7s primary slice", () => {
    expect(getOverpassBudgetAllocation(false)).toEqual({
      totalBudgetMs: 11000,
      primarySliceMs: 7000,
    });
  });

  it("quick mode: 5s total budget, proportionally scaled primary slice", () => {
    expect(getOverpassBudgetAllocation(true)).toEqual({
      totalBudgetMs: 5000,
      primarySliceMs: 3182,
    });
  });
});

describe("fetchFromOverpassProviders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("primary success returns its result without calling a fallback provider", async () => {
    const urlA = "https://mirror-a.test/api/interpreter";
    const urlB = "https://mirror-b.test/api/interpreter";
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, true));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFromOverpassProviders(
      [urlA, urlB],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(urlA, expect.anything());
    expect(result?.provider).toBe(urlA);
  });

  it("a sole provider gets the full 11,000ms budget as its abort-timer slice (full mode)", async () => {
    const url = "https://mirror-sole-full.test/api/interpreter";
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, true));
    vi.stubGlobal("fetch", fetchMock);
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 11000);
    setTimeoutSpy.mockRestore();
  });

  it("a sole provider gets the full 5,000ms budget as its abort-timer slice (quick mode)", async () => {
    const url = "https://mirror-sole-quick.test/api/interpreter";
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, true));
    vi.stubGlobal("fetch", fetchMock);
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      5000,
      3182,
    );

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    setTimeoutSpy.mockRestore();
  });

  it("with two providers, the primary is capped at the shorter primary slice before falling back", async () => {
    const urlA = "https://mirror-two-a.test/api/interpreter";
    const urlB = "https://mirror-two-b.test/api/interpreter";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(500, false))
      .mockResolvedValueOnce(mockResponse(200, true));
    vi.stubGlobal("fetch", fetchMock);
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    await fetchFromOverpassProviders(
      [urlA, urlB],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );

    expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(7000);
    setTimeoutSpy.mockRestore();
  });

  it("calls the fallback provider only after the primary fails", async () => {
    const urlA = "https://mirror-a2.test/api/interpreter";
    const urlB = "https://mirror-b2.test/api/interpreter";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(500, false))
      .mockResolvedValueOnce(mockResponse(200, true));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFromOverpassProviders(
      [urlA, urlB],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, urlA, expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, urlB, expect.anything());
    expect(result?.provider).toBe(urlB);
  });

  it("HTTP 403 starts a cooldown that skips the provider on the next call", async () => {
    const url = "https://mirror-403.test/api/interpreter";
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(403, false));
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(first).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(second).toBeNull();
    // Still cooling down — no second network attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("HTTP 429 also starts a cooldown", async () => {
    const url = "https://mirror-429.test/api/interpreter";
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(429, false));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("HTTP 500 does NOT start a cooldown — the provider is retried next call", async () => {
    const url = "https://mirror-500.test/api/interpreter";
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(500, false));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    // Not cooling down — a second real attempt is made.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a timeout/abort (fetch rejection) does NOT start a cooldown", async () => {
    const url = "https://mirror-timeout.test/api/interpreter";
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cooldown expires after 10 minutes, after which the provider is retried", async () => {
    vi.useFakeTimers();
    const url = "https://mirror-expiry.test/api/interpreter";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(403, false))
      .mockResolvedValueOnce(mockResponse(200, true));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still within the 10-minute cooldown — skipped.
    const stillCooling = await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(stillCooling).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(COOLDOWN_MS + 1);

    const afterExpiry = await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(afterExpiry?.provider).toBe(url);
  });

  it("HTTP 429 with a Retry-After header uses that duration (seconds) as the cooldown", async () => {
    vi.useFakeTimers();
    const url = "https://mirror-429-retry-after.test/api/interpreter";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(429, false, { "retry-after": "5" }))
      .mockResolvedValueOnce(mockResponse(200, true));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still within the 5s Retry-After window — skipped.
    const stillCooling = await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(stillCooling).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000 + 1);

    const afterExpiry = await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(afterExpiry?.provider).toBe(url);
  });

  it("HTTP 429 without a Retry-After header defaults to a 60-second cooldown (not the 403's 10 minutes)", async () => {
    vi.useFakeTimers();
    const url = "https://mirror-429-default.test/api/interpreter";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(429, false))
      .mockResolvedValueOnce(mockResponse(200, true));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still cooling down just before the 60s default expires.
    const stillCooling = await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(stillCooling).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 1000 + 1);

    const afterExpiry = await fetchFromOverpassProviders(
      [url],
      { method: "POST", headers: {}, body: "" },
      11000,
      7000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(afterExpiry?.provider).toBe(url);
  });
});
