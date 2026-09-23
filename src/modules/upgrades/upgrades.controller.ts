import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { adminDecisionSchema, createUpgradeSchema, idParamSchema, selfUpgradeSchema } from './upgrades.schema';
import * as service from './upgrades.service';

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = createUpgradeSchema.parse(req.body);
  sendCreated(res, await service.createUpgradeRequest(req.user.id, input.company_name, input.referrer_code));
});

export const selfUpgrade = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = selfUpgradeSchema.parse(req.body);
  sendSuccess(res, await service.selfUpgrade(req.user.id, input.company_name, input.referrer_code), 200, 'Upgraded to referrer');
});

export const getMine = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  sendSuccess(res, await service.getMyUpgradeRequest(req.user.id));
});

export const listPending = asyncHandler(async (_req, res) => {
  sendSuccess(res, await service.listPending());
});

export const approve = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { admin_notes } = adminDecisionSchema.parse(req.body);
  sendSuccess(res, await service.approve(id, admin_notes), 200, 'Upgrade approved');
});

export const reject = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { admin_notes } = adminDecisionSchema.parse(req.body);
  sendSuccess(res, await service.reject(id, admin_notes), 200, 'Upgrade rejected');
});
