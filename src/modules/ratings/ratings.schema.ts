import { z } from 'zod';

export const submitRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review_text: z.string().max(5000).nullable().optional(),
});
export type SubmitRatingInput = z.infer<typeof submitRatingSchema>;

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
