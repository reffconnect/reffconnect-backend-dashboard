import { Router } from 'express';
import * as controller from './mockInterviews.controller';
import { authenticate } from '../../middleware/auth';

export const mockInterviewsRouter = Router();

mockInterviewsRouter.use(authenticate);
mockInterviewsRouter.post('/', controller.create);
mockInterviewsRouter.get('/', controller.listMine);
mockInterviewsRouter.get('/incoming', controller.listIncoming);
mockInterviewsRouter.get('/:id', controller.getById);
mockInterviewsRouter.post('/:id/decline', controller.decline);
