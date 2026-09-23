/**
 * Category business layer. Categories are near-static reference data read on
 * almost every page, so the active-categories list is cached (cache-aside).
 * When Redis is disabled the helper transparently falls through to Postgres.
 */
import { cacheGetOrSet, CacheKeys } from '../../cache/redis';
import * as repo from './categories.repository';

// Short TTL: categories rarely change, and job_count self-heals within minutes.
// Job writes also proactively bust this key (see jobs.service).
const ACTIVE_CATEGORIES_TTL_SECONDS = 300;

export async function listCategories(): Promise<repo.CategoryRecord[]> {
  return cacheGetOrSet(CacheKeys.activeCategories, ACTIVE_CATEGORIES_TTL_SECONDS, () =>
    repo.listActiveCategoriesWithCounts(),
  );
}
