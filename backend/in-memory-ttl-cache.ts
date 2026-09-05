/**
 * In-memory TTL cache
 *
 * Source pattern: a module-level `Map<key, { data, expiresAt }>` wrapped
 * around an expensive computation (several parallel DB queries building a
 * report). Reads check `Date.now() < expiresAt` before trusting the cached
 * value; a miss or stale entry falls through to recompute and re-stamp the
 * expiry. Simplified/anonymized from a real-app benchmark-report endpoint.
 *
 * Shape: no library, no eviction policy beyond "check the timestamp on
 * read" — the cheapest cache that solves "don't recompute this every
 * request for the same key within a time window".
 */

type CacheEntry<T> = { data: T; expiresAt: number };

const reportCache = new Map<string, CacheEntry<Report>>();
const CACHE_ENABLED = process.env.NODE_ENV === "production";
const TTL_MS = 60 * 60 * 1000; // 1 hour

type Report = { rows: unknown[] };

async function getReport(groupId: string): Promise<Report> {
  if (CACHE_ENABLED) {
    const cached = reportCache.get(groupId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
  }

  const report = await buildReportFromDb(groupId);

  if (CACHE_ENABLED) {
    reportCache.set(groupId, { data: report, expiresAt: Date.now() + TTL_MS });
  }

  return report;
}

declare function buildReportFromDb(groupId: string): Promise<Report>;
