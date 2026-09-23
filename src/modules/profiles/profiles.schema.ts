import { z } from 'zod';

export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user id'),
});

const jsonEntryArray = z.array(z.record(z.string(), z.unknown())).max(100);

/**
 * Fields a user may edit on their own profile. Sensitive/authoritative columns
 * (role, email, verification flags, ratings, user_code) are deliberately absent
 * — they are not client-editable. `.strict()` rejects anything unexpected.
 */
export const updateProfileSchema = z
  .object({
    full_name: z.string().trim().min(1).max(200).optional(),
    designation: z.string().trim().max(200).nullable().optional(),
    company_name: z.string().trim().max(200).nullable().optional(),
    location: z.string().trim().max(200).nullable().optional(),
    mobile_number: z.string().trim().max(20).nullable().optional(),
    bio: z.string().max(5000).nullable().optional(),
    profile_picture: z.string().max(2000).nullable().optional(),
    linkedin_url: z.string().url().max(500).nullable().optional(),
    github_link: z.string().url().max(500).nullable().optional(),
    portfolio_url: z.string().url().max(500).nullable().optional(),
    skills: z.array(z.string().max(100)).max(200).optional(),
    preferred_locations: z.array(z.string().max(100)).max(50).optional(),
    work_modes: z.array(z.enum(['remote', 'onsite', 'hybrid'])).max(3).optional(),
    availability_status: z.string().max(100).nullable().optional(),
    notice_period: z.string().max(100).nullable().optional(),
    industry: z.string().max(200).nullable().optional(),
    languages: z.string().max(500).nullable().optional(),
    years_of_experience: z.string().max(50).nullable().optional(),
    education_entries: jsonEntryArray.optional(),
    project_entries: jsonEntryArray.optional(),
    certification_entries: jsonEntryArray.optional(),
    work_history_entries: jsonEntryArray.optional(),
    achievement_entries: jsonEntryArray.optional(),
    hobbies: z.array(z.string().max(100)).max(100).optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
