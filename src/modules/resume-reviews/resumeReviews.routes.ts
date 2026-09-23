import { Router } from 'express';
import * as controller from './resumeReviews.controller';
import { authenticate } from '../../middleware/auth';

export const resumeReviewsRouter = Router();

resumeReviewsRouter.use(authenticate);
resumeReviewsRouter.post('/', controller.create);
resumeReviewsRouter.get('/', controller.listMine);
resumeReviewsRouter.get('/incoming', controller.listIncoming);
resumeReviewsRouter.get('/:id', controller.getById);
resumeReviewsRouter.post('/:id/decline', controller.decline);
resumeReviewsRouter.post('/:id/feedback', controller.submitFeedback);
