import { Router } from 'express';
import * as controller from './marketplace.controller';

export const marketplaceRouter = Router();

// Public marketplace reads.
marketplaceRouter.get('/referrers', controller.listReferrers);
marketplaceRouter.get('/referrers/:id/reviewers', controller.getReferrerReviewers);
marketplaceRouter.get('/users/by-code/:code', controller.getUserByUserCode);
