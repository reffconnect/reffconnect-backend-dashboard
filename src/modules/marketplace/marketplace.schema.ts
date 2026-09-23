import { z } from 'zod';

export const referrerIdParamSchema = z.object({
  id: z.string().uuid('Invalid referrer id'),
});

export const reviewersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(4),
});

export const userCodeParamSchema = z.object({
  code: z.string().trim().min(3).max(40),
});
