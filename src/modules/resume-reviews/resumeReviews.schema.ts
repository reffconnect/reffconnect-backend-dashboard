import { z } from 'zod';

export const createResumeReviewSchema = z.object({
  referrer_id: z.string().uuid().optional(),
  referrer_name: z.string().trim().min(1).max(200),
  referrer_company: z.string().trim().min(1).max(200),
  referrer_title: z.string().trim().max(200).optional(),
  target_role: z.string().trim().max(200).optional(),
  focus_note: z.string().max(5000).optional(),
  jd_url: z.string().url().max(1000).optional(),
  resume_file_path: z.string().trim().min(1, 'A resume file path is required').max(1000),
  payment_order_id: z.string().uuid().optional(),
});
export type CreateResumeReviewInput = z.infer<typeof createResumeReviewSchema>;

export const submitFeedbackSchema = z.object({
  feedback_text: z.string().trim().min(1, 'Feedback text is required').max(20000),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
