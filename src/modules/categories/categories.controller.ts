import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import * as service from './categories.service';

export const listCategories = asyncHandler(async (_req, res) => {
  const categories = await service.listCategories();
  sendSuccess(res, categories);
});
