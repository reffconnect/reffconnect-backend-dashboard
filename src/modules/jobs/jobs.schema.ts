import { z } from 'zod';

const jobType = z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance']);
const experienceLevel = z.enum(['entry', 'mid', 'senior', 'executive']);
const workMode = z.enum(['remote', 'onsite', 'hybrid']);
const jobStatus = z.enum(['active', 'closed', 'draft', 'paused']);

/** Query params arrive as strings; a plain enum avoids z.coerce.boolean's "false" → true trap. */
const boolFromQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

export const jobIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid job id'),
});

export const applicationIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid application id'),
});

export const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(20),
  category_id: z.coerce.number().int().positive().optional(),
  job_type: jobType.optional(),
  experience_level: experienceLevel.optional(),
  work_mode: workMode.optional(),
  location: z.string().trim().max(200).optional(),
  company_name: z.string().trim().max(200).optional(),
  salary_min: z.coerce.number().int().nonnegative().optional(),
  salary_max: z.coerce.number().int().nonnegative().optional(),
  is_featured: boolFromQuery.optional(),
  search_query: z.string().trim().max(200).optional(),
});
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

/** The editable columns of a job. createJobSchema requires the essentials; update makes all optional. */
const jobFields = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  description: z.string().trim().min(1, 'Description is required'),
  company_name: z.string().trim().min(1, 'Company name is required').max(200),
  location: z.string().trim().max(200).default(''),
  job_type: jobType.default('full_time'),
  experience_level: experienceLevel.default('entry'),
  work_mode: workMode.default('onsite'),
  status: jobStatus.default('active'),
  salary_min: z.number().int().nonnegative().nullable().optional(),
  salary_max: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().trim().max(10).default('INR'),
  skills_required: z.string().max(2000).nullable().optional(),
  experience_years: z.number().int().nonnegative().max(60).default(0),
  contact_email: z.string().email().nullable().optional(),
  application_url: z.string().url().max(1000).nullable().optional(),
  is_featured: z.boolean().default(false),
  requirements: z.string().max(10000).nullable().optional(),
  benefits: z.string().max(10000).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  category_id: z.number().int().positive().nullable().optional(),
});

const salaryRangeValid = (data: { salary_min?: number | null; salary_max?: number | null }): boolean =>
  data.salary_min == null || data.salary_max == null || data.salary_max >= data.salary_min;

export const createJobSchema = jobFields.refine(salaryRangeValid, {
  message: 'salary_max must be greater than or equal to salary_min',
  path: ['salary_max'],
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = jobFields
  .partial()
  .refine(salaryRangeValid, {
    message: 'salary_max must be greater than or equal to salary_min',
    path: ['salary_max'],
  });
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const applyJobSchema = z.object({
  cover_note: z.string().max(5000).nullable().optional(),
});
export type ApplyJobInput = z.infer<typeof applyJobSchema>;

export const updateApplicationStatusSchema = z.object({
  status: z.enum(['applied', 'reviewing', 'shortlisted', 'rejected', 'hired']),
});
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>;
