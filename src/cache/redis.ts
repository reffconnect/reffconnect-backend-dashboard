/**
 * Optional Redis client + cache-aside helpers.
 *
 * Redis is enabled only when REDIS_URL is set. Everything here is written to
 * DEGRADE GRACEFULLY: if Redis is disabled, unreachable, or a command fails,
 * cache reads miss (falling back to the database) and writes are skipped —
 * the API never fails a request because Redis is down. Rate limiting relies on
 * `getRedis()` for a shared store and separately fails open (see rateLimit.ts).
 */
import Redis, { type RedisOptions } from 'ioredis';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/** Readiness state reported for the cache dependency. */
type RedisStatus = 'up' | 'down' | 'disabled';

/** Stable cache-key registry. Centralized so invalidation cannot drift from reads. */
export const CacheKeys = {
  activeCategories: 'categories:active',
  jobStats: 'jobs:stats',
} as const;

let client: Redis | null = null;
// Throttle connection-error logs so a Redis outage cannot flood the logs.
let errorLogged = false;

if (config.REDIS_URL) {
  try {
    const options: RedisOptions = {
      // Keep the offline queue ENABLED (ioredis default). rate-limit-redis loads
      // a Lua script from the RedisStore constructor; with the offline queue off,
      // that command throws synchronously before the socket connects and crashes
      // boot. With it on, such commands queue and flush once connected. Cache
      // reads/writes are separately gated on `status === 'ready'` (see below) so
      // they degrade instantly instead of queueing during an outage.
      maxRetriesPerRequest: 2,
      connectTimeout: 10_000,
      // Bound how long any command waits before rejecting, so a Redis partition
      // can't hang request handling indefinitely (rate limiting fails open).
      commandTimeout: 1_000,
      // Keep retrying to reconnect (capped) so the cache self-heals when Redis returns.
      retryStrategy: (times: number) => Math.min(times * 200, 2_000),
    };
    client = new Redis(config.REDIS_URL, options);

    client.on('error', (err: unknown) => {
      if (!errorLogged) {
        logger.error(
          'Redis error — cache/rate-limit will degrade until it recovers',
          err instanceof Error ? err.message : err,
        );
        errorLogged = true;
      }
    });
    client.on('ready', () => {
      errorLogged = false;
      logger.info('Redis connected (cache + shared rate limiting enabled)');
    });
  } catch (err) {
    logger.error(
      'Failed to initialize Redis client; continuing without cache',
      err instanceof Error ? err.message : err,
    );
    client = null;
  }
} else {
  logger.warn(
    'REDIS_URL not set — caching disabled and rate limiting is in-memory (single instance only).',
  );
}

/** Whether a Redis client was constructed (i.e. REDIS_URL is set). */
export const redisEnabled = client !== null;

/** Raw client accessor for the rate-limit store. Null when Redis is disabled. */
export function getRedis(): Redis | null {
  return client;
}

/** Add up to 10% jitter to a TTL to avoid synchronized cache expiry stampedes. */
function withJitter(ttlSeconds: number): number {
  return ttlSeconds + Math.floor(Math.random() * Math.max(1, Math.floor(ttlSeconds * 0.1)));
}

/**
 * The client only when it's connected and ready for commands, else null.
 * Gating cache ops on this means they become instant no-ops during a Redis
 * outage (falling through to the DB) instead of queueing and waiting.
 */
function readyClient(): Redis | null {
  return client !== null && client.status === 'ready' ? client : null;
}

/** Read + parse a JSON value. Returns null on miss, unavailable cache, or any error. */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const c = readyClient();
  if (!c) return null;
  try {
    const raw = await c.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.warn(`cache get failed for ${key}`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Serialize + store a JSON value with a TTL. No-op when unavailable; never throws. */
export async function cacheSetJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const c = readyClient();
  if (!c) return;
  try {
    await c.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn(`cache set failed for ${key}`, err instanceof Error ? err.message : err);
  }
}

/** Delete one or more keys (invalidation). No-op when unavailable; never throws. */
export async function cacheDel(...keys: string[]): Promise<void> {
  const c = readyClient();
  if (!c || keys.length === 0) return;
  try {
    await c.del(...keys);
  } catch (err) {
    logger.warn(`cache del failed for ${keys.join(', ')}`, err instanceof Error ? err.message : err);
  }
}

// Coalesce concurrent misses on the same key within this instance so a hot key
// triggers a single loader call instead of a thundering herd against the DB.
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Cache-aside: return the cached value, or run `loader`, cache the result, and
 * return it. Falls straight through to `loader` when Redis is unavailable, so
 * correctness never depends on the cache being up.
 */
export async function cacheGetOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGetJson<T>(key);
  if (cached !== null) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const load = (async () => {
    const fresh = await loader();
    await cacheSetJson(key, fresh, withJitter(ttlSeconds));
    return fresh;
  })();

  inFlight.set(key, load);
  try {
    return (await load) as T;
  } finally {
    inFlight.delete(key);
  }
}

/** Readiness helper: 'disabled' when off, else 'up'/'down' based on a PING. */
export async function redisStatus(): Promise<RedisStatus> {
  if (!client) return 'disabled';
  const c = readyClient();
  if (!c) return 'down';
  try {
    return (await c.ping()) === 'PONG' ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/** Graceful shutdown: quit the client if present. */
export async function closeRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    // Best effort — force-disconnect if quit fails.
    client.disconnect();
  }
}
