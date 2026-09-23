/**
 * Data access for authentication: users, their 1:1 profile summary, and the
 * refresh-token handles used for rotation/revocation.
 */
import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import type { UserRole } from '../../types';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  auth_provider: string;
  email_verified: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileSummary {
  id: string;
  full_name: string;
  designation: string | null;
  role: UserRole;
  primary_email: string;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface CreateUserWithProfileParams {
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  officeEmail?: string | undefined;
  mobileNumber?: string | undefined;
  designation?: string | undefined;
  companyName?: string | undefined;
  location?: string | undefined;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, email, password_hash, auth_provider, email_verified, last_login, created_at, updated_at
       FROM public.users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, email, password_hash, auth_provider, email_verified, last_login, created_at, updated_at
       FROM public.users
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getProfileSummary(userId: string): Promise<ProfileSummary | null> {
  const { rows } = await query<ProfileSummary>(
    `SELECT id, full_name, designation, role, primary_email
       FROM public.profiles
      WHERE id = $1
      LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/** Creates the auth user and its 1:1 profile atomically. */
export async function createUserWithProfile(
  params: CreateUserWithProfileParams,
): Promise<ProfileSummary> {
  return withTransaction(async (client) => {
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO public.users (email, password_hash, auth_provider, email_verified)
       VALUES ($1, $2, 'local', FALSE)
       RETURNING id`,
      [params.email, params.passwordHash],
    );
    const userRow = userResult.rows[0];
    if (!userRow) throw AppError.internal('Failed to create user');

    const profileResult = await client.query<ProfileSummary>(
      `INSERT INTO public.profiles
         (id, full_name, primary_email, office_email, mobile_number, designation,
          company_name, location, role, auth_provider, is_active, is_verified, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'local', TRUE, FALSE, FALSE)
       RETURNING id, full_name, designation, role, primary_email`,
      [
        userRow.id,
        params.fullName,
        params.email,
        params.officeEmail ?? null,
        params.mobileNumber ?? null,
        params.designation ?? null,
        params.companyName ?? null,
        params.location ?? null,
        params.role,
      ],
    );
    const profileRow = profileResult.rows[0];
    if (!profileRow) throw AppError.internal('Failed to create profile');
    return profileRow;
  });
}

export async function updateLastLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await query(`UPDATE public.users SET last_login = $2 WHERE id = $1`, [userId, now]);
  await query(`UPDATE public.profiles SET last_login = $2 WHERE id = $1`, [userId, now]);
}

export async function insertRefreshToken(params: {
  jti: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | undefined;
}): Promise<void> {
  await query(
    `INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.jti, params.userId, params.tokenHash, params.expiresAt.toISOString(), params.userAgent ?? null],
  );
}

export async function getRefreshTokenById(jti: string): Promise<RefreshTokenRow | null> {
  const { rows } = await query<RefreshTokenRow>(
    `SELECT id, user_id, token_hash, expires_at, revoked_at
       FROM public.refresh_tokens
      WHERE id = $1
      LIMIT 1`,
    [jti],
  );
  return rows[0] ?? null;
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  await query(
    `UPDATE public.refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
    [jti],
  );
}

/** Create an OAuth user (no password) + profile atomically. */
export async function createOAuthUserWithProfile(params: {
  email: string;
  fullName: string;
  provider: 'google' | 'linkedin';
  emailVerified: boolean;
}): Promise<ProfileSummary> {
  return withTransaction(async (client) => {
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO public.users (email, password_hash, auth_provider, email_verified)
       VALUES ($1, NULL, $2, $3)
       RETURNING id`,
      [params.email, params.provider, params.emailVerified],
    );
    const userRow = userResult.rows[0];
    if (!userRow) throw AppError.internal('Failed to create user');

    const profileResult = await client.query<ProfileSummary>(
      `INSERT INTO public.profiles
         (id, full_name, primary_email, role, auth_provider, is_active, is_verified, email_verified)
       VALUES ($1, $2, $3, 'job_seeker', $4, TRUE, FALSE, $5)
       RETURNING id, full_name, designation, role, primary_email`,
      [userRow.id, params.fullName, params.email, params.provider, params.emailVerified],
    );
    const profileRow = profileResult.rows[0];
    if (!profileRow) throw AppError.internal('Failed to create profile');
    return profileRow;
  });
}
