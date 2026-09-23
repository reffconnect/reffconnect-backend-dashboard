import { Router } from 'express';
import * as controller from './payments.controller';
import { authenticate } from '../../middleware/auth';

export const paymentsRouter = Router();

// Public webhook (gateway can't send our JWT; verified by HMAC signature).
paymentsRouter.post('/webhook', controller.webhook);

// Authenticated checkout endpoints.
paymentsRouter.post('/orders', authenticate, controller.createOrder);
paymentsRouter.post('/verify', authenticate, controller.verifyPayment);
paymentsRouter.get('/orders/:id', authenticate, controller.getOrder);
