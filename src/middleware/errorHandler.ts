/**
 * Central error handler. Every thrown/rejected error funnels through here and
 * is rendered as the shared ApiResponse error envelope so clients get a
 * consistent shape regardless of where the failure originated.
 */
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { sendError } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Body validation failures (zod .parse in controllers).
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    sendError(res, 'Validation failed', 400, details);
    return;
  }

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error(`Non-operational error: ${err.message}`, err.stack);
    }
    sendError(res, err.message, err.statusCode, err.details);
    return;
  }

  // Multer upload errors (e.g. file too large) → 400.
  if (err instanceof Error && err.name === 'MulterError') {
    sendError(res, err.message || 'File upload error', 400);
    return;
  }

  // Map common Postgres error codes to friendly responses.
  const pgCode = (err as { code?: string } | null)?.code;
  if (pgCode === '23505') {
    sendError(res, 'That record already exists', 409);
    return;
  }
  if (pgCode === '23503') {
    sendError(res, 'A related record was not found', 400);
    return;
  }
  if (pgCode === '22P02') {
    sendError(res, 'Malformed input value', 400);
    return;
  }

  const rawMessage = err instanceof Error ? err.message : String(err);
  // Some errors (e.g. Node's AggregateError on a refused DB connection) carry an
  // empty message — fall back to the error name so the client sees something.
  const message = rawMessage.trim() || (err instanceof Error ? err.name : 'Unknown error');
  logger.error(`Unhandled error: ${message}`, err instanceof Error ? err.stack : err);
  sendError(res, config.isProduction ? 'Internal server error' : message, 500);
};
