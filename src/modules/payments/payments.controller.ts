import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { createOrderSchema, orderIdParamSchema, verifyPaymentSchema } from './payments.schema';
import * as service from './payments.service';

export const createOrder = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = createOrderSchema.parse(req.body);
  sendSuccess(res, await service.createOrder(req.user.id, input), 201);
});

export const verifyPayment = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = verifyPaymentSchema.parse(req.body);
  sendSuccess(res, await service.verifyPayment(req.user.id, input));
});

export const getOrder = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = orderIdParamSchema.parse(req.params);
  sendSuccess(res, await service.getOrder(req.user.id, id));
});

/** Public webhook. Raw-body HMAC verified inside the service; always 200 unless signature is bad. */
export const webhook = asyncHandler(async (req, res) => {
  const signature = req.header('x-razorpay-signature') ?? '';
  const eventId = req.header('x-razorpay-event-id') ?? null;
  const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  const result = await service.handleWebhook(rawBody, signature, eventId);
  res.status(result.status).json(result.body);
});
