import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import * as repo from './platform.repository';

export const getStats = asyncHandler(async (_req, res) => {
  const stats = await repo.getStats();
  sendSuccess(res, stats);
});

export const listFeatures = asyncHandler(async (_req, res) => {
  const features = await repo.listFeatures();
  sendSuccess(res, features);
});

export const referrerDashboard = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const data = await repo.getReferrerDashboard(req.user.id);
  sendSuccess(res, data);
});

export const jobseekerDashboard = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const data = await repo.getJobseekerDashboard(req.user.id);
  sendSuccess(res, data);
});
