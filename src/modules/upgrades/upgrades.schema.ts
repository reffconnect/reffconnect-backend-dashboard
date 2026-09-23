import { z } from 'zod';

export const createUpgradeSchema = z.object({
  company_name: z.string().trim().max(200).optional(),
  referrer_code: z.string().trim().max(40).optional(),
});

export const selfUpgradeSchema = z.object({
  company_name: z.string().trim().max(200).optional(),
  referrer_code: z.string().trim().max(40).optional(),
});

export const adminDecisionSchema = z.object({
  admin_notes: z.string().max(2000).optional(),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
