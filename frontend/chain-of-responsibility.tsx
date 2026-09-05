/**
 * Chain of Responsibility — fallback resolver
 *
 * Source pattern: a localized-field resolver that tries an ordered list of
 * candidate keys until one produces a usable value, falling through to the
 * next candidate on miss. Simplified/anonymized from a real-app helper that
 * resolved `<field>_<lang>` -> `<field>` -> `<field>_en`.
 *
 * Shape: instead of one handler solving the whole problem, a sequence of
 * cheap, ordered attempts is tried; each either resolves the value or
 * defers ("passes the request") to the next one via `??`.
 */

type Entity = Record<string, unknown>;

function resolveField(
  item: Entity | undefined,
  fieldBase: string,
  locale: string,
  fallbackValue: string | unknown[] = "",
): string | unknown[] {
  if (!item) return fallbackValue;

  const localizedKey = `${fieldBase}_${locale}`;
  const baseKey = fieldBase;
  const defaultLocaleKey = `${fieldBase}_en`;

  // Chain of fallback "handlers", tried in order until one is non-nullish.
  const value = item[localizedKey] ?? item[baseKey] ?? item[defaultLocaleKey];

  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }

  return fallbackValue;
}

// Batch version: same chain, applied per field, with per-item defaults.
function resolveFields(
  item: Entity | undefined,
  fieldBases: readonly string[],
  locale: string,
): Record<string, string | unknown[]> {
  const result: Record<string, string | unknown[]> = {};

  for (const fieldBase of fieldBases) {
    result[fieldBase] = resolveField(item, fieldBase, locale);
  }

  return result;
}

// --- usage: a component consuming both the single-field and batch chains --

type CardEntity = Entity & { title_en?: string };

function EntityCard({ entity, locale }: { entity: CardEntity; locale: string }) {
  // Single-field resolution for a field rendered on its own.
  const title = resolveField(entity, "title", locale, "Untitled");

  // Batch resolution for a group of fields rendered together.
  const fields = resolveFields(entity, ["summary", "tags"], locale);
  
  return (
    <article>
      <h3>{title as string}</h3>
      <p>{fields.summary as string}</p>
      <ul>
        {(fields.tags as string[] | undefined)?.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
    </article>
  );
}
