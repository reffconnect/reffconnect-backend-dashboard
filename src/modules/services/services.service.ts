import { AppError } from '../../utils/AppError';
import * as repo from './services.repository';
import {
  MAX_SERVICE_PRICE,
  MIN_SERVICE_PRICE,
  PLATFORM_FIXED_SERVICE_PRICES,
  type ServiceId,
  type UpsertServiceConfigInput,
} from './services.schema';

/** Applies pricing rules: resume-review is platform-fixed; others must be null or within bounds. */
function resolvePrice(serviceId: ServiceId, requested: number | null | undefined): number | null {
  const fixed = PLATFORM_FIXED_SERVICE_PRICES[serviceId];
  if (fixed !== undefined) return fixed;
  if (requested === null || requested === undefined) return null;
  if (requested < MIN_SERVICE_PRICE || requested > MAX_SERVICE_PRICE) {
    throw AppError.badRequest(
      `Price for ${serviceId} must be between ₹${MIN_SERVICE_PRICE} and ₹${MAX_SERVICE_PRICE}`,
    );
  }
  return requested;
}

export async function upsertConfig(
  userId: string,
  input: UpsertServiceConfigInput,
): Promise<repo.ServiceConfigRow> {
  const price = resolvePrice(input.service_id, input.price ?? null);
  return repo.upsertConfig(userId, {
    service_id: input.service_id,
    availability: input.availability,
    price,
    is_active: input.is_active,
  });
}

export async function listMyConfigs(userId: string): Promise<repo.ServiceConfigRow[]> {
  return repo.listByUser(userId);
}

export async function listConfigsForReferrer(referrerId: string): Promise<repo.ServiceConfigRow[]> {
  return repo.listByUser(referrerId);
}

export async function listConfigsForService(serviceId: string): Promise<repo.ServiceConfigRow[]> {
  return repo.listByService(serviceId);
}
