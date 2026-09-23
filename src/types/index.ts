/**
 * Shared domain enums and cross-cutting types.
 *
 * These mirror `my-app/src/shared/types/database.types.ts` so payloads line up
 * with what the frontend already expects.
 */
export type UserRole = 'job_seeker' | 'referrer' | 'admin';
export type AuthProvider = 'local' | 'google' | 'linkedin';
export type JobType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'executive';
export type WorkMode = 'remote' | 'onsite' | 'hybrid';
export type JobStatus = 'active' | 'closed' | 'draft' | 'paused';
export type JobApplicationStatus =
  | 'applied'
  | 'reviewing'
  | 'shortlisted'
  | 'rejected'
  | 'hired'
  | 'withdrawn';

/** Identity attached to `req.user` by the auth guard. */
export interface AuthUserContext {
  id: string;
  email: string;
  role: UserRole;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}
