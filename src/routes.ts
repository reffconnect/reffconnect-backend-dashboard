/**
 * Aggregate router mounted under /api/v1.
 */
import { Router } from 'express';

import { healthRouter } from './modules/health/health.routes';
import { authRouter } from './modules/auth/auth.routes';
import { profilesRouter } from './modules/profiles/profiles.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { jobsRouter } from './modules/jobs/jobs.routes';

import { onboardingRouter } from './modules/onboarding/onboarding.routes';
import { servicesRouter } from './modules/services/services.routes';
import { marketplaceRouter } from './modules/marketplace/marketplace.routes';
import { platformRouter } from './modules/platform/platform.routes';
import { reservationsRouter } from './modules/reservations/reservations.routes';

import { referralRequestsRouter } from './modules/referral-requests/referralRequests.routes';
import { resumeReviewsRouter } from './modules/resume-reviews/resumeReviews.routes';
import { mockInterviewsRouter } from './modules/mock-interviews/mockInterviews.routes';
import {
  referralSessionsRouter,
  mockInterviewSessionsRouter,
} from './modules/sessions/sessions.routes';
import { ratingsRouter } from './modules/ratings/ratings.routes';
import { notesRouter } from './modules/notes/notes.routes';

import { upgradesRouter } from './modules/upgrades/upgrades.routes';
import { successStoriesRouter } from './modules/success-stories/successStories.routes';
import { eventsRouter } from './modules/events/events.routes';
import { externalJobsRouter } from './modules/external-jobs/externalJobs.routes';
import { accountRouter } from './modules/account/account.routes';

import { paymentsRouter } from './modules/payments/payments.routes';
import { videoRouter } from './modules/video/video.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { workEmailRouter } from './modules/work-email/workEmail.routes';
import { dropsRouter } from './modules/drops/drops.routes';
import { trustRouter } from './modules/trust/trust.routes';
import { metricsRouter } from './modules/metrics/metrics.routes';
import { storageRouter } from './modules/storage/storage.routes';

export const apiRouter = Router();

// Core
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/profiles', profilesRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/jobs', jobsRouter);

// Account setup + marketplace
apiRouter.use('/onboarding', onboardingRouter);
apiRouter.use('/services', servicesRouter);
apiRouter.use('/marketplace', marketplaceRouter);
apiRouter.use('/platform', platformRouter);
apiRouter.use('/reservations', reservationsRouter);

// Bookings
apiRouter.use('/referral-requests', referralRequestsRouter);
apiRouter.use('/resume-reviews', resumeReviewsRouter);
apiRouter.use('/mock-interviews', mockInterviewsRouter);
apiRouter.use('/referral-sessions', referralSessionsRouter);
apiRouter.use('/mock-interview-sessions', mockInterviewSessionsRouter);
apiRouter.use('/ratings', ratingsRouter);
apiRouter.use('/notes', notesRouter);

// Growth + lifecycle
apiRouter.use('/referrer-upgrades', upgradesRouter);
apiRouter.use('/success-stories', successStoriesRouter);
apiRouter.use('/events', eventsRouter);
apiRouter.use('/external-jobs', externalJobsRouter);
apiRouter.use('/account', accountRouter);

// Integrations (fail closed without credentials)
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/video', videoRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/work-email', workEmailRouter);
apiRouter.use('/drops', dropsRouter);
apiRouter.use('/trust', trustRouter);
apiRouter.use('/metrics', metricsRouter);
apiRouter.use('/storage', storageRouter);
