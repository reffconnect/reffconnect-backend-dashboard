import { Router } from 'express';
import * as controller from './ratings.controller';
import { authenticate } from '../../middleware/auth';

export const ratingsRouter = Router();

ratingsRouter.use(authenticate);
ratingsRouter.post('/referral-session/:id', controller.rateReferralSession);
ratingsRouter.post('/mock-session/:id', controller.rateMockSession);
ratingsRouter.post('/resume-review/:id', controller.rateResumeReview);
