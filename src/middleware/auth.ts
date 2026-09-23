/**
 * Auth middleware.
 *
 *  - `authenticate`  : require a valid access token; 401 otherwise.
 *  - `optionalAuth`  : attach identity if a valid token is present, else anonymous.
 *  - `requireRole`   : gate a route to one or more roles (use after `authenticate`).
 */
import type { Request, RequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { verifyAccessToken } from '../utils/jwt';
import { isAccessTokenRevoked } from '../modules/auth/tokenRevocation';
import type { UserRole } from '../types';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

// Synchronous wrapper around async work so thrown/rejected errors reach the
// central error handler via next(err) (Express 4 doesn't catch async throws).
export const authenticate: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      const token = extractBearerToken(req);
      if (!token) throw AppError.unauthorized('Missing or malformed Authorization header');
      const payload = verifyAccessToken(token);
      if (await isAccessTokenRevoked(payload.sub, payload.iat)) {
        throw AppError.unauthorized('Your session has been revoked; please sign in again');
      }
      req.user = { id: payload.sub, email: payload.email, role: payload.role as UserRole };
      next();
    } catch (err) {
      next(err);
    }
  })();
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    const token = extractBearerToken(req);
    if (token) {
      try {
        const payload = verifyAccessToken(token);
        if (!(await isAccessTokenRevoked(payload.sub, payload.iat))) {
          req.user = { id: payload.sub, email: payload.email, role: payload.role as UserRole };
        }
      } catch {
        // Invalid/revoked token on an optional route → treat as anonymous.
      }
    }
    next();
  })();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized();
    if (!roles.includes(req.user.role)) {
      throw AppError.forbidden(`This action requires role: ${roles.join(' or ')}`);
    }
    next();
  };
}
