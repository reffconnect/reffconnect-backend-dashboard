import { AppError } from '../../utils/AppError';
import * as repo from './marketplace.repository';

export async function listReferrers(): Promise<repo.ReferrerCard[]> {
  return repo.listReferrers();
}

export async function getReferrerReviewers(
  referrerId: string,
  limit: number,
): Promise<{ reviewers: repo.ReviewerRow[]; total: number }> {
  const [reviewers, total] = await Promise.all([
    repo.listReviewers(referrerId, limit),
    repo.countReviewers(referrerId),
  ]);
  return { reviewers, total };
}

export async function getUserByUserCode(code: string): Promise<repo.UserCard> {
  const user = await repo.getUserByUserCode(code);
  if (!user) throw AppError.notFound('No member found with that ID');
  return user;
}
