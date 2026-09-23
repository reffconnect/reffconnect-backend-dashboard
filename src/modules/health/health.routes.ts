import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { checkConnection } from '../../db/pool';
import { redisStatus } from '../../cache/redis';

export const healthRouter = Router();

/**
 * Detailed health: database + cache status and uptime. Returns 503 when the
 * database (a hard dependency) is unreachable.
 */
healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [dbOk, cache] = await Promise.all([checkConnection(), redisStatus()]);
    sendSuccess(
      res,
      {
        status: dbOk ? 'ok' : 'degraded',
        database: dbOk ? 'up' : 'down',
        cache, // 'up' | 'down' | 'disabled'
        uptime_seconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      dbOk ? 200 : 503,
    );
  }),
);

/**
 * Readiness probe for load-balancer / orchestrator gating. Ready when the
 * primary database is reachable. Redis is intentionally NOT required: the API
 * degrades gracefully without it (cache misses fall through to Postgres, rate
 * limiting fails open), so a Redis blip must not pull an instance out of
 * rotation.
 */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const dbOk = await checkConnection();
    sendSuccess(res, { ready: dbOk, database: dbOk ? 'up' : 'down' }, dbOk ? 200 : 503);
  }),
);

/** Liveness probe: the process is up. No dependency checks. */
healthRouter.get('/live', (_req, res) => {
  sendSuccess(res, { alive: true, uptime_seconds: Math.round(process.uptime()) });
});
