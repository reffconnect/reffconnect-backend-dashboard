/**
 * Profile data access.
 *
 * Two projections mirror api.ts:
 *   - FULL: everything the owner may see about themselves.
 *   - PUBLIC: the PII-excluded slice used for marketplace/other-user views
 *     (matches PUBLIC_PROFILE_SELECT — no primary_email / mobile_number).
 */
import { query } from '../../db/pool';
import type { AuthProvider, UserRole } from '../../types';

export interface ProfileRecord {
  id: string;
  full_name: string;
  primary_email: string;
  office_email: string | null;
  office_email_verified: boolean;
  office_email_verified_at: string | null;
  mobile_number: string | null;
  designation: string | null;
  company_name: string | null;
  location: string | null;
  role: UserRole;
  auth_provider: AuthProvider;
  is_active: boolean;
  is_verified: boolean;
  email_verified: boolean;
  profile_picture: string | null;
  linkedin_url: string | null;
  github_link: string | null;
  portfolio_url: string | null;
  bio: string | null;
  skills: string[] | null;
  preferred_locations: string[] | null;
  availability_status: string | null;
  notice_period: string | null;
  work_modes: string[] | null;
  industry: string | null;
  languages: string | null;
  years_of_experience: string | null;
  education_entries: unknown[];
  project_entries: unknown[];
  certification_entries: unknown[];
  work_history_entries: unknown[];
  achievement_entries: unknown[];
  hobbies: string[] | null;
  verified_company_domain: string | null;
  jobseeker_profile: Record<string, unknown> | null;
  rating: number | null;
  reviews_count: number;
  user_code: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export type PublicProfile = Pick<
  ProfileRecord,
  | 'id'
  | 'full_name'
  | 'designation'
  | 'company_name'
  | 'location'
  | 'role'
  | 'is_active'
  | 'is_verified'
  | 'profile_picture'
  | 'linkedin_url'
  | 'github_link'
  | 'portfolio_url'
  | 'bio'
  | 'skills'
  | 'industry'
  | 'languages'
  | 'years_of_experience'
  | 'work_modes'
  | 'notice_period'
  | 'availability_status'
  | 'preferred_locations'
  | 'education_entries'
  | 'project_entries'
  | 'certification_entries'
  | 'work_history_entries'
  | 'achievement_entries'
  | 'hobbies'
  | 'user_code'
  | 'verified_company_domain'
  | 'created_at'
>;

const FULL_PROFILE_COLUMNS = `
  id, full_name, primary_email, office_email, office_email_verified, office_email_verified_at,
  mobile_number, designation, company_name, location, role, auth_provider, is_active, is_verified,
  email_verified, profile_picture, linkedin_url, github_link, portfolio_url, bio, skills,
  preferred_locations, availability_status, notice_period, work_modes, industry, languages,
  years_of_experience, education_entries, project_entries, certification_entries,
  work_history_entries, achievement_entries, hobbies, verified_company_domain, jobseeker_profile,
  rating::float8 AS rating, reviews_count, user_code, last_login, created_at, updated_at
`;

const PUBLIC_PROFILE_COLUMNS = `
  id, full_name, designation, company_name, location, role, is_active, is_verified,
  profile_picture, linkedin_url, github_link, portfolio_url, bio, skills, industry, languages,
  years_of_experience, work_modes, notice_period, availability_status, preferred_locations,
  education_entries, project_entries, certification_entries, work_history_entries,
  achievement_entries, hobbies, user_code, verified_company_domain, created_at
`;

/** jsonb columns must be bound as stringified JSON with an explicit cast. */
const JSONB_COLUMNS = new Set([
  'education_entries',
  'project_entries',
  'certification_entries',
  'work_history_entries',
  'achievement_entries',
  'jobseeker_profile',
]);

/** Whitelist of columns the update path may touch (defense in depth). */
const UPDATABLE_COLUMNS = new Set([
  'full_name',
  'designation',
  'company_name',
  'location',
  'mobile_number',
  'bio',
  'profile_picture',
  'linkedin_url',
  'github_link',
  'portfolio_url',
  'skills',
  'preferred_locations',
  'work_modes',
  'availability_status',
  'notice_period',
  'industry',
  'languages',
  'years_of_experience',
  'education_entries',
  'project_entries',
  'certification_entries',
  'work_history_entries',
  'achievement_entries',
  'hobbies',
]);

export async function getFullProfile(userId: string): Promise<ProfileRecord | null> {
  const { rows } = await query<ProfileRecord>(
    `SELECT ${FULL_PROFILE_COLUMNS} FROM public.profiles WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { rows } = await query<PublicProfile>(
    `SELECT ${PUBLIC_PROFILE_COLUMNS} FROM public.profiles WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function updateProfile(
  userId: string,
  updates: Record<string, unknown>,
): Promise<ProfileRecord | null> {
  const keys = Object.keys(updates).filter((key) => UPDATABLE_COLUMNS.has(key));
  if (keys.length === 0) return getFullProfile(userId);

  const setParts: string[] = [];
  const values: unknown[] = [userId];

  for (const key of keys) {
    const placeholder = `$${values.length + 1}`;
    if (JSONB_COLUMNS.has(key)) {
      setParts.push(`${key} = ${placeholder}::jsonb`);
      values.push(JSON.stringify(updates[key] ?? null));
    } else {
      setParts.push(`${key} = ${placeholder}`);
      values.push(updates[key]);
    }
  }

  const { rows } = await query<ProfileRecord>(
    `UPDATE public.profiles SET ${setParts.join(', ')} WHERE id = $1 RETURNING ${FULL_PROFILE_COLUMNS}`,
    values,
  );
  return rows[0] ?? null;
}
