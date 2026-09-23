import { Router } from 'express';
import * as controller from './workEmail.controller';
import { authenticate } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimit';

export const workEmailRouter = Router();

workEmailRouter.use(authenticate);
workEmailRouter.get('/', controller.getVerified);
workEmailRouter.post('/send-otp', authRateLimiter, controller.sendOtp);
workEmailRouter.post('/verify-otp', authRateLimiter, controller.verifyOtp);
