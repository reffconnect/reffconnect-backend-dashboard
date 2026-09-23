-- ConnectX standalone backend — jobs scaling indexes (Phase 1)
-- =============================================================================
-- Makes the hot job-board reads scale. Applied after schema.sql by
-- db/migrate.ts (files run in sorted order). Idempotent: safe to re-run.
--
--   • pg_trgm GIN indexes so the free-text search and "contains" filters in
--     jobs.repository.listJobs (title/description/company_name ILIKE '%q%',
--     plus the company_name and location filters) use an index instead of a
--     sequential scan. A plain b-tree cannot serve a leading-wildcard ILIKE;
--     a trigram GIN index can.
--   • a partial composite index matching the default active-jobs browse
--     ordering so that path is served straight from an index.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Free-text search (search_query) spans title, description and company_name;
-- the location/company_name filters use ILIKE '%…%' too. One GIN index each so
-- Postgres can bitmap-OR them for the multi-column search.
CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm
  ON public.jobs USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_company_trgm
  ON public.jobs USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_location_trgm
  ON public.jobs USING gin (location gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_description_trgm
  ON public.jobs USING gin (description gin_trgm_ops);

-- Serve the default browse — WHERE status = 'active'
-- ORDER BY is_featured DESC, created_at DESC — directly from a small partial
-- index instead of scanning + sorting active rows.
CREATE INDEX IF NOT EXISTS idx_jobs_browse_active
  ON public.jobs (is_featured DESC, created_at DESC)
  WHERE status = 'active';
