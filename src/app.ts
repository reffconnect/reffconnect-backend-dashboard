/**
 * Express application factory. Kept separate from the server bootstrap so the
 * app can be imported directly by tests without opening a port.
 */
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env';
import { apiRouter } from './routes';
import { globalRateLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { sendSuccess } from './utils/apiResponse';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Trust the first proxy hop so client IPs (for rate limiting) are accurate
  // behind a load balancer. Adjust the hop count to your deployment.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      // Never reflect arbitrary origins while credentials are enabled. With no
      // configured allow-list, cross-origin requests get no CORS headers
      // (same-origin still works); set CORS_ORIGINS to allow your frontends.
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '1mb',
      // Stash the raw bytes so webhook handlers can verify HMAC signatures over
      // the exact payload (re-serializing parsed JSON would break the signature).
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
  app.use(globalRateLimiter);

  // Simple liveness probe with no database dependency.
  app.get('/health', (_req, res) => {
    sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1', apiRouter);

  // Unmatched routes + centralized error handling (must be last).
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
