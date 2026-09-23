import { Router } from 'express';
import * as controller from './reservations.controller';
import { authenticate } from '../../middleware/auth';

export const reservationsRouter = Router();

reservationsRouter.post('/', authenticate, controller.reserve);
reservationsRouter.post('/release', authenticate, controller.release);
reservationsRouter.get('/active/:referrerId', authenticate, controller.listActive);
