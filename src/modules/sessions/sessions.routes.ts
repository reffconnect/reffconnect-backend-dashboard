import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { createSessionController } from './sessions.controller';

function buildRouter(kind: 'referral' | 'mock'): Router {
  const controller = createSessionController(kind);
  const router = Router();
  router.use(authenticate);
  router.post('/', controller.schedule);
  router.get('/', controller.listMine);
  router.get('/busy/:referrerId', controller.busySlots);
  router.get('/:id', controller.getById);
  router.post('/:id/reschedule', controller.reschedule);
  router.post('/:id/cancel', controller.cancel);
  return router;
}

export const referralSessionsRouter = buildRouter('referral');
export const mockInterviewSessionsRouter = buildRouter('mock');
