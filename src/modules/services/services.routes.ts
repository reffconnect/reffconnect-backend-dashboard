import { Router } from 'express';
import * as controller from './services.controller';
import { authenticate } from '../../middleware/auth';

export const servicesRouter = Router();

// Own configs + upsert (referrer manages their own pricing/availability).
servicesRouter.get('/me', authenticate, controller.listMine);
servicesRouter.put('/', authenticate, controller.upsert);

// Public reads used by the marketplace/booking flow.
servicesRouter.get('/referrer/:id', controller.listForReferrer);
servicesRouter.get('/service/:serviceId', controller.listForService);
