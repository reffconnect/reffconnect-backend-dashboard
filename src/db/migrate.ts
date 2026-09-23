/**
 * Schema runner. Applies db/schema.sql first (the core tables), then every
 * other db/*.sql file in sorted order (feature extensions).
 *
 *   npm run db:migrate
 *
 * All files are idempotent, so this is safe to run repeatedly.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool, shutdownPool } from './pool';
import { logger } from '../utils/logger';

const CORE_FILE = 'schema.sql';

function orderedSqlFiles(dir: string): string[] {
  const all = readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.sql'));
  const rest = all.filter((name) => name !== CORE_FILE).sort((a, b) => a.localeCompare(b));
  return all.includes(CORE_FILE) ? [CORE_FILE, ...rest] : rest;
}

async function migrate(): Promise<void> {
  const dbDir = resolve(__dirname, '../../db');
  const files = orderedSqlFiles(dbDir);
  if (files.length === 0) {
    logger.warn(`No .sql files found in ${dbDir}`);
    return;
  }
  for (const file of files) {
    const sql = readFileSync(resolve(dbDir, file), 'utf8');
    logger.info(`Applying ${file}`);
    await pool.query(sql);
  }
  logger.info(`Schema applied successfully (${files.length} file(s)).`);
}

migrate()
  .then(shutdownPool)
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error('Migration failed', err instanceof Error ? err.message : err);
    await shutdownPool().catch(() => undefined);
    process.exit(1);
  });
