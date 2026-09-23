/**
 * Operational error with an HTTP status code. Throw these from services/controllers;
 * the central error handler turns them into the shared ApiResponse error envelope.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string | undefined;
  public readonly details: unknown;

  constructor(
    statusCode: number,
    message: string,
    options: { code?: string; details?: unknown; isOperational?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = options.isOperational ?? true;
    this.code = options.code;
    this.details = options.details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message = 'Bad request', details?: unknown): AppError {
    return new AppError(400, message, { code: 'bad_request', details });
  }

  static unauthorized(message = 'Not authenticated'): AppError {
    return new AppError(401, message, { code: 'unauthorized' });
  }

  static forbidden(message = 'You do not have access to this resource'): AppError {
    return new AppError(403, message, { code: 'forbidden' });
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, message, { code: 'not_found' });
  }

  static conflict(message = 'Resource already exists'): AppError {
    return new AppError(409, message, { code: 'conflict' });
  }

  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError(429, message, { code: 'rate_limited' });
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(500, message, { code: 'internal_error', isOperational: false });
  }
}
