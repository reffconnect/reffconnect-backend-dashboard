/**
 * Data access for jobs + applications. Shapes mirror api.ts (Job, JobListResponse,
 * JobApplicationRecord, JobApplicant, JobStats) so the frontend can switch with
 * minimal churn. Authorization (who may post/edit/view applicants) lives in the
 * service layer.
 */
import { query } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import type { CategoryRecord } from '../categories/categories.repository';
import type {
  ExperienceLevel,
  JobApplicationStatus,
  JobStatus,
  JobType,
  WorkMode,
} from '../../types';
import type { CreateJobInput, ListJobsQuery, UpdateJobInput } from './jobs.schema';

export interface JobRecord {
  id: number;
  title: string;
  description: string;
  company_name: string;
  location: string;
  job_type: JobType;
  experience_level: ExperienceLevel;
  work_mode: WorkMode;
  status: JobStatus;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  skills_required: string | null;
  experience_years: number;
  contact_email: string | null;
  application_url: string | null;
  is_featured: boolean;
  views_count: number;
  applications_count: number;
  requirements: string | null;
  benefits: string | null;
  expires_at: string | null;
  category_id: number | null;
  posted_by: string;
  created_at: string;
  updated_at: string;
  category?: CategoryRecord | null;
  poster_name?: string | null;
}

export interface JobApplicationRecord {
  id: number;
  job_id: number;
  user_id: string;
  status: JobApplicationStatus;
  cover_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MyJobApplication extends JobApplicationRecord {
  job: JobRecord | null;
}

export interface JobApplicantRecord {
  application_id: number;
  applicant_id: string;
  status: JobApplicationStatus;
  cover_note: string | null;
  applied_at: string;
  full_name: string | null;
  designation: string | null;
  company_name: string | null;
  location: string | null;
  profile_picture: string | null;
  linkedin_url: string | null;
  user_code: string | null;
}

export interface JobStats {
  total_jobs: number;
  active_jobs: number;
  featured_jobs: number;
  total_categories: number;
  total_applications: number;
}

const UPDATABLE_JOB_COLUMNS = new Set([
  'title',
  'description',
  'company_name',
  'location',
  'job_type',
  'experience_level',
  'work_mode',
  'status',
  'salary_min',
  'salary_max',
  'currency',
  'skills_required',
  'experience_years',
  'contact_email',
  'application_url',
  'is_featured',
  'requirements',
  'benefits',
  'expires_at',
  'category_id',
]);

// Select a job with its category relation + poster name, matching what the
// frontend expects on a Job (job.category, job.poster_name).
const JOB_SELECT = `
  j.*,
  CASE WHEN c.id IS NOT NULL THEN row_to_json(c.*) ELSE NULL END AS category,
  p.full_name AS poster_name
`;

const JOB_JOINS = `
  FROM public.jobs j
  LEFT JOIN public.categories c ON c.id = j.category_id
  LEFT JOIN public.profiles p ON p.id = j.posted_by
`;

export async function listJobs(
  filters: ListJobsQuery,
): Promise<{ jobs: JobRecord[]; total: number }> {
  const values: unknown[] = [];
  const conditions: string[] = [`j.status = 'active'`];
  const param = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.category_id !== undefined) conditions.push(`j.category_id = ${param(filters.category_id)}`);
  if (filters.job_type) conditions.push(`j.job_type = ${param(filters.job_type)}`);
  if (filters.experience_level) conditions.push(`j.experience_level = ${param(filters.experience_level)}`);
  if (filters.work_mode) conditions.push(`j.work_mode = ${param(filters.work_mode)}`);
  if (filters.location) conditions.push(`j.location ILIKE ${param(`%${filters.location}%`)}`);
  if (filters.company_name) conditions.push(`j.company_name ILIKE ${param(`%${filters.company_name}%`)}`);
  if (filters.salary_min !== undefined) conditions.push(`j.salary_min >= ${param(filters.salary_min)}`);
  if (filters.salary_max !== undefined) conditions.push(`j.salary_max <= ${param(filters.salary_max)}`);
  if (filters.is_featured !== undefined) conditions.push(`j.is_featured = ${param(filters.is_featured)}`);
  if (filters.search_query) {
    const p = param(`%${filters.search_query}%`);
    conditions.push(`(j.title ILIKE ${p} OR j.description ILIKE ${p} OR j.company_name ILIKE ${p})`);
  }

  const limit = param(filters.per_page);
  const offset = param((filters.page - 1) * filters.per_page);

  const { rows } = await query<JobRecord & { total_count: number }>(
    `SELECT ${JOB_SELECT}, COUNT(*) OVER() AS total_count
     ${JOB_JOINS}
     WHERE ${conditions.join(' AND ')}
     ORDER BY j.is_featured DESC, j.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    values,
  );

  const total = rows.length > 0 && rows[0] ? Number(rows[0].total_count) : 0;
  const jobs: JobRecord[] = rows.map((row) => {
    const { total_count, ...job } = row;
    void total_count; // present only to compute `total`; not part of the Job shape
    return job;
  });
  return { jobs, total };
}

export async function getJobById(id: number): Promise<JobRecord | null> {
  const { rows } = await query<JobRecord>(
    `SELECT ${JOB_SELECT} ${JOB_JOINS} WHERE j.id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createJob(postedBy: string, input: CreateJobInput): Promise<JobRecord> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO public.jobs
       (title, description, company_name, location, job_type, experience_level, work_mode, status,
        salary_min, salary_max, currency, skills_required, experience_years, contact_email,
        application_url, is_featured, requirements, benefits, expires_at, category_id, posted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id`,
    [
      input.title,
      input.description,
      input.company_name,
      input.location,
      input.job_type,
      input.experience_level,
      input.work_mode,
      input.status,
      input.salary_min ?? null,
      input.salary_max ?? null,
      input.currency,
      input.skills_required ?? null,
      input.experience_years,
      input.contact_email ?? null,
      input.application_url ?? null,
      input.is_featured,
      input.requirements ?? null,
      input.benefits ?? null,
      input.expires_at ?? null,
      input.category_id ?? null,
      postedBy,
    ],
  );
  const created = rows[0];
  if (!created) throw AppError.internal('Failed to create job');
  const job = await getJobById(created.id);
  if (!job) throw AppError.internal('Failed to load created job');
  return job;
}

export async function updateJob(id: number, input: UpdateJobInput): Promise<JobRecord | null> {
  const entries = Object.entries(input).filter(([key]) => UPDATABLE_JOB_COLUMNS.has(key));
  if (entries.length === 0) return getJobById(id);

  const values: unknown[] = [id];
  const setParts = entries.map(([key, value]) => {
    values.push(value ?? null);
    return `${key} = $${values.length}`;
  });

  await query(`UPDATE public.jobs SET ${setParts.join(', ')} WHERE id = $1`, values);
  return getJobById(id);
}

export async function deleteJob(id: number): Promise<void> {
  await query(`DELETE FROM public.jobs WHERE id = $1`, [id]);
}

/**
 * Apply buffered view deltas in a single statement:
 *   UPDATE jobs SET views_count = views_count + v.delta
 *   FROM (VALUES (id, delta), ...) AS v(id, delta) WHERE jobs.id = v.id
 * Additive, so concurrent flushes from multiple instances compose correctly.
 */
export async function incrementJobViewsBatch(
  entries: ReadonlyArray<{ id: number; delta: number }>,
): Promise<void> {
  if (entries.length === 0) return;
  const values: unknown[] = [];
  const tuples = entries.map(({ id, delta }) => {
    values.push(id, delta);
    return `($${values.length - 1}::bigint, $${values.length}::int)`;
  });
  await query(
    `UPDATE public.jobs AS j
        SET views_count = views_count + v.delta
       FROM (VALUES ${tuples.join(', ')}) AS v(id, delta)
      WHERE j.id = v.id`,
    values,
  );
}

export async function getJobStats(): Promise<JobStats> {
  const { rows } = await query<Record<keyof JobStats, number>>(
    `SELECT
       (SELECT COUNT(*) FROM public.jobs)                                AS total_jobs,
       (SELECT COUNT(*) FROM public.jobs WHERE status = 'active')        AS active_jobs,
       (SELECT COUNT(*) FROM public.jobs WHERE is_featured)             AS featured_jobs,
       (SELECT COUNT(*) FROM public.categories WHERE is_active)         AS total_categories,
       (SELECT COUNT(*) FROM public.job_applications)                   AS total_applications`,
  );
  const row = rows[0];
  return {
    total_jobs: Number(row?.total_jobs ?? 0),
    active_jobs: Number(row?.active_jobs ?? 0),
    featured_jobs: Number(row?.featured_jobs ?? 0),
    total_categories: Number(row?.total_categories ?? 0),
    total_applications: Number(row?.total_applications ?? 0),
  };
}

// ── Applications ──────────────────────────────────────────────────────

export async function findApplication(
  jobId: number,
  userId: string,
): Promise<JobApplicationRecord | null> {
  const { rows } = await query<JobApplicationRecord>(
    `SELECT id, job_id, user_id, status, cover_note, created_at, updated_at
       FROM public.job_applications
      WHERE job_id = $1 AND user_id = $2
      LIMIT 1`,
    [jobId, userId],
  );
  return rows[0] ?? null;
}

export async function insertApplication(
  jobId: number,
  userId: string,
  coverNote: string | null,
): Promise<JobApplicationRecord> {
  const { rows } = await query<JobApplicationRecord>(
    `INSERT INTO public.job_applications (job_id, user_id, cover_note)
     VALUES ($1, $2, $3)
     RETURNING id, job_id, user_id, status, cover_note, created_at, updated_at`,
    [jobId, userId, coverNote],
  );
  const created = rows[0];
  if (!created) throw AppError.internal('Failed to create application');
  return created;
}

export async function deleteApplication(applicationId: number, userId: string): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM public.job_applications WHERE id = $1 AND user_id = $2`,
    [applicationId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function listMyApplications(userId: string): Promise<MyJobApplication[]> {
  const { rows } = await query<
    JobApplicationRecord & { job: JobRecord | null; job_category: CategoryRecord | null }
  >(
    `SELECT a.id, a.job_id, a.user_id, a.status, a.cover_note, a.created_at, a.updated_at,
            row_to_json(j.*) AS job,
            CASE WHEN c.id IS NOT NULL THEN row_to_json(c.*) ELSE NULL END AS job_category
       FROM public.job_applications a
       JOIN public.jobs j ON j.id = a.job_id
       LEFT JOIN public.categories c ON c.id = j.category_id
      WHERE a.user_id = $1
      ORDER BY a.created_at DESC`,
    [userId],
  );

  return rows.map(({ job, job_category, ...application }) => {
    const jobWithCategory = job ? { ...job, category: job_category } : null;
    return { ...application, job: jobWithCategory };
  });
}

export async function getApplicationOwnerContext(
  applicationId: number,
): Promise<{ application_id: number; job_posted_by: string } | null> {
  const { rows } = await query<{ application_id: number; job_posted_by: string }>(
    `SELECT a.id AS application_id, j.posted_by AS job_posted_by
       FROM public.job_applications a
       JOIN public.jobs j ON j.id = a.job_id
      WHERE a.id = $1
      LIMIT 1`,
    [applicationId],
  );
  return rows[0] ?? null;
}

export async function updateApplicationStatus(
  applicationId: number,
  status: JobApplicationStatus,
): Promise<JobApplicationRecord | null> {
  const { rows } = await query<JobApplicationRecord>(
    `UPDATE public.job_applications SET status = $2 WHERE id = $1
     RETURNING id, job_id, user_id, status, cover_note, created_at, updated_at`,
    [applicationId, status],
  );
  return rows[0] ?? null;
}

export async function getJobApplicants(jobId: number): Promise<JobApplicantRecord[]> {
  const { rows } = await query<JobApplicantRecord>(
    `SELECT a.id            AS application_id,
            a.user_id       AS applicant_id,
            a.status        AS status,
            a.cover_note    AS cover_note,
            a.created_at    AS applied_at,
            p.full_name     AS full_name,
            p.designation   AS designation,
            p.company_name  AS company_name,
            p.location      AS location,
            p.profile_picture AS profile_picture,
            p.linkedin_url  AS linkedin_url,
            p.user_code     AS user_code
       FROM public.job_applications a
       JOIN public.profiles p ON p.id = a.user_id
      WHERE a.job_id = $1
      ORDER BY a.created_at DESC`,
    [jobId],
  );
  return rows;
}
