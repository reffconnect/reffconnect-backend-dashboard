/**
 * JWT signing/verification for access + refresh tokens.
 *
 * Access tokens are short-lived and carry identity/role claims used by the auth
 * guard. Refresh tokens carry a `jti` that maps to a row in `refresh_tokens`,
 * so logout and rotation can revoke them server-side.
 */
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import { AppError } from './AppError';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access';
  /** Issued-at (epoch seconds), used to honor server-side revocation. */
  iat: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

/** Parse durations like `15m`, `1h`, `30d`, `3600s`, or a raw number of seconds. */
export function parseDurationToSeconds(input: string | number): number {
  if (typeof input === 'number') return Math.floor(input);
  const match = /^(\d+)\s*(ms|s|m|h|d|w)?$/.exec(input.trim());
  if (!match) throw new Error(`Invalid duration string: "${input}"`);
  const value = Number(match[1] ?? '0');
  const unit = match[2] ?? 's';
  const factors: Record<string, number> = {
    ms: 1 / 1000,
    s: 1,
    m: 60,
    h: 3600,
    d: 86_400,
    w: 604_800,
  };
  return Math.floor(value * (factors[unit] ?? 1));
}

const accessTtlSeconds = parseDurationToSeconds(config.JWT_ACCESS_TTL);
const refreshTtlSeconds = parseDurationToSeconds(config.JWT_REFRESH_TTL);

export const tokenTtl = {
  accessSeconds: accessTtlSeconds,
  refreshSeconds: refreshTtlSeconds,
};

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type' | 'iat'>): {
  token: string;
  expiresIn: number;
} {
  const options: SignOptions = { expiresIn: accessTtlSeconds, algorithm: 'HS256' };
  const token = jwt.sign({ ...payload, type: 'access' }, config.JWT_ACCESS_SECRET, options);
  return { token, expiresIn: accessTtlSeconds };
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): {
  token: string;
  expiresIn: number;
} {
  const options: SignOptions = { expiresIn: refreshTtlSeconds, algorithm: 'HS256' };
  const token = jwt.sign({ ...payload, type: 'refresh' }, config.JWT_REFRESH_SECRET, options);
  return { token, expiresIn: refreshTtlSeconds };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload & Partial<AccessTokenPayload>;
    if (decoded.type !== 'access' || typeof decoded.sub !== 'string') {
      throw AppError.unauthorized('Invalid access token');
    }
    return {
      sub: decoded.sub,
      email: typeof decoded.email === 'string' ? decoded.email : '',
      role: typeof decoded.role === 'string' ? decoded.role : 'job_seeker',
      type: 'access',
      iat: typeof decoded.iat === 'number' ? decoded.iat : 0,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Access token is invalid or expired');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload & Partial<RefreshTokenPayload>;
    if (decoded.type !== 'refresh' || typeof decoded.sub !== 'string' || typeof decoded.jti !== 'string') {
      throw AppError.unauthorized('Invalid refresh token');
    }
    return { sub: decoded.sub, jti: decoded.jti, type: 'refresh' };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Refresh token is invalid or expired');
  }
}
