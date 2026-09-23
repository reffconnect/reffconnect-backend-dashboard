import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { createReferralRequestSchema, idParamSchema } from './referralRequests.schema';
import * as service from './referralRequests.service';

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = createReferralRequestSchema.parse(req.body);
  const result = await service.createReferralRequest(req.user.id, input);
  sendCreated(res, result, 'Referral request submitted');
});

export const listMine = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  sendSuccess(res, await service.listMine(req.user.id));
});

export const listIncoming = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  sendSuccess(res, await service.listIncoming(req.user.id));
});

export const getById = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await service.getById(id, req.user.id));
});

export const decline = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await service.decline(id, req.user.id), 200, 'Request declined');
});
