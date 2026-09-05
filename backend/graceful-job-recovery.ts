/**
 * Graceful job recovery — status column + startup sweep
 *
 * Source pattern: a table of async work items with a `status` column
 * (e.g. `processing` / `NULL`/done). Workers set status to `processing`
 * before doing slow work and clear it on success. If the process crashes
 * mid-job, a row is left stuck in `processing`. On every app startup, a
 * sweep query finds those stuck rows and re-fires the job for them.
 * Simplified/anonymized from a real-app AI-content generation pipeline.
 *
 * Shape: recovery isn't a separate retry system — it's "the same startup
 * hook that always runs" re-driving whatever the status column says is
 * still incomplete.
 */

type WorkItem = { id: number; name: string };
type Logger = { info: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void };

const BATCH_SIZE = 3;

/**
 * Processes a batch of items, clearing status back to done on success.
 * Never throws for a single item's failure — the row is simply left in
 * `processing`, so the next startup sweep will retry it.
 */
async function processItems(items: WorkItem[], log: Logger): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async ({ id, name }) => {
        try {
          const result = await generateContent(name);
          await db.query(
            `UPDATE work_items SET result = $1, status = NULL, updated_at = now() WHERE id = $2`,
            [result, id],
          );
        } catch (err) {
          log.error("processItems: failed for id=%d: %s", id, err);
        }
      }),
    );
  }
}

/**
 * Recovery sweep: called once on app startup. Finds anything still marked
 * `processing` from a previous crash/restart and re-fires the job for it,
 * without blocking startup.
 */
async function recoverStuckItems(log: Logger): Promise<void> {
  const { rows } = await db.query<WorkItem>(
    `SELECT id, name FROM work_items WHERE status = 'processing' ORDER BY created_at ASC`,
  );

  if (rows.length === 0) return;

  log.info("recoverStuckItems: found %d items to reprocess", rows.length);
  void processItems(rows, log);
}

// Wired up once, at startup:
//   app.addHook("onReady", () => recoverStuckItems(app.log));

declare const db: { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };
declare function generateContent(name: string): Promise<string>;
