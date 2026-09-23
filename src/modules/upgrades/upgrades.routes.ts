import { Router } from 'express';
import * as controller from './upgrades.controller';
import { authenticate, requireRole } from '../../middleware/auth';

export const upgradesRouter = Router();

upgradesRouter.use(authenticate);

// Candidate-facing.
upgradesRouter.post('/', controller.create);
upgradesRouter.post('/self', controller.selfUpgrade);
upgradesRouter.get('/me', controller.getMine);

// Admin-only review queue.
upgradesRouter.get('/admin/pending', requireRole('admin'), controller.listPending);
upgradesRouter.post('/admin/:id/approve', requireRole('admin'), controller.approve);
upgradesRouter.post('/admin/:id/reject', requireRole('admin'), controller.reject);
