/**
 * Cache-aside pattern — DB-backed, for expensive calls
 *
 * Source pattern: a dedicated DB table used purely as a cache in front of
 * an expensive external call (an LLM completion, in the source). Read the
 * table by a normalized key first; on a miss, do the expensive call, then
 * persist the result with an upsert-style insert for next time.
 * Simplified/anonymized from a real-app "generate subject description"
 * helper (an admin/teacher-facing endpoint that AI-generates a description
 * for a school subject name).
 *
 * Shape: check-DB -> (hit: return) -> (miss: compute -> store -> return).
 * The DB table *is* the cache; no Redis/in-memory layer involved.
 *
 * This is NOT "read the user's saved data, generate a default if they don't
 * have one yet" — the cache is keyed by the normalized *name* only, and is
 * shared across every caller, not scoped to a user. If user A generates a
 * description for "Marine Biology", the (expensive) AI output is stored
 * once under that key; when user B later generates for the same name, they
 * get A's cached text back instead of paying for a fresh AI call. What
 * each user does with that result afterwards — saving it as their own
 * subject's description and editing it — happens in their own record,
 * elsewhere, and never writes back into this shared cache. Regenerating
 * later (e.g. after deleting their own copy) just returns the same shared
 * cached value again, not a fresh one.
 */

// `name` is a subject name like "Marine Biology" — not a user id, and this
// function has no idea which user is calling. The cache row it reads/writes
// is shared by whichever user happens to ask for that name first.
async function getOrGenerateDescription(name: string): Promise<string | null> {
  const key = name.trim().toLowerCase();

  // 1. Check the shared cache table first — has *anyone* generated a
  //    description for this name before, regardless of who they were?
  const cached = await db.query<{ description: string | null }>(
    `SELECT description FROM description_cache WHERE name_key = $1`,
    [key],
  );

  let description = cached.rows[0]?.description ?? null;

  // 2. Miss: do the expensive call. First caller for a given name pays for
  //    it; every later caller for that same name is a cache hit above.
  if (!description) {
    description = await callExpensiveGenerationApi(name);

    // 3. Store the result for next time, for anyone. ON CONFLICT DO NOTHING
    //    guards against a race with a concurrent request computing the
    //    same key (e.g. two teachers both generating "Marine Biology" at
    //    the same moment).
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

// Called directly from a route handler — the caller doesn't know or care
// whether the description came from cache or a fresh generation call. But
// note what's shared across callers and what isn't:
//
//   // Teacher A creates a subject named "Marine Biology":
//   //   POST /subjects/generate-description  { name: "Marine Biology" }
//   const description = await getOrGenerateDescription(request.body.name);
//   // -> cache miss, pays for an AI call, stores it under name_key
//   //    "marine biology", returns it. Teacher A then saves THIS text as
//   //    their own subject's description_en — their own row, editable by
//   //    them alone from here on.
//   reply.send({ description });
//
//   // Teacher B later creates a subject with the same name:
//   //   POST /subjects/generate-description  { name: "Marine Biology" }
//   const description2 = await getOrGenerateDescription(request.body.name);
//   // -> cache HIT on "marine biology" — returns Teacher A's generated
//   //    text verbatim, no AI call made. Teacher B saves it as THEIR own
//   //    subject's description_en, independent of Teacher A's copy: either
//   //    can edit their own from here on without touching the other's copy
//   //    or this shared cache row.
//   reply.send({ description: description2 });
//
// The cache row (`description_cache`) only ever holds the original
// AI output for a name; per-user edits live somewhere else entirely and
// never flow back into it. Deleting your own copy and regenerating just
// hands you that same shared cached text again, not a new AI call.
