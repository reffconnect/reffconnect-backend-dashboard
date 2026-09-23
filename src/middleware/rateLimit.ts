/**
 * Rate limiters. A broad global limiter protects the whole API; a stricter one
 * guards the auth endpoints against credential-stuffing / brute force.
 *
 * When REDIS_URL is set, counters live in Redis so limits are shared across all
 * instances and survive deploys. Without Redis, they fall back to an in-memory
 * store — correct for a single instance only. Either way the limiters FAIL OPEN
 * (`passOnStoreError`): a store blip allows the request through rather than
 * returning 500, since this is a best-effort guard, not a correctness control.
 */
import rateLimit, { type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { config } from '../config/env';
import { sendError } from '../utils/apiResponse';
import { getRedis } from '../cache/redis';

/** Build a Redis-backed store, or undefined to use the default in-memory store. */
function sharedStore(prefix: string): Store | undefined {
  const client = getRedis();
  if (!client) return undefined;
  const store = new RedisStore({
    prefix,
    sendCommand: (...args: string[]): Promise<RedisReply> =>
      client.call(args[0]!, ...args.slice(1)) as Promise<RedisReply>,
  });
  // rate-limit-redis eagerly loads Lua scripts in its constructor. If Redis is
  // unreachable at boot, those promises reject; attach no-op catches so the
  // failure surfaces as our throttled Redis error (in cache/redis.ts) instead
  // of an unhandled rejection. The limiter still fails open (passOnStoreError)
  // and rate-limit-redis reloads the scripts once Redis is reachable again.
  void store.incrementScriptSha?.catch(() => undefined);
  void store.getScriptSha?.catch(() => undefined);
  return store;
}

export const globalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  limit: config.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  passOnStoreError: true,
  store: sharedStore('rl:global:'),
  // The payment webhook is authenticated by HMAC signature and is idempotent;
  // never throttle it, or gateway retries could be dropped.
  skip: (req) => req.path.endsWith('/payments/webhook'),
  handler: (_req, res) => sendError(res, 'Too many requests, please slow down.', 429),
});

export const authRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  limit: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  passOnStoreError: true,
  store: sharedStore('rl:auth:'),
  handler: (_req, res) =>
    sendError(res, 'Too many authentication attempts, please try again in a minute.', 429),
});
