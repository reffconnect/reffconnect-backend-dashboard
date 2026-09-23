import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { createSuccessStorySchema, referrerIdParamSchema } from './successStories.schema';
import * as repo from './successStories.repository';

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = createSuccessStorySchema.parse(req.body);
  const story = await repo.insert(req.user.id, {
    referrer_id: input.referrer_id ?? null,
    title: input.title ?? null,
    story_text: input.story_text ?? null,
    company_name: input.company_name ?? null,
    role_title: input.role_title ?? null,
  });
  sendCreated(res, story, 'Success story published');
});

export const listApproved = asyncHandler(async (_req, res) => {
  sendSuccess(res, await repo.listApproved());
});

export const listForReferrer = asyncHandler(async (req, res) => {
  const { id } = referrerIdParamSchema.parse(req.params);
  sendSuccess(res, await repo.listForReferrer(id));
});
