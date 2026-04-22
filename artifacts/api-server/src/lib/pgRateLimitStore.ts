import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import { MemoryStore } from "express-rate-limit";
import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * A persistent rate-limit store backed by PostgreSQL.
 *
 * Uses the `rate_limit_store` table (key, hits, reset_time).
 *
 * Failure behaviour (fail-closed, not fail-open):
 *   When a DB error occurs, requests are delegated to an internal MemoryStore so
 *   rate-limiting continues to be enforced in-process. This means limits remain
 *   active even when Postgres is temporarily unavailable — they are just not
 *   shared across multiple server instances for the duration of the outage.
 *   DB failures are logged as warnings so they are observable.
 *
 * On startup, `init()` creates the table if it does not already exist so there
 * is no manual migration step required for the store to become operational.
 */
export class PgRateLimitStore implements Store {
  private windowMs!: number;
  private fallback!: MemoryStore;

  init(options: Options): void {
    this.windowMs = options.windowMs;

    this.fallback = new MemoryStore();
    this.fallback.init(options);

    this.ensureTable().catch((err: unknown) => {
      logger.warn({ err }, "pgRateLimitStore: could not ensure rate_limit_store table exists");
    });
  }

  private async ensureTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_store (
        key        TEXT PRIMARY KEY,
        hits       INTEGER NOT NULL DEFAULT 1,
        reset_time TIMESTAMPTZ NOT NULL
      )
    `);
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const resetTime = new Date(Date.now() + this.windowMs);
    try {
      const result = await pool.query<{ hits: number; reset_time: string }>(
        `INSERT INTO rate_limit_store (key, hits, reset_time)
         VALUES ($1, 1, $2)
         ON CONFLICT (key) DO UPDATE SET
           hits = CASE
             WHEN rate_limit_store.reset_time > NOW()
             THEN rate_limit_store.hits + 1
             ELSE 1
           END,
           reset_time = CASE
             WHEN rate_limit_store.reset_time > NOW()
             THEN rate_limit_store.reset_time
             ELSE $2
           END
         RETURNING hits, reset_time`,
        [key, resetTime.toISOString()],
      );
      const row = result.rows[0];
      return {
        totalHits: row.hits,
        resetTime: new Date(row.reset_time),
      };
    } catch (err) {
      logger.warn({ err, key }, "pgRateLimitStore: DB error in increment — falling back to in-memory store");
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE rate_limit_store
         SET hits = GREATEST(0, hits - 1)
         WHERE key = $1`,
        [key],
      );
    } catch (err) {
      logger.warn({ err, key }, "pgRateLimitStore: DB error in decrement — falling back to in-memory store");
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await pool.query(`DELETE FROM rate_limit_store WHERE key = $1`, [key]);
    } catch (err) {
      logger.warn({ err, key }, "pgRateLimitStore: DB error in resetKey — falling back to in-memory store");
      await this.fallback.resetKey(key);
    }
  }

  async resetAll(): Promise<void> {
    try {
      await pool.query(`TRUNCATE rate_limit_store`);
    } catch (err) {
      logger.warn({ err }, "pgRateLimitStore: DB error in resetAll — falling back to in-memory store");
      await this.fallback.resetAll();
    }
  }
}
