import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import {
  applicationIdParamSchema,
  applyJobSchema,
  createJobSchema,
  jobIdParamSchema,
  listJobsQuerySchema,
  updateApplicationStatusSchema,
  updateJobSchema,
} from './jobs.schema';
import * as service from './jobs.service';

export const listJobs = asyncHandler(async (req, res) => {
  const filters = listJobsQuerySchema.parse(req.query);
  const result = await service.listJobs(filters);
  sendSuccess(res, result);
});

export const getJobStats = asyncHandler(async (_req, res) => {
  const stats = await service.getJobStats();
  sendSuccess(res, stats);
});

export const getJob = asyncHandler(async (req, res) => {
  const { id } = jobIdParamSchema.parse(req.params);
  const viewerId = req.user?.id ?? null;
  const job = await service.getJob(id, viewerId);
  sendSuccess(res, job);
});

export const createJob = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = createJobSchema.parse(req.body);
  const job = await service.createJob(req.user.id, input);
  sendCreated(res, job, 'Job posted');
});

export const updateJob = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = jobIdParamSchema.parse(req.params);
  const input = updateJobSchema.parse(req.body);
  const job = await service.updateJob(id, req.user.id, input);
  sendSuccess(res, job, 200, 'Job updated');
});

export const deleteJob = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = jobIdParamSchema.parse(req.params);
  await service.deleteJob(id, req.user.id);
  sendSuccess(res, { id }, 200, 'Job deleted');
});

export const applyToJob = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = jobIdParamSchema.parse(req.params);
  const input = applyJobSchema.parse(req.body);
  const application = await service.applyToJob(id, req.user.id, input);
  sendCreated(res, application, 'Application submitted');
});

export const getJobApplicants = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = jobIdParamSchema.parse(req.params);
  const applicants = await service.getJobApplicants(id, req.user.id);
  sendSuccess(res, applicants);
});

export const listMyApplications = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const applications = await service.listMyApplications(req.user.id);
  sendSuccess(res, applications);
});

export const withdrawApplication = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = applicationIdParamSchema.parse(req.params);
  await service.withdrawApplication(id, req.user.id);
  sendSuccess(res, { id }, 200, 'Application withdrawn');
});

export const updateApplicationStatus = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = applicationIdParamSchema.parse(req.params);
  const { status } = updateApplicationStatusSchema.parse(req.body);
  const application = await service.updateApplicationStatus(id, req.user.id, status);
  sendSuccess(res, application, 200, 'Application updated');
});
