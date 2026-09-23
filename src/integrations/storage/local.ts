/**
 * Local-disk storage provider (default). Zero credentials: files live under
 * STORAGE_DIR. Keys are resolved with a containment check so a crafted key can
 * never read or write outside the storage root.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { config } from '../../config/env';
import { AppError } from '../../utils/AppError';
import {
  buildObjectKey,
  contentTypeFor,
  type PutObjectParams,
  type StorageProvider,
} from './provider';

const BASE_DIR = resolve(process.cwd(), config.STORAGE_DIR);

/** Resolve a key to an absolute path, refusing anything that escapes BASE_DIR. */
function safeResolve(key: string): string {
  const abs = resolve(BASE_DIR, key);
  if (abs !== BASE_DIR && !abs.startsWith(BASE_DIR + sep)) {
    throw AppError.badRequest('Invalid storage path');
  }
  return abs;
}

export const localProvider: StorageProvider = {
  async putObject(params: PutObjectParams): Promise<{ path: string }> {
    const key = buildObjectKey(params);
    const abs = safeResolve(key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, params.buffer);
    return { path: key };
  },

  async readObject(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    const abs = safeResolve(key);
    try {
      const buffer = await readFile(abs);
      return { buffer, contentType: contentTypeFor(key) };
    } catch {
      throw AppError.notFound('File not found');
    }
  },
};
