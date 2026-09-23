import { z } from 'zod';

export const SERVICE_IDS = ['referral-session', 'resume-review', 'interview-mock'] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

/** Platform-fixed prices professionals cannot change (mirrors PLATFORM_FIXED_SERVICE_PRICES). */
export const PLATFORM_FIXED_SERVICE_PRICES: Partial<Record<ServiceId, number>> = {
  'resume-review': 299,
};

/** Bounds a professional may price the configurable services within. */
export const MIN_SERVICE_PRICE = 500;
export const MAX_SERVICE_PRICE = 3000;

export const upsertServiceConfigSchema = z.object({
  service_id: z.enum(SERVICE_IDS),
  availability: z.record(z.string(), z.unknown()).default({}),
  price: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().default(true),
});
export type UpsertServiceConfigInput = z.infer<typeof upsertServiceConfigSchema>;

export const serviceIdParamSchema = z.object({
  serviceId: z.enum(SERVICE_IDS),
});

export const referrerIdParamSchema = z.object({
  id: z.string().uuid('Invalid referrer id'),
});
