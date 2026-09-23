/**
 * Per-account login lockout.
 *
 * Counts consecutive failed logins per email in Redis. After LOGIN_MAX_FAILS
 * failures within LOGIN_FAIL_WINDOW_MS, further attempts for that email are
 * rejected until the window's TTL elapses; a successful login clears the count.
 * This throttles online password guessing against a single account, and
 * complements the IP-scoped auth rate limiter (which throttles a single client).
 *
 * Degrades gracefully: with no Redis configured/reachable, every function is a
 * no-op and login behaves exactly as before (no lockout). Instant, shared
 * lockout across instances therefore REQUIRES Redis.
 *
 * Tradeoff: keying on the submitted email means an attacker who knows a victim's
 * email can trigger a temporary lockout (account-lockout DoS). We accept this
 * deliberately — the lock auto-expires within the window, the counter is scoped
 * per email (not global), and Redis outages fail open — so it cannot become a
 * durable denial of service.
 */
import { getRedis } from '../../cache/redis';
import { config } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

const keyFor = (email: string): string => `login_fails:${email}`;

/** Normalize an email so attempts group regardless of case/surrounding space. */
export function lockoutKey(email: string): string {
  return email.trim().toLowerCase();
}

function readyClient() {
  const client = getRedis();
  return client && client.status === 'ready' ? client : null;
}

/** Throw 429 when the account is currently locked out. No-op without Redis. */
export async function assertNotLockedOut(email: string): Promise<void> {
  const client = readyClient();
  if (!client) return; // fail open — no shared store to enforce a lockout
  try {
    const raw = await client.get(keyFor(email));
    if (raw !== null && Number(raw) >= config.LOGIN_MAX_FAILS) {
      throw AppError.tooManyRequests(
        'Too many failed login attempts for this account. Please try again later.',
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err; // propagate the lockout decision
    // Any Redis error → fail open so an outage can't block all logins.
    logger.warn('login lockout check failed', err instanceof Error ? err.message : err);
  }
}

/** Record one failed attempt, arming the window TTL on the first failure. */
export async function recordLoginFailure(email: string): Promise<void> {
  const client = readyClient();
  if (!client) return;
  try {
    const key = keyFor(email);
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, Math.ceil(config.LOGIN_FAIL_WINDOW_MS / 1000));
    }
  } catch (err) {
    logger.warn('login failure record failed', err instanceof Error ? err.message : err);
  }
}

/** Clear the failure counter after a successful login. No-op without Redis. */
export async function clearLoginFailures(email: string): Promise<void> {
  const client = readyClient();
  if (!client) return;
  try {
    await client.del(keyFor(email));
  } catch (err) {
    logger.warn('login failure clear failed', err instanceof Error ? err.message : err);
  }
}
