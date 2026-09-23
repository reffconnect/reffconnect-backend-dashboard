import { z } from 'zod';

export const slotPayloadSchema = z.object({
  referrerId: z.string().uuid('Invalid referrer id'),
  serviceId: z.string().trim().min(1).max(50),
  slotLabel: z.string().trim().min(1).max(200),
});
export type SlotPayload = z.infer<typeof slotPayloadSchema>;

export const referrerIdParamSchema = z.object({
  referrerId: z.string().uuid('Invalid referrer id'),
});
