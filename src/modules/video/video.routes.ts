import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { authenticate } from '../../middleware/auth';
import * as sessionsRepo from '../sessions/sessions.repository';
import * as daily from '../../integrations/daily';

const joinSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  sessionType: z.enum(['referral', 'mock']),
});

const EARLY_JOIN_MS = 10 * 60 * 1000;

export const videoRouter = Router();

// Issue a Daily room + meeting token for a session the caller participates in,
// within the allowed join window.
videoRouter.post(
  '/join',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const { sessionId, sessionType } = joinSchema.parse(req.body);

    const session = await sessionsRepo.getById(sessionType, sessionId);
    if (!session) throw AppError.notFound('Session not found');
    if (session.requester_id !== req.user.id && session.referrer_id !== req.user.id) {
      throw AppError.forbidden('You are not a participant in this session');
    }
    if (session.status === 'cancelled') throw AppError.badRequest('This session was cancelled');

    const start = new Date(session.scheduled_start).getTime();
    const end = new Date(session.scheduled_end).getTime();
    const now = Date.now();
    if (now < start - EARLY_JOIN_MS) throw AppError.badRequest('The room opens 10 minutes before the start time');
    if (now > end) throw AppError.badRequest('This session has already ended');

    const isOwner = session.referrer_id === req.user.id;
    const room = await daily.createRoomAndToken({
      roomName: `cx-${sessionType}-${sessionId}`,
      expUnix: Math.floor(end / 1000) + 300,
      isOwner,
    });
    await sessionsRepo.setDailyRoom(sessionType, sessionId, room.roomName, room.roomUrl);

    sendSuccess(res, { roomUrl: room.roomUrl, token: room.token });
  }),
);
