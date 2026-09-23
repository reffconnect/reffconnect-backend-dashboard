import { Router } from 'express';
import * as controller from './referralRequests.controller';
import { authenticate } from '../../middleware/auth';

export const referralRequestsRouter = Router();

referralRequestsRouter.use(authenticate);
referralRequestsRouter.post('/', controller.create);
referralRequestsRouter.get('/', controller.listMine);
referralRequestsRouter.get('/incoming', controller.listIncoming);
referralRequestsRouter.get('/:id', controller.getById);
referralRequestsRouter.post('/:id/decline', controller.decline);
