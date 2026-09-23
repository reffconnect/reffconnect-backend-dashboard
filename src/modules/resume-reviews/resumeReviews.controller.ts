import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { createResumeReviewSchema, idParamSchema, submitFeedbackSchema } from './resumeReviews.schema';
import * as service from './resumeReviews.service';

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = createResumeReviewSchema.parse(req.body);
  sendCreated(res, await service.createResumeReview(req.user.id, input), 'Resume review requested');
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
  sendSuccess(res, await service.decline(id, req.user.id), 200, 'Request cancelled');
});

export const submitFeedback = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = idParamSchema.parse(req.params);
  const { feedback_text } = submitFeedbackSchema.parse(req.body);
  sendSuccess(res, await service.submitFeedback(id, req.user.id, feedback_text), 200, 'Feedback delivered');
});
