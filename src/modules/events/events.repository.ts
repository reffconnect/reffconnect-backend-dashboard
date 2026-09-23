import { query } from '../../db/pool';

export interface EventInput {
  event_type: string;
  category?: string | null;
  ref_id?: string | null;
  metadata?: Record<string, unknown>;
}

/** Batch-insert analytics events. Fire-and-forget from the client's perspective. */
export async function insertBatch(userId: string | null, events: EventInput[]): Promise<number> {
  if (events.length === 0) return 0;
  const values: unknown[] = [];
  const tuples = events.map((event, index) => {
    const base = index * 5;
    values.push(
      userId,
      event.event_type,
      event.category ?? null,
      event.ref_id ?? null,
      JSON.stringify(event.metadata ?? {}),
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb)`;
  });
  const { rowCount } = await query(
    `INSERT INTO public.user_events (user_id, event_type, category, ref_id, metadata)
     VALUES ${tuples.join(', ')}`,
    values,
  );
  return rowCount ?? 0;
}
