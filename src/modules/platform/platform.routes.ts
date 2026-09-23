import { Router } from 'express';
import * as controller from './platform.controller';
import { authenticate } from '../../middleware/auth';

export const platformRouter = Router();

// Public platform surface.
platformRouter.get('/stats', controller.getStats);
platformRouter.get('/features', controller.listFeatures);

// Authenticated dashboards.
platformRouter.get('/dashboard/referrer', authenticate, controller.referrerDashboard);
platformRouter.get('/dashboard/jobseeker', authenticate, controller.jobseekerDashboard);
