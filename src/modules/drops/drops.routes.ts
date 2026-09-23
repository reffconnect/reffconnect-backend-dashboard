import { Router } from 'express';
import * as controller from './drops.controller';
import { authenticate, requireRole } from '../../middleware/auth';

export const dropsRouter = Router();

// Public: browse active drops.
dropsRouter.get('/', controller.listActive);

// Candidate side.
dropsRouter.post('/cards', authenticate, controller.submitCard);
dropsRouter.get('/cards/mine', authenticate, controller.myCards);
dropsRouter.post('/cards/:id/confirm-receipt', authenticate, controller.confirmReceipt);

// Referrer side.
dropsRouter.get('/cards/assigned', authenticate, requireRole('referrer', 'admin'), controller.assignedCards);
dropsRouter.post('/cards/:id/accept', authenticate, requireRole('referrer', 'admin'), controller.acceptCard);
dropsRouter.post('/cards/:id/ask', authenticate, requireRole('referrer', 'admin'), controller.askCandidate);
dropsRouter.post('/cards/:id/pass', authenticate, requireRole('referrer', 'admin'), controller.passCard);

// Referrer drop preferences.
dropsRouter.get('/preferences', authenticate, controller.getPreferences);
dropsRouter.put('/preferences', authenticate, controller.savePreferences);
