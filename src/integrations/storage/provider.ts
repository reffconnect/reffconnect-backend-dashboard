/**
 * Storage provider contract + backend-agnostic helpers.
 *
 * A provider only has to move bytes: store an uploaded buffer under a key we
 * generate, and read a stored object back by that key. Everything else
 * (signed download tokens, download URLs, MIME typing, upload-size limit) lives
 * in the facade (./index.ts) and is identical across providers, so the security
 * model — no public URLs, downloads gated by short-lived signed tokens streamed
 * through our API with an attachment disposition — does not depend on the
 * backend in use.
 */
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface PutObjectParams {
  userId: string;
  purpose: string;
  filename: string;
  buffer: Buffer;
}

export interface StorageProvider {
  /** Store bytes and return the logical key (persisted + embedded in tokens). */
  putObject(params: PutObjectParams): Promise<{ path: string }>;
  /** Fetch bytes for a logical key. Throws AppError.notFound when absent. */
  readObject(key: string): Promise<{ buffer: Buffer; contentType: string }>;
}

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Best-effort content type from the key's extension; unknown → octet-stream. */
export function contentTypeFor(key: string): string {
  return MIME_BY_EXT[extname(key).toLowerCase()] ?? 'application/octet-stream';
}

/** Collapse anything unusual to keep keys/paths tame; never empty. */
export function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

/**
 * Build a logical object key: `<userId>/<purpose>/<uuid>-<filename>`. The UUID
 * makes keys unguessable and collision-free; all segments are sanitized so the
 * key is safe as both a filesystem path and an S3 key.
 */
export function buildObjectKey(params: PutObjectParams): string {
  const safePurpose = sanitize(params.purpose || 'misc');
  return `${sanitize(params.userId)}/${safePurpose}/${randomUUID()}-${sanitize(params.filename)}`;
}
