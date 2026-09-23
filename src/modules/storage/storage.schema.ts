import { z } from 'zod';

export const uploadBodySchema = z.object({
  purpose: z.string().trim().max(50).optional(),
});

export const downloadParamSchema = z.object({
  token: z.string().min(10),
});

export const resumeUrlQuerySchema = z.object({
  service: z.enum(['referral', 'resume_review']),
  request_id: z.coerce.number().int().positive(),
});
