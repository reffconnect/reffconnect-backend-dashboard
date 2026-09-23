import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { createMockInterviewSchema, idParamSchema } from './mockInterviews.schema';
import * as service from './mockInterviews.service';

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = createMockInterviewSchema.parse(req.body);
  sendCreated(res, await service.createMockInterview(req.user.id, input), 'Mock interview requested');
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
