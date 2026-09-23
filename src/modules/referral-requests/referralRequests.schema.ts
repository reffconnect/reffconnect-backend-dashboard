import { z } from 'zod';

export const createReferralRequestSchema = z.object({
  referrer_id: z.string().uuid().optional(),
  referrer_name: z.string().trim().min(1).max(200),
  referrer_company: z.string().trim().min(1).max(200),
  referrer_title: z.string().trim().max(200).optional(),
  job_url: z.string().url().max(1000).optional(),
  job_title: z.string().trim().max(300).optional(),
  role_type: z.string().trim().max(100).optional(),
  message_template: z.string().max(5000).optional(),
  personal_message: z.string().trim().min(1).max(5000),
  technical_skills: z.string().max(2000).optional(),
  experience_level: z.string().max(100).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  resume_file_name: z.string().max(300).optional(),
  resume_file_path: z.string().max(1000).optional(),
  preferred_day: z.string().max(50).optional(),
  preferred_time: z.string().max(50).optional(),
  preferred_timezone: z.string().max(100).optional(),
  requested_duration_minutes: z.number().int().positive().max(240).optional(),
  payment_order_id: z.string().uuid().optional(),
});
export type CreateReferralRequestInput = z.infer<typeof createReferralRequestSchema>;

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
