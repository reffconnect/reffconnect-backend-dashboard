import { z } from 'zod';

export const createSuccessStorySchema = z
  .object({
    referrer_id: z.string().uuid().nullable().optional(),
    title: z.string().trim().max(300).optional(),
    story_text: z.string().trim().max(10000).optional(),
    company_name: z.string().trim().max(200).optional(),
    role_title: z.string().trim().max(200).optional(),
  })
  .refine((d) => Boolean(d.title?.trim() || d.story_text?.trim()), {
    message: 'A title or story text is required',
    path: ['story_text'],
  });
export type CreateSuccessStoryInput = z.infer<typeof createSuccessStorySchema>;

export const referrerIdParamSchema = z.object({ id: z.string().uuid('Invalid referrer id') });
