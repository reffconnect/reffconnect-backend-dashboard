/**
 * Access-token revocation (logout-all).
 *
 * Access tokens are stateless JWTs, so to revoke them before expiry we store a
 * per-user "revoked before" timestamp in Redis. Any access token whose `iat`
 * predates that timestamp is rejected by the auth guard. The key's TTL equals
 * the access-token lifetime, after which every affected token has expired anyway.
 *
 * Degrades gracefully: if Redis is not configured/reachable, revocation is a
 * no-op (tokens remain valid until their short expiry). Instant revocation
 * therefore REQUIRES Redis; document this for high-assurance deployments.
 */
import { getRedis } from '../../cache/redis';
import { logger } from '../../utils/logger';

const keyFor = (userId: string): string => `revoked_at:${userId}`;

function readyClient() {
  const client = getRedis();
  return client && client.status === 'ready' ? client : null;
}

/** Revoke all access tokens issued to this user before now. */
export async function revokeUserAccessTokens(userId: string, ttlSeconds: number): Promise<void> {
  const client = readyClient();
  if (!client) return; // fail open — no shared store to record the revocation
  try {
    await client.set(keyFor(userId), String(Math.floor(Date.now() / 1000)), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn('token revocation set failed', err instanceof Error ? err.message : err);
  }
}

/** True when the token's issued-at predates a recorded revocation for the user. */
export async function isAccessTokenRevoked(userId: string, tokenIat: number): Promise<boolean> {
  const client = readyClient();
  if (!client) return false; // fail open
  try {
    const raw = await client.get(keyFor(userId));
    if (!raw) return false;
    // `<=` (not `<`): JWT `iat` is second-granular, so a token minted in the
    // same second as the logout must still be revoked. A re-login in that same
    // second self-heals on the next refresh.
    return tokenIat <= Number(raw);
  } catch (err) {
    logger.warn('token revocation check failed', err instanceof Error ? err.message : err);
    return false;
  }
}
