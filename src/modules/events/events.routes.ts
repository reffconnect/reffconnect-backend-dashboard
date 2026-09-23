import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { optionalAuth } from '../../middleware/auth';
import * as repo from './events.repository';

const logEventsSchema = z.object({
  events: z
    .array(
      z.object({
        event_type: z.string().trim().min(1).max(100),
        category: z.string().max(100).nullable().optional(),
        ref_id: z.string().max(200).nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const eventsRouter = Router();

// Anonymous events are allowed (user_id null); an access token attributes them.
eventsRouter.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { events } = logEventsSchema.parse(req.body);
    const inserted = await repo.insertBatch(req.user?.id ?? null, events);
    sendSuccess(res, { inserted });
  }),
);
