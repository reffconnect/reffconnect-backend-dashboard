import { AppError } from '../../utils/AppError';
import * as repo from './profiles.repository';
import type { UpdateProfileInput } from './profiles.schema';

export async function getMyProfile(userId: string): Promise<repo.ProfileRecord> {
  const profile = await repo.getFullProfile(userId);
  if (!profile) throw AppError.notFound('Profile not found');
  return profile;
}

export async function getPublicProfile(userId: string): Promise<repo.PublicProfile> {
  const profile = await repo.getPublicProfile(userId);
  if (!profile) throw AppError.notFound('Profile not found');
  return profile;
}

export async function updateMyProfile(
  userId: string,
  updates: UpdateProfileInput,
): Promise<repo.ProfileRecord> {
  const profile = await repo.updateProfile(userId, updates as Record<string, unknown>);
  if (!profile) throw AppError.notFound('Profile not found');
  return profile;
}
