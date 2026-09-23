import { z } from 'zod';

const noteService = z.enum(['referral', 'resume_review', 'mock_interview']);

export const listNotesQuerySchema = z.object({
  service: noteService,
  request_id: z.coerce.number().int().positive(),
});

export const addNoteSchema = z.object({
  service: noteService,
  request_id: z.number().int().positive(),
  body: z.string().trim().min(1).max(2000),
  is_action_item: z.boolean().default(false),
});

export const toggleActionItemSchema = z.object({
  is_done: z.boolean(),
});

export const noteIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
