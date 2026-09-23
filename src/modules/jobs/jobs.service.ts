/**
 * Job + application business rules and authorization. Response shapes
 * (JobListResponse) mirror api.ts.
 */
import { AppError } from '../../utils/AppError';
import { cacheDel, cacheGetOrSet, CacheKeys } from '../../cache/redis';
import { recordJobView } from './jobViews';
import * as repo from './jobs.repository';
import type { ApplyJobInput, CreateJobInput, ListJobsQuery, UpdateJobInput } from './jobs.schema';
import type { JobApplicationStatus } from '../../types';

// Aggregate reads that go stale when the set of jobs changes. TTL bounds the
// staleness; write paths below also bust these keys for faster convergence.
const JOB_STATS_TTL_SECONDS = 60;

/** Bust cached aggregates affected by creating/updating/removing a posting. */
async function invalidateJobAggregates(): Promise<void> {
  await cacheDel(CacheKeys.jobStats, CacheKeys.activeCategories);
}

export interface JobListResponse {
  jobs: repo.JobRecord[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export async function listJobs(filters: ListJobsQuery): Promise<JobListResponse> {
  const { jobs, total } = await repo.listJobs(filters);
  const totalPages = total === 0 ? 0 : Math.ceil(total / filters.per_page);
  return {
    jobs,
    total,
    page: filters.page,
    per_page: filters.per_page,
    total_pages: totalPages,
    has_next: filters.page < totalPages,
    has_prev: filters.page > 1,
  };
}

export async function getJob(id: number, viewerId: string | null): Promise<repo.JobRecord> {
  const job = await repo.getJobById(id);
  if (!job) throw AppError.notFound('Job not found');

  const isOwner = viewerId !== null && job.posted_by === viewerId;
  // Non-active postings are only visible to their owner.
  if (job.status !== 'active' && !isOwner) throw AppError.notFound('Job not found');

  // Count a view only when a non-owner opens an active posting. Buffered in
  // memory and flushed in batches — never a write on the read path.
  if (job.status === 'active' && !isOwner) {
    recordJobView(id);
  }
  return job;
}

export async function createJob(postedBy: string, input: CreateJobInput): Promise<repo.JobRecord> {
  const job = await repo.createJob(postedBy, input);
  await invalidateJobAggregates();
  return job;
}

export async function updateJob(
  id: number,
  ownerId: string,
  input: UpdateJobInput,
): Promise<repo.JobRecord> {
  const existing = await repo.getJobById(id);
  if (!existing) throw AppError.notFound('Job not found');
  if (existing.posted_by !== ownerId) throw AppError.forbidden('You can only edit your own postings');

  const updated = await repo.updateJob(id, input);
  if (!updated) throw AppError.notFound('Job not found');
  await invalidateJobAggregates();
  return updated;
}

export async function deleteJob(id: number, ownerId: string): Promise<void> {
  const existing = await repo.getJobById(id);
  if (!existing) throw AppError.notFound('Job not found');
  if (existing.posted_by !== ownerId) throw AppError.forbidden('You can only delete your own postings');
  await repo.deleteJob(id);
  await invalidateJobAggregates();
}

export async function getJobStats(): Promise<repo.JobStats> {
  return cacheGetOrSet(CacheKeys.jobStats, JOB_STATS_TTL_SECONDS, () => repo.getJobStats());
}

export async function applyToJob(
  jobId: number,
  userId: string,
  input: ApplyJobInput,
): Promise<repo.JobApplicationRecord> {
  const job = await repo.getJobById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'active') {
    throw AppError.badRequest('This posting is no longer accepting applications');
  }
  if (job.posted_by === userId) throw AppError.badRequest('You cannot apply to your own posting');

  const existing = await repo.findApplication(jobId, userId);
  if (existing) throw AppError.conflict('You have already applied to this job');

  return repo.insertApplication(jobId, userId, input.cover_note ?? null);
}

export async function withdrawApplication(applicationId: number, userId: string): Promise<void> {
  const deleted = await repo.deleteApplication(applicationId, userId);
  if (!deleted) throw AppError.notFound('Application not found');
}

export async function listMyApplications(userId: string): Promise<repo.MyJobApplication[]> {
  return repo.listMyApplications(userId);
}

export async function getJobApplicants(
  jobId: number,
  ownerId: string,
): Promise<repo.JobApplicantRecord[]> {
  const job = await repo.getJobById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.posted_by !== ownerId) {
    throw AppError.forbidden('You can only view applicants for your own postings');
  }
  return repo.getJobApplicants(jobId);
}

export async function updateApplicationStatus(
  applicationId: number,
  ownerId: string,
  status: JobApplicationStatus,
): Promise<repo.JobApplicationRecord> {
  const context = await repo.getApplicationOwnerContext(applicationId);
  if (!context) throw AppError.notFound('Application not found');
  if (context.job_posted_by !== ownerId) {
    throw AppError.forbidden('You can only manage applicants for your own postings');
  }
  const updated = await repo.updateApplicationStatus(applicationId, status);
  if (!updated) throw AppError.notFound('Application not found');
  return updated;
}
