/**
 * Server entrypoint: boots the HTTP server, verifies the DB connection, and
 * wires graceful shutdown.
 */
import type { Server } from 'node:http';
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { checkConnection, shutdownPool } from './db/pool';
import { closeRedis } from './cache/redis';
import { startJobViewFlusher } from './modules/jobs/jobViews';

async function bootstrap(): Promise<void> {
  const app = createApp();

  const dbOk = await checkConnection();
  if (dbOk) {
    logger.info('Database connection OK');
  } else {
    logger.warn(
      'Database not reachable at startup. The API will still boot, but data routes will ' +
        'fail until DATABASE_URL points at a running Postgres. Run `npm run db:migrate` to create the schema.',
    );
  }

  const server: Server = app.listen(config.PORT, () => {
    logger.info(`ConnectX backend listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
    logger.info('API base path: /api/v1');
    logger.info(
      `DB pool max=${config.DB_POOL_MAX}` +
        `${config.hasReadReplica ? ' + read replica' : ''}` +
        `${config.redisEnabled ? ' · Redis cache/rate-limit on' : ' · Redis off (in-memory rate limit)'}`,
    );
  });

  // Flush buffered job-view counts to Postgres periodically (and on shutdown).
  const stopViewFlusher = startJobViewFlusher();

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      // Final flush of buffered view counts first (it needs the DB pool)...
      await stopViewFlusher().catch(() => undefined);
      // ...then drain the DB pools and the Redis client. Never block on either.
      await Promise.allSettled([shutdownPool(), closeRedis()]);
      logger.info('Shutdown complete');
      process.exit(0);
    });
    // Force-exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason instanceof Error ? reason.message : reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

void bootstrap();
