import { query } from '../../db/pool';

export interface ServiceConfigRow {
  id: number;
  user_id: string;
  service_id: string;
  availability: Record<string, unknown>;
  price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function upsertConfig(
  userId: string,
  input: { service_id: string; availability: Record<string, unknown>; price: number | null; is_active: boolean },
): Promise<ServiceConfigRow> {
  const { rows } = await query<ServiceConfigRow>(
    `INSERT INTO public.service_configurations (user_id, service_id, availability, price, is_active)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (user_id, service_id) DO UPDATE SET
       availability = EXCLUDED.availability,
       price = EXCLUDED.price,
       is_active = EXCLUDED.is_active
     RETURNING *`,
    [userId, input.service_id, JSON.stringify(input.availability ?? {}), input.price, input.is_active],
  );
  if (!rows[0]) throw new Error('Failed to upsert service configuration');
  return rows[0];
}

export async function listByUser(userId: string): Promise<ServiceConfigRow[]> {
  const { rows } = await query<ServiceConfigRow>(
    `SELECT * FROM public.service_configurations WHERE user_id = $1 ORDER BY service_id`,
    [userId],
  );
  return rows;
}

export async function listByService(serviceId: string): Promise<ServiceConfigRow[]> {
  const { rows } = await query<ServiceConfigRow>(
    `SELECT * FROM public.service_configurations WHERE service_id = $1 AND is_active = TRUE`,
    [serviceId],
  );
  return rows;
}

export async function getActivePrice(referrerId: string, serviceId: string): Promise<number | null> {
  const { rows } = await query<{ price: number | null }>(
    `SELECT price FROM public.service_configurations
      WHERE user_id = $1 AND service_id = $2 AND is_active = TRUE LIMIT 1`,
    [referrerId, serviceId],
  );
  return rows[0]?.price ?? null;
}
