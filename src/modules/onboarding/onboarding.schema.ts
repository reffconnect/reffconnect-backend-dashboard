import { z } from 'zod';

/** Mirrors OnboardingPayload in api.ts. */
export const onboardingSchema = z.object({
  aadhaar_number: z.string().trim().max(20).optional(),
  pan_number: z.string().trim().max(20).optional(),
  official_email: z.string().email().optional(),
  github_link: z.string().url().max(500).optional(),
  linkedin_profile_link: z.string().url().max(500).optional(),
  country: z.string().trim().min(1, 'Country is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  city: z.string().trim().min(1, 'City is required').max(100),
  contact_number: z.string().trim().min(1, 'Contact number is required').max(20),
  company_name: z.string().trim().max(200).optional(),
  company_email: z.string().email().optional(),
  user_type: z.enum(['working_professional', 'job_seeker']).optional(),
  consented_at: z.string().optional(),
  consent_version: z.string().optional(),
  is_adult: z.boolean().optional(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const updateOnboardingSchema = onboardingSchema.partial();
export type UpdateOnboardingInput = z.infer<typeof updateOnboardingSchema>;
