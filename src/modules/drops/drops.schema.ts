import { z } from 'zod';

export const listDropsQuerySchema = z.object({
  company: z.string().trim().max(200).optional(),
});

export const submitCardSchema = z.object({
  drop_id: z.string().uuid().nullable().optional(),
  company_name: z.string().trim().min(1).max(200),
  target_job_req_id: z.string().max(200).optional(),
  target_job_url: z.string().url().max(1000).optional(),
  resume_url: z.string().max(2000).optional(),
  pitch_text: z.string().max(5000).optional(),
  leetcode_url: z.string().url().max(500).optional(),
  github_url: z.string().url().max(500).optional(),
  project_demo_url: z.string().url().max(500).optional(),
  job_description_text: z.string().max(20000).optional(),
  job_description_source: z.string().max(200).optional(),
  ai_processing_consent: z.literal(true, {
    errorMap: () => ({ message: 'AI processing consent is required to submit a card' }),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SubmitCardInput = z.infer<typeof submitCardSchema>;

export const acceptCardSchema = z.object({
  hr_reference_id: z.string().trim().min(1).max(200),
});
export const askCandidateSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});
export const passCardSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export const savePreferencesSchema = z.object({
  companies: z.array(z.string().max(200)).max(50).optional(),
  roles: z.array(z.string().max(200)).max(50).optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const cardIdParamSchema = z.object({ id: z.string().uuid() });
