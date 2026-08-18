import { SCHEMAS } from "./registry.generated";
import { validateSchema, type AiFillTemplateSchema } from "./types";

// ─── The schema registry ─────────────────────────────────────────────────────
//
// One lookup table, built once at module load, plus a validation pass over
// everything in it.
//
// The validation is deliberately NOT fatal. A schema with a bad path or a
// missing guide breaks exactly one template's fill button; throwing here would
// instead take down the whole API, including every route that has nothing to do
// with this feature. So a broken schema is loud in the boot log and dead on
// arrival for its own slug, and the server still serves.

export * from "./types";

export const ALL_SCHEMAS: readonly AiFillTemplateSchema[] = SCHEMAS;

const BY_SLUG = new Map<string, AiFillTemplateSchema>();

for (const schema of SCHEMAS) {
  // A duplicate slug means two files claim the same template; whichever loses
  // is silently unreachable, which is a miserable thing to debug from the
  // outside, so name it here.
  if (BY_SLUG.has(schema.slug)) {
    console.error(`[aiFill] duplicate schema slug "${schema.slug}" — the later one wins`);
  }
  BY_SLUG.set(schema.slug, schema);

  const problems = validateSchema(schema);
  if (problems.length > 0) {
    console.error(
      `[aiFill] schema "${schema.slug || "(no slug)"}" has ${problems.length} problem(s):`
    );
    for (const p of problems) console.error(`  • ${p}`);
  }
}

/** The schema for a template, or null when the slug has no fill support yet. */
export function getSchema(slug: string): AiFillTemplateSchema | null {
  if (typeof slug !== "string" || !slug) return null;
  return BY_SLUG.get(slug) ?? null;
}
