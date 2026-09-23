import { Router } from 'express';
import * as controller from './profiles.controller';
import { authenticate } from '../../middleware/auth';

export const profilesRouter = Router();

// Current user's own profile. Declared before '/:id' so "me" is not read as an id.
profilesRouter.get('/me', authenticate, controller.getMe);
profilesRouter.patch('/me', authenticate, controller.updateMe);

// Public (PII-excluded) projection of any user by id.
profilesRouter.get('/:id', controller.getPublicProfile);
