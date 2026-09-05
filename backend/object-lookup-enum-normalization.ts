/**
 * Object lookup — enum normalization with fallback
 *
 * Source pattern: a plain `Record<string, string>` mapping raw/loosely
 * structured input values (from user input, an import, an external API)
 * to normalized, human-readable or canonical values, with `??` falling
 * back to the raw input when the key isn't recognized. Simplified/
 * anonymized from a real-app "post-school plan" label formatter.
 *
 * Shape: a lookup table replaces a switch/if-else chain, and the fallback
 * means an unrecognized value degrades gracefully instead of throwing or
 * rendering nothing.
 */

const PLAN_LABELS: Record<string, string> = {
  university: "university",
  apprenticeship: "an apprenticeship",
  "straight-to-work": "going straight into work",
  internship: "an internship",
  "gap-year": "a gap year",
  "not-sure-yet": "exploring different options",
};

function formatPlanLabel(rawPlan: string): string {
  // Object lookup instead of a switch statement; unknown values pass through
  // unchanged rather than being dropped or throwing.
  return PLAN_LABELS[rawPlan] ?? rawPlan;
}

// Called while serializing a row for the response — normalization stays a
// one-line concern at the boundary, not scattered through the query layer:
//   reply.send({ ...student, planLabel: formatPlanLabel(student.plan) });
