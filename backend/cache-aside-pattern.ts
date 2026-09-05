/**
 * Cache-aside pattern — DB-backed, for expensive calls
 *
 * Source pattern: a dedicated DB table used purely as a cache in front of
 * an expensive external call (an LLM completion, in the source). Read the
 * table by a normalized key first; on a miss, do the expensive call, then
 * persist the result with an upsert-style insert for next time.
 * Simplified/anonymized from a real-app "generate description" helper.
 *
 * Shape: check-DB -> (hit: return) -> (miss: compute -> store -> return).
 * The DB table *is* the cache; no Redis/in-memory layer involved.
 */

async function getOrGenerateDescription(name: string): Promise<string | null> {
  const key = name.trim().toLowerCase();

  // 1. Check the cache table first.
  const cached = await db.query<{ description: string | null }>(
    `SELECT description FROM description_cache WHERE name_key = $1`,
    [key],
  );

  let description = cached.rows[0]?.description ?? null;

  // 2. Miss: do the expensive call.
  if (!description) {
    description = await callExpensiveGenerationApi(name);

    // 3. Store the result for next time. ON CONFLICT DO NOTHING guards
    //    against a race with a concurrent request computing the same key.
    if (description) {
      await db.query(
        `INSERT INTO description_cache (name_key, description) VALUES ($1, $2)
         ON CONFLICT (name_key) DO NOTHING`,
        [key, description],
      );
    }
  }

  return description;
}

declare const db: { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };
declare function callExpensiveGenerationApi(name: string): Promise<string | null>;
