/**
 * Postgres connection pool(s) + query helpers.
 *
 * This backend owns its database. It connects only to DATABASE_URL (primary)
 * and, when configured, DATABASE_REPLICA_URL (read replica) — never to the
 * Supabase project the current app uses.
 *
 * Pool sizing, statement timeout, and the optional replica are env-driven so the
 * service can scale horizontally: budget `instances * DB_POOL_MAX` against your
 * connection ceiling (or put PgBouncer in front and pool generously).
 */
import { Pool, types, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config/env';
import { logger } from '../utils/logger';

// Return BIGINT/BIGSERIAL (OID 20) as JS numbers so ids match the frontend's
// `number` typing. App ids stay well under Number.MAX_SAFE_INTEGER.
types.setTypeParser(20, (value: string) => Number(value));

// Settings shared by the primary and (optional) replica pools.
const commonPoolConfig: PoolConfig = {
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  max: config.DB_POOL_MAX,
  min: config.DB_POOL_MIN,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'connectx-backend',
  // Cap how long any single statement may run (0 disables). Protects the pool
  // from a runaway query holding a connection and starving everything else.
  statement_timeout: config.DB_STATEMENT_TIMEOUT_MS > 0 ? config.DB_STATEMENT_TIMEOUT_MS : undefined,
};

export const pool = new Pool({ connectionString: config.DATABASE_URL, ...commonPoolConfig });

pool.on('error', (err) => {
  logger.error(
    'Unexpected error on idle Postgres client (primary)',
    err instanceof Error ? err.message : err,
  );
});

// Optional read replica. Reads that tolerate replication lag can target this via
// queryReplica(); when unset, those reads transparently fall back to the primary.
export const replicaPool: Pool | null = config.DATABASE_REPLICA_URL
  ? new Pool({ connectionString: config.DATABASE_REPLICA_URL, ...commonPoolConfig })
  : null;

replicaPool?.on('error', (err) => {
  logger.error(
    'Unexpected error on idle Postgres client (replica)',
    err instanceof Error ? err.message : err,
  );
});

async function runQuery<T extends QueryResultRow>(
  target: Pool,
  label: string,
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await target.query<T>(text, params as unknown[] | undefined);
  const durationMs = Date.now() - start;
  if (durationMs > 300) {
    logger.warn(`Slow query [${label}] (${durationMs}ms): ${text.split('\n')[0] ?? text}`);
  }
  return res;
}

/** Run a query against the primary (use for all writes and read-your-write reads). */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<QueryResult<T>> {
  return runQuery<T>(pool, 'primary', text, params);
}

/**
 * Run a read against the replica when one is configured, otherwise the primary.
 * Use ONLY for reads that tolerate slight replication lag (e.g. public browse
 * lists). NEVER use for a read that must observe a write you just made.
 */
export async function queryReplica<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<QueryResult<T>> {
  const target = replicaPool ?? pool;
  return runQuery<T>(target, replicaPool ? 'replica' : 'primary', text, params);
}

/** Run `fn` inside a transaction on the primary, committing on success and rolling back on error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Liveness of the primary database connection (used by readiness probes). */
export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.error('Database connection check failed', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Drain both pools on shutdown. */
export async function shutdownPool(): Promise<void> {
  const ends: Array<Promise<void>> = [pool.end()];
  if (replicaPool) ends.push(replicaPool.end());
  await Promise.allSettled(ends);
}
