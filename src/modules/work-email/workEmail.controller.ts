import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { sendOtpSchema, verifyOtpSchema } from './workEmail.schema';
import * as service from './workEmail.service';

export const sendOtp = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { email } = sendOtpSchema.parse(req.body);
  sendSuccess(res, await service.sendOtp(req.user.id, email), 200, 'Verification code sent');
});

export const verifyOtp = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { email, code } = verifyOtpSchema.parse(req.body);
  sendSuccess(res, await service.verifyOtp(req.user.id, email, code), 200, 'Work email verified');
});

export const getVerified = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  sendSuccess(res, await service.getVerified(req.user.id));
});
