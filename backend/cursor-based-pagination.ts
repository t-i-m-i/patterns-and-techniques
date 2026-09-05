/**
 * Cursor-based pagination — keyset, pushed into SQL
 *
 * Source pattern: an opaque, base64-encoded cursor built from the last
 * row's sort key(s), used to page through results without offset/limit
 * (which drifts under concurrent writes). Simplified/anonymized from a
 * real-app salary-ranked-results endpoint that paginates directly in
 * Postgres by a composite `{ sortValue, id }` cursor, using an "n+1"
 * fetch to detect whether more pages remain.
 *
 * Shape: decode cursor -> pass its fields as query params -> SQL filters,
 * sorts, and limits in one round trip -> if PAGE_SIZE + 1 rows come back,
 * there's a next page, and the cursor for it is built from the last
 * *returned* row.
 *
 * Unlike an in-memory/array version of this pattern, the database never
 * returns more than PAGE_SIZE + 1 rows — there's no full-list fetch or
 * JS-side filter/sort standing in for what the query should be doing.
 */

import type { Pool } from "pg";

type Cursor = { sortValue: number; id: number };
type Row = { id: number; sort_value: number };

const PAGE_SIZE = 20;

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

function decodeCursor(encoded: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
    if (typeof parsed.sortValue === "number" && typeof parsed.id === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function getPage(pool: Pool, candidateIds: number[], cursorParam?: string) {
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor) {
    throw new Error("Invalid cursor");
  }

  // The cursor predicate and ORDER BY/LIMIT live in the query itself, so
  // Postgres does the filtering and sorting — only PAGE_SIZE + 1 rows are
  // ever returned, regardless of how large `candidateIds` is.
  const { rows } = await pool.query<Row>(
    `SELECT id, sort_value
     FROM items
     WHERE id = ANY($1::int[])
       AND ($2::int IS NULL OR sort_value < $2 OR (sort_value = $2 AND id > $3))
     ORDER BY sort_value DESC NULLS LAST, id ASC
     LIMIT $4`,
    [candidateIds, cursor?.sortValue ?? null, cursor?.id ?? null, PAGE_SIZE + 1],
  );

  // Fetch one extra row to know whether another page exists.
  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);

  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem ? encodeCursor({ sortValue: lastItem.sort_value, id: lastItem.id }) : null;

  return { items, nextCursor };
}

// Wired up in a route handler — the client only ever sees an opaque string,
// never an offset:
//   const { items, nextCursor } = await getPage(pool, candidateIds, request.query.cursor);
//   reply.send({ items, nextCursor });
