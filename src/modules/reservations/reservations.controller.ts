import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { referrerIdParamSchema, slotPayloadSchema } from './reservations.schema';
import * as service from './reservations.service';

export const reserve = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const payload = slotPayloadSchema.parse(req.body);
  const reservation = await service.reserveSlot(req.user.id, payload);
  sendSuccess(res, reservation, 201, 'Slot reserved');
});

export const release = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const payload = slotPayloadSchema.parse(req.body);
  await service.releaseSlot(req.user.id, payload);
  sendSuccess(res, { released: true });
});

export const listActive = asyncHandler(async (req, res) => {
  const { referrerId } = referrerIdParamSchema.parse(req.params);
  const reservations = await service.getActiveReservations(referrerId);
  sendSuccess(res, reservations);
});
