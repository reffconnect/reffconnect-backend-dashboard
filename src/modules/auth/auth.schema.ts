import { z } from 'zod';

const email = z
  .string()
  .email('A valid email is required')
  .transform((value) => value.toLowerCase().trim());

/** Mirrors UserRegistrationData in my-app/src/shared/services/api.ts. */
export const registerSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required').max(200),
  primary_email: email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['job_seeker', 'referrer']).default('job_seeker'),
  office_email: email.optional(),
  mobile_number: z.string().trim().max(20).optional(),
  designation: z.string().trim().max(200).optional(),
  company_name: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** Mirrors LoginData { email, password }. */
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refresh_token: z.string().min(10, 'refresh_token is required'),
});
export type RefreshInput = z.infer<typeof refreshSchema>;
