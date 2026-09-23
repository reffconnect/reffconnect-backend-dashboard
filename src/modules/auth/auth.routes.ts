import { Router } from 'express';
import * as controller from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimit';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, controller.register);
authRouter.post('/login', authRateLimiter, controller.login);
authRouter.post('/refresh', authRateLimiter, controller.refresh);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', authenticate, controller.me);

// OAuth: exchange a verified provider identity for our own tokens.
authRouter.post('/oauth/google', authRateLimiter, controller.googleOAuth);
authRouter.post('/oauth/linkedin', authRateLimiter, controller.linkedinOAuth);
