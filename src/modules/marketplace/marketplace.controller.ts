import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { referrerIdParamSchema, reviewersQuerySchema, userCodeParamSchema } from './marketplace.schema';
import * as service from './marketplace.service';

export const listReferrers = asyncHandler(async (_req, res) => {
  const referrers = await service.listReferrers();
  sendSuccess(res, referrers);
});

export const getReferrerReviewers = asyncHandler(async (req, res) => {
  const { id } = referrerIdParamSchema.parse(req.params);
  const { limit } = reviewersQuerySchema.parse(req.query);
  const result = await service.getReferrerReviewers(id, limit);
  sendSuccess(res, result);
});

export const getUserByUserCode = asyncHandler(async (req, res) => {
  const { code } = userCodeParamSchema.parse(req.params);
  const user = await service.getUserByUserCode(code);
  sendSuccess(res, user);
});
