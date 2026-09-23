import { Router } from 'express';
import * as controller from './jobs.controller';
import { authenticate, optionalAuth, requireRole } from '../../middleware/auth';

export const jobsRouter = Router();

// ── Static / specific routes first (so they aren't shadowed by '/:id') ──
jobsRouter.get('/', controller.listJobs);
jobsRouter.get('/stats', controller.getJobStats);
jobsRouter.get('/me/applications', authenticate, controller.listMyApplications);

// Only working professionals (referrers) or admins may post.
jobsRouter.post('/', authenticate, requireRole('referrer', 'admin'), controller.createJob);

// Application management by id (two-segment paths — no conflict with '/:id').
jobsRouter.patch('/applications/:id', authenticate, controller.updateApplicationStatus);
jobsRouter.delete('/applications/:id', authenticate, controller.withdrawApplication);

// ── Job-by-id routes ────────────────────────────────────────────────
jobsRouter.get('/:id', optionalAuth, controller.getJob);
jobsRouter.patch('/:id', authenticate, controller.updateJob);
jobsRouter.delete('/:id', authenticate, controller.deleteJob);

jobsRouter.post('/:id/apply', authenticate, controller.applyToJob);
jobsRouter.get('/:id/applicants', authenticate, controller.getJobApplicants);
