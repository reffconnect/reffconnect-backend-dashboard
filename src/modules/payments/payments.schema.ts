import { z } from 'zod';

export const createOrderSchema = z.object({
  serviceId: z.enum(['referral-session', 'resume-review', 'interview-mock']),
  referrerId: z.string().uuid(),
  slotLabel: z.string().max(200).nullable().optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const orderIdParamSchema = z.object({ id: z.string().uuid() });
