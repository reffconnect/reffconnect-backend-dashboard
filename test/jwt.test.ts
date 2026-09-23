import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  parseDurationToSeconds,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/utils/jwt';

describe('parseDurationToSeconds', () => {
  it('parses common units', () => {
    expect(parseDurationToSeconds('1h')).toBe(3600);
    expect(parseDurationToSeconds('30d')).toBe(2_592_000);
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('45s')).toBe(45);
    expect(parseDurationToSeconds('500ms')).toBe(0);
    expect(parseDurationToSeconds(120)).toBe(120);
  });
  it('rejects malformed input', () => {
    expect(() => parseDurationToSeconds('soon')).toThrow();
  });
});

describe('access token', () => {
  it('signs and verifies a roundtrip with identity + iat', () => {
    const { token, expiresIn } = signAccessToken({ sub: 'u1', email: 'a@b.com', role: 'referrer' });
    expect(expiresIn).toBeGreaterThan(0);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('u1');
    expect(decoded.email).toBe('a@b.com');
    expect(decoded.role).toBe('referrer');
    expect(decoded.type).toBe('access');
    expect(decoded.iat).toBeGreaterThan(0);
  });

  it('rejects a refresh token presented as an access token', () => {
    const { token } = signRefreshToken({ sub: 'u1', jti: 'j1' });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ sub: 'u1', type: 'access' }, 'a-different-secret-value-1234567', {
      algorithm: 'HS256',
    });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('rejects a tampered token', () => {
    const { token } = signAccessToken({ sub: 'u1', email: 'a@b.com', role: 'job_seeker' });
    expect(() => verifyAccessToken(`${token.slice(0, -2)}xx`)).toThrow();
  });
});

describe('refresh token', () => {
  it('signs and verifies a roundtrip with jti', () => {
    const { token } = signRefreshToken({ sub: 'u2', jti: 'jti-2' });
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe('u2');
    expect(decoded.jti).toBe('jti-2');
    expect(decoded.type).toBe('refresh');
  });

  it('rejects an access token presented as a refresh token', () => {
    const { token } = signAccessToken({ sub: 'u2', email: 'x@y.com', role: 'job_seeker' });
    expect(() => verifyRefreshToken(token)).toThrow();
  });
});
