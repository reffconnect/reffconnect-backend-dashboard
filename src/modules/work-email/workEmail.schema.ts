import { z } from 'zod';

export const sendOtpSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
});

export const verifyOtpSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
