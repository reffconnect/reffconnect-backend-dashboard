import { Router } from 'express';
import * as controller from './onboarding.controller';
import { authenticate } from '../../middleware/auth';

export const onboardingRouter = Router();

onboardingRouter.use(authenticate);
onboardingRouter.get('/', controller.get);
onboardingRouter.post('/', controller.save);
onboardingRouter.patch('/', controller.update);
onboardingRouter.get('/verification-status', controller.verificationStatus);
