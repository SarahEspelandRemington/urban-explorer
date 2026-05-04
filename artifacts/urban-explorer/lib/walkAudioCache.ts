/**
 * Utility for writing narration audio bytes to the device's cache directory.
 *
 * Isolated from WalkModeContext so it can be unit-tested without React or
 * native module dependencies.  If Paths.cache is undefined/invalid (e.g.
 * the file-system module is not fully initialised in a test environment or on
 * a device with unusual storage configuration), the write will throw and
 * callers should fall back to the text narration path.
 */
import { File, Paths } from "expo-file-system";

export interface CachedAudioFile {
  uri: string;
  cleanup: () => void;
}

/**
 * Write `buf` to a uniquely-named MP3 file in the OS cache directory.
 *
 * Returns the file URI and a cleanup function that deletes the file once
 * playback finishes (or is aborted via stop/skip).
 *
 * Returns `null` when the buffer is empty — callers should fall through to
 * the text narration endpoint in that case.
 *
 * Throws if the underlying file-system operation fails (bad Paths.cache,
 * out-of-disk, permission denied, …).  Callers are expected to catch and
 * fall back to the text path.
 */
export function writeNarrationAudioToCache(
  placeId: string,
  buf: ArrayBuffer,
): CachedAudioFile | null {
  if (buf.byteLength === 0) return null;

  const safePlaceId = placeId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `walk-narr-${safePlaceId}-${Date.now()}.mp3`;

  const file = new File(Paths.cache, fileName);
  file.write(new Uint8Array(buf));

  const cleanup = () => {
    try {
      file.delete();
    } catch {}
  };

  return { uri: file.uri, cleanup };
}
