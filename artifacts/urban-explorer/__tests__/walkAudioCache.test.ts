/**
 * Unit tests for lib/walkAudioCache.ts
 *
 * Verifies that writeNarrationAudioToCache:
 *  - Returns null for a zero-byte buffer (no filesystem call needed)
 *  - Returns a URI + cleanup function when File.write succeeds
 *  - Throws when the File constructor throws (bad Paths.cache)
 *  - Throws when file.write throws (disk full, permission denied)
 *  - Cleanup function swallows errors from file.delete()
 *  - Sanitises special characters in the place ID when building the filename
 */

jest.mock("expo-file-system", () => ({
  File: jest.fn(),
  Paths: { cache: "/mock/cache" },
}), { virtual: true });

const expoFs = require("expo-file-system") as {
  File: jest.Mock;
  Paths: { cache: string };
};

describe("writeNarrationAudioToCache", () => {
  beforeEach(() => {
    expoFs.File.mockClear();
  });

  function getWriteFn() {
    const { writeNarrationAudioToCache } = require("../lib/walkAudioCache");
    return writeNarrationAudioToCache as (placeId: string, buf: ArrayBuffer) => { uri: string; cleanup: () => void } | null;
  }

  test("returns null for a zero-byte buffer without touching the filesystem", () => {
    const result = getWriteFn()("place-1", new ArrayBuffer(0));
    expect(result).toBeNull();
    expect(expoFs.File).not.toHaveBeenCalled();
  });

  test("returns uri and cleanup when File constructor and write succeed", () => {
    const mockDelete = jest.fn();
    const mockWrite = jest.fn();
    const mockFile = { uri: "file:///mock/cache/walk-narr-place-1.mp3", write: mockWrite, delete: mockDelete };
    expoFs.File.mockImplementation(() => mockFile);

    const result = getWriteFn()("place-1", new ArrayBuffer(8));

    expect(result).not.toBeNull();
    expect(result!.uri).toBe(mockFile.uri);
    expect(mockWrite).toHaveBeenCalledWith(expect.any(Uint8Array));

    result!.cleanup();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  test("throws when File constructor throws (bad Paths.cache)", () => {
    expoFs.File.mockImplementation(() => {
      throw new TypeError("Paths.cache is not a valid path");
    });

    expect(() => getWriteFn()("place-1", new ArrayBuffer(16))).toThrow(TypeError);
  });

  test("throws when file.write throws (disk full or permission denied)", () => {
    const mockFile = {
      uri: "file:///mock/cache/walk-narr-place-1.mp3",
      write: jest.fn(() => { throw new Error("disk full"); }),
      delete: jest.fn(),
    };
    expoFs.File.mockImplementation(() => mockFile);

    expect(() => getWriteFn()("place-1", new ArrayBuffer(16))).toThrow("disk full");
  });

  test("cleanup swallows errors from file.delete() without throwing", () => {
    const mockFile = {
      uri: "file:///mock/cache/walk-narr-place-2.mp3",
      write: jest.fn(),
      delete: jest.fn(() => { throw new Error("file already deleted"); }),
    };
    expoFs.File.mockImplementation(() => mockFile);

    const result = getWriteFn()("place-2", new ArrayBuffer(8));
    expect(result).not.toBeNull();
    expect(() => result!.cleanup()).not.toThrow();
  });

  test("sanitises special characters in the place ID when building the filename", () => {
    const constructorArgs: unknown[][] = [];
    const mockFile = { uri: "file:///mock/cache/file.mp3", write: jest.fn(), delete: jest.fn() };
    expoFs.File.mockImplementation((...args: unknown[]) => {
      constructorArgs.push(args);
      return mockFile;
    });

    getWriteFn()("place/with:special?chars", new ArrayBuffer(8));

    const fileName = constructorArgs[0]?.[1] as string;
    expect(fileName).toMatch(/^walk-narr-place_with_special_chars-\d+\.mp3$/);
  });
});
