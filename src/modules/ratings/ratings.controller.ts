import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { idParamSchema, submitRatingSchema } from './ratings.schema';
import * as service from './ratings.service';

export const rateReferralSession = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = idParamSchema.parse(req.params);
  const input = submitRatingSchema.parse(req.body);
  await service.rateSession('referral', id, req.user.id, input);
  sendSuccess(res, { rated: true }, 200, 'Thanks for your feedback');
});

export const rateMockSession = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = idParamSchema.parse(req.params);
  const input = submitRatingSchema.parse(req.body);
  await service.rateSession('mock', id, req.user.id, input);
  sendSuccess(res, { rated: true }, 200, 'Thanks for your feedback');
});

export const rateResumeReview = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = idParamSchema.parse(req.params);
  const input = submitRatingSchema.parse(req.body);
  await service.rateResumeReview(id, req.user.id, input);
  sendSuccess(res, { rated: true }, 200, 'Thanks for your feedback');
});
