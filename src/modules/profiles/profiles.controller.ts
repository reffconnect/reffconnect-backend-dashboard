import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { updateProfileSchema, userIdParamSchema } from './profiles.schema';
import * as service from './profiles.service';

export const getMe = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const profile = await service.getMyProfile(req.user.id);
  sendSuccess(res, profile);
});

export const updateMe = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const updates = updateProfileSchema.parse(req.body);
  const profile = await service.updateMyProfile(req.user.id, updates);
  sendSuccess(res, profile, 200, 'Profile updated');
});

export const getPublicProfile = asyncHandler(async (req, res) => {
  const { id } = userIdParamSchema.parse(req.params);
  const profile = await service.getPublicProfile(id);
  sendSuccess(res, profile);
});
