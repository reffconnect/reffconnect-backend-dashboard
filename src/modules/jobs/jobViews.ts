/**
 * Buffered job-view counting.
 *
 * Opening a job used to trigger a synchronous `UPDATE jobs SET views_count =
 * views_count + 1` — a write on every read that also contends on the row lock
 * for popular postings. Instead we accumulate view deltas in-process and flush
 * them in a single batched UPDATE on an interval (and once more on shutdown).
 *
 * View counts are inherently approximate, so losing at most one interval of
 * buffered counts if the process is killed is an acceptable trade for taking
 * writes off the hot read path. Each instance keeps its own buffer; the batched
 * UPDATE is additive, so concurrent flushes from multiple instances compose
 * correctly.
 */
import { logger } from '../../utils/logger';
import { incrementJobViewsBatch } from './jobs.repository';

let pending = new Map<number, number>();
let flushing = false;

// Safety valve: if a burst fills the buffer before the timer fires, flush early
// so memory stays bounded regardless of the flush interval.
const MAX_PENDING_KEYS = 5_000;

/** Record a single view for `jobId`. Cheap, synchronous, never touches the DB. */
export function recordJobView(jobId: number): void {
  pending.set(jobId, (pending.get(jobId) ?? 0) + 1);
  if (pending.size >= MAX_PENDING_KEYS) void flushJobViews();
}

/** Flush buffered view deltas to Postgres in one batched UPDATE. */
export async function flushJobViews(): Promise<void> {
  if (flushing || pending.size === 0) return;
  flushing = true;
  const batch = pending;
  pending = new Map();
  try {
    await incrementJobViewsBatch([...batch].map(([id, delta]) => ({ id, delta })));
  } catch (err) {
    // Merge the batch back so the next flush retries rather than dropping counts.
    for (const [id, delta] of batch) pending.set(id, (pending.get(id) ?? 0) + delta);
    logger.warn(
      'Failed to flush job views; will retry next interval',
      err instanceof Error ? err.message : err,
    );
  } finally {
    flushing = false;
  }
}

/**
 * Start the periodic flusher. Returns a stop function that clears the timer and
 * performs a final flush — call it during graceful shutdown (before the DB pool
 * is drained).
 */
export function startJobViewFlusher(intervalMs = 30_000): () => Promise<void> {
  const timer = setInterval(() => void flushJobViews(), intervalMs);
  timer.unref(); // don't keep the event loop alive just for this timer
  return async () => {
    clearInterval(timer);
    await flushJobViews();
  };
}
