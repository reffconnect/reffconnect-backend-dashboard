import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { onboardingSchema, updateOnboardingSchema } from './onboarding.schema';
import * as service from './onboarding.service';

export const save = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = onboardingSchema.parse(req.body);
  const result = await service.saveOnboarding(req.user.id, input);
  sendSuccess(res, result, 200, 'Onboarding saved');
});

export const get = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const result = await service.getOnboarding(req.user.id);
  sendSuccess(res, result);
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = updateOnboardingSchema.parse(req.body);
  const result = await service.updateOnboarding(req.user.id, input);
  sendSuccess(res, result, 200, 'Onboarding updated');
});

export const verificationStatus = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const result = await service.getVerificationStatus(req.user.id);
  sendSuccess(res, result);
});
