/**
 * Auth orchestration: password hashing, token issuance, and refresh-token
 * rotation. Response shapes (LoginResponse / AuthTokens) mirror api.ts so the
 * frontend can switch its auth service to this backend with minimal changes.
 */
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { config } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { signAccessToken, signRefreshToken, tokenTtl, verifyRefreshToken } from '../../utils/jwt';
import { revokeUserAccessTokens } from './tokenRevocation';
import {
  assertNotLockedOut,
  clearLoginFailures,
  lockoutKey,
  recordLoginFailure,
} from './loginLockout';
import * as repo from './auth.repository';
import type { LoginInput, RegisterInput } from './auth.schema';
import type { UserRole } from '../../types';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
}

export interface AuthUserSummary {
  full_name: string;
  designation?: string;
  message: string;
}

export interface LoginResponse {
  user: AuthUserSummary;
  tokens: AuthTokens;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function issueTokens(
  identity: { id: string; email: string; role: UserRole },
  userAgent?: string,
): Promise<AuthTokens> {
  const { token: accessToken, expiresIn } = signAccessToken({
    sub: identity.id,
    email: identity.email,
    role: identity.role,
  });

  const jti = randomUUID();
  const { token: refreshToken } = signRefreshToken({ sub: identity.id, jti });
  const expiresAt = new Date(Date.now() + tokenTtl.refreshSeconds * 1000);
  await repo.insertRefreshToken({
    jti,
    userId: identity.id,
    tokenHash: sha256(refreshToken),
    expiresAt,
    userAgent,
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: expiresIn,
  };
}

export async function register(input: RegisterInput, userAgent?: string): Promise<LoginResponse> {
  const existing = await repo.findUserByEmail(input.primary_email);
  if (existing) throw AppError.conflict('An account with this email already exists.');

  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
  const profile = await repo.createUserWithProfile({
    email: input.primary_email,
    passwordHash,
    fullName: input.full_name,
    role: input.role,
    officeEmail: input.office_email,
    mobileNumber: input.mobile_number,
    designation: input.designation,
    companyName: input.company_name,
    location: input.location,
  });

  const tokens = await issueTokens(
    { id: profile.id, email: profile.primary_email, role: profile.role },
    userAgent,
  );

  return {
    user: {
      full_name: profile.full_name,
      designation: profile.designation ?? undefined,
      message: 'Registration successful',
    },
    tokens,
  };
}

export async function login(input: LoginInput, userAgent?: string): Promise<LoginResponse> {
  // One generic error for "no such user" and "wrong password" avoids leaking
  // which emails are registered.
  const invalidCredentials = AppError.unauthorized('Invalid email or password');
  const accountKey = lockoutKey(input.email);

  // Reject before touching the DB / hashing if the account is locked out.
  await assertNotLockedOut(accountKey);

  const user = await repo.findUserByEmail(input.email);
  if (!user || !user.password_hash) {
    // Count misses on unknown emails too, so probing can't dodge the lockout.
    await recordLoginFailure(accountKey);
    throw invalidCredentials;
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
  if (!passwordMatches) {
    await recordLoginFailure(accountKey);
    throw invalidCredentials;
  }

  // Successful auth → reset the failure counter for this account.
  await clearLoginFailures(accountKey);

  const profile = await repo.getProfileSummary(user.id);
  const role: UserRole = profile?.role ?? 'job_seeker';
  await repo.updateLastLogin(user.id);

  const tokens = await issueTokens({ id: user.id, email: user.email, role }, userAgent);

  return {
    user: {
      full_name: profile?.full_name ?? 'User',
      designation: profile?.designation ?? undefined,
      message: 'Login successful',
    },
    tokens,
  };
}

export async function refresh(refreshToken: string, userAgent?: string): Promise<AuthTokens> {
  const payload = verifyRefreshToken(refreshToken);
  const row = await repo.getRefreshTokenById(payload.jti);

  if (!row || row.revoked_at) throw AppError.unauthorized('Refresh token has been revoked');
  if (new Date(row.expires_at).getTime() < Date.now()) throw AppError.unauthorized('Refresh token expired');
  if (row.token_hash !== sha256(refreshToken) || row.user_id !== payload.sub) {
    throw AppError.unauthorized('Refresh token is invalid');
  }

  // Rotate: the presented token can never be reused.
  await repo.revokeRefreshToken(payload.jti);

  const user = await repo.findUserById(payload.sub);
  if (!user) throw AppError.unauthorized('Account no longer exists');

  const profile = await repo.getProfileSummary(user.id);
  const role: UserRole = profile?.role ?? 'job_seeker';
  return issueTokens({ id: user.id, email: user.email, role }, userAgent);
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await repo.revokeRefreshToken(payload.jti);
    // Also invalidate any access tokens already handed out (issued before now),
    // so logout takes effect immediately rather than waiting out the access TTL.
    await revokeUserAccessTokens(payload.sub, tokenTtl.accessSeconds);
  } catch {
    // Best-effort: an already-invalid token is effectively logged out.
  }
}

/** Find-or-create a user from a verified OAuth identity and issue our own tokens. */
export async function loginWithOAuth(
  identity: { email: string; name: string; emailVerified: boolean },
  provider: 'google' | 'linkedin',
  userAgent?: string,
): Promise<LoginResponse> {
  // Only trust a provider identity whose email the provider itself verified —
  // otherwise an unverified email could link to / take over an existing account.
  if (!identity.emailVerified) {
    throw AppError.unauthorized('Your provider account email is not verified');
  }

  let user = await repo.findUserByEmail(identity.email);
  let createdProfile: repo.ProfileSummary | null = null;
  if (!user) {
    createdProfile = await repo.createOAuthUserWithProfile({
      email: identity.email,
      fullName: identity.name,
      provider,
      emailVerified: identity.emailVerified,
    });
    user = await repo.findUserByEmail(identity.email);
  }
  if (!user) throw AppError.internal('Failed to resolve OAuth user');

  const profile = createdProfile ?? (await repo.getProfileSummary(user.id));
  const role: UserRole = profile?.role ?? 'job_seeker';
  await repo.updateLastLogin(user.id);

  const tokens = await issueTokens({ id: user.id, email: user.email, role }, userAgent);
  return {
    user: {
      full_name: profile?.full_name ?? identity.name,
      designation: profile?.designation ?? undefined,
      message: 'Login successful',
    },
    tokens,
  };
}
