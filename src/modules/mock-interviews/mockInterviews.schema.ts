import { z } from 'zod';

export const createMockInterviewSchema = z.object({
  referrer_id: z.string().uuid().optional(),
  referrer_name: z.string().trim().min(1).max(200),
  referrer_company: z.string().trim().min(1).max(200),
  referrer_title: z.string().trim().max(200).optional(),
  company_question: z.string().max(5000).optional(),
  focus_note: z.string().max(5000).optional(),
  preferred_day: z.string().max(50).optional(),
  preferred_time: z.string().max(50).optional(),
  preferred_timezone: z.string().max(100).optional(),
  requested_duration_minutes: z.number().int().positive().max(240).optional(),
  payment_order_id: z.string().uuid().optional(),
});
export type CreateMockInterviewInput = z.infer<typeof createMockInterviewSchema>;

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
