import { db } from "@workspace/db";
import { placePhotos } from "@workspace/db";
import { lt, sql } from "drizzle-orm";
import { logger } from "./logger";

const rawMaxAgeDays = Number(process.env["PHOTO_CACHE_MAX_AGE_DAYS"] ?? "7");
const PHOTO_CACHE_MAX_AGE_DAYS =
  Number.isFinite(rawMaxAgeDays) && rawMaxAgeDays > 0 ? rawMaxAgeDays : 7;

if (!Number.isFinite(rawMaxAgeDays) || rawMaxAgeDays <= 0) {
  logger.warn(
    { value: process.env["PHOTO_CACHE_MAX_AGE_DAYS"] },
    "PHOTO_CACHE_MAX_AGE_DAYS is invalid; defaulting to 7 days",
  );
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function runCleanup(): Promise<void> {
  const cutoff = new Date(
    Date.now() - PHOTO_CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  );

  try {
    const result = await db.execute(
      sql`DELETE FROM ${placePhotos} WHERE ${placePhotos.fetchedAt} < ${cutoff}`,
    );
    const count = result.rowCount ?? 0;

    if (count > 0) {
      logger.info(
        { count, cutoff },
        "Cleaned up old place_photos cache entries",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to clean up old place_photos cache entries");
  }
}

export function startPhotoCacheCleanup(): void {
  void runCleanup();
  const timer = setInterval(() => void runCleanup(), CLEANUP_INTERVAL_MS);
  timer.unref();
}
