/**
 * Chain of Responsibility — fallback resolver
 *
 * Source pattern: a localized-field resolver that tries an ordered list of
 * candidate keys until one produces a usable value, falling through to the
 * next candidate on miss. Simplified/anonymized from a real-app helper that,
 * for a field like "title", looked it up in this order: the language-specific
 * key first (`title_es`), then the plain/base key (`title`), then the
 * English key as a last resort (`title_en`).
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

  // A resolved field is either a string or an array — accept both shapes,
  // reject anything else (number, object, boolean) as unusable data.
  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }

  return fallbackValue;
}

// Batch version: same chain, applied per field, with per-item defaults.
//
// `fallbacks` lets each field declare its own type-correct default — an
// array field (e.g. "tags") should miss to `[]`, not resolveField's plain
// `""` default. Without this, a missing array field would resolve to `""`,
// which downstream `.map()` calls can't safely use even behind `?.`.
function resolveFields(
  item: Entity | undefined,
  fieldBases: readonly string[],
  locale: string,
  fallbacks: Record<string, string | unknown[]> = {},
): Record<string, string | unknown[]> {
  const result: Record<string, string | unknown[]> = {};

  for (const fieldBase of fieldBases) {
    result[fieldBase] = resolveField(item, fieldBase, locale, fallbacks[fieldBase] ?? "");
  }

  return result;
}

// --- usage: a component consuming both the single-field and batch chains --
//
// Worked example — resolveField(entity, "title", "es", "Untitled"),
// entity being a card for a capybara. Same three-key chain, different data
// on the entity each row, showing which key wins:
//
// | entity keys present                            | locale | key that wins  | resolved value  |
// |------------------------------------------------|--------|----------------|-----------------|
// | title_es, title, title_en                      | "es"   | title_es       | "Capibara"      |
// | title, title_en (no title_es)                  | "es"   | title          | "Capybara"      |
// | title_en only                                  | "es"   | title_en       | "Capybara"      |
// | title_es: 42 (wrong type), title_en: "Capybara"| "es"   | title_es*      | "Untitled"      |
// | (no title_* keys at all)                       | "es"   | none           | "Untitled"      |
//
// *The `??` chain only skips null/undefined, not wrong types — `title_es`
// being present (even as a number) stops the chain right there, so
// `title_en` is never reached. The type guard then rejects the number and
// falls straight to fallbackValue. That's a real edge case, not a design
// goal: this pattern chains on presence, not validity.
//
// Worked example — resolveFields(entity, ["summary", "habitats"], "es",
// { habitats: [] }) — same capybara entity, but now two fields resolved
// together, each independently walking the three-key chain:
//
// | entity keys present                                                 | locale | summary result                                             | habitats result              |
// |---------------------------------------------------------------------|--------|------------------------------------------------------------|------------------------------|
// | summary_es, summary, summary_en, habitats_es, habitats, habitats_en | "es"   | "Capibara semiacuático de ríos."                           | ["Ríos", "Lagos"]            |
// | summary, habitats (no _es or _en variants)                          | "es"   | "Amphibious rodent near rivers."                           | ["Rivers", "Lakes"]          |
// | summary_en, habitats_en only                                        | "es"   | "Amphibious rodent near rivers."                           | ["Rivers", "Lakes"]          |
// | summary_en only; no habitats_* keys at all                          | "es"   | "Amphibious rodent near rivers."                           | [] (from fallbacks.habitats) |
// | no summary_* or habitats_* keys at all                              | "es"   | "" (resolveFields default, no fallback passed for summary) | [] (from fallbacks.habitats) |
//
// The last two rows are the point of the `fallbacks` param: "summary" has
// no entry in `fallbacks`, so a total miss falls back to resolveField's
// plain `""` default — correct, since summary is string-shaped. "habitats"
// does have an entry (`{ habitats: [] }`), so a total miss falls back to
// `[]` instead of `""` — correct, since habitats is array-shaped and gets
// `.map()`-ed downstream. Without that entry, a missing habitats field
// would resolve to `""`, which is not safely mappable no matter how the
// call site casts it.

function EntityCard({ entity, locale }: { entity: Entity; locale: string }) {
  // Single-field resolution for a field rendered on its own.
  const title = resolveField(entity, "title", locale, "Untitled");

  // Batch resolution for a group of fields rendered together. "habitats"
  // is array-shaped, so it gets an array-shaped fallback — see
  // resolveFields above for why this matters.
  const fields = resolveFields(entity, ["summary", "habitats"], locale, { habitats: [] });

  return (
    <article>
      <h3>{title as string}</h3>
      <p>{fields.summary as string}</p>
      <ul>
        {(fields.habitats as string[]).map((habitat) => (
          <li key={habitat}>{habitat}</li>
        ))}
      </ul>
    </article>
  );
}
