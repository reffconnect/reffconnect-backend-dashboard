import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import {
  referrerIdParamSchema,
  serviceIdParamSchema,
  upsertServiceConfigSchema,
} from './services.schema';
import * as service from './services.service';

export const upsert = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = upsertServiceConfigSchema.parse(req.body);
  const result = await service.upsertConfig(req.user.id, input);
  sendSuccess(res, result, 200, 'Service configuration saved');
});

export const listMine = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const result = await service.listMyConfigs(req.user.id);
  sendSuccess(res, result);
});

export const listForReferrer = asyncHandler(async (req, res) => {
  const { id } = referrerIdParamSchema.parse(req.params);
  const result = await service.listConfigsForReferrer(id);
  sendSuccess(res, result);
});

export const listForService = asyncHandler(async (req, res) => {
  const { serviceId } = serviceIdParamSchema.parse(req.params);
  const result = await service.listConfigsForService(serviceId);
  sendSuccess(res, result);
});
