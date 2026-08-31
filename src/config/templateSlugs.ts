// ─── templateType ↔ slug ─────────────────────────────────────────────────────
//
// The gate is handed a `templateType`. Pricing rows are keyed by slug, because
// the admin panel, the gallery and `client/data/template-registry.ts` all key on
// slug and a price is only useful if all three agree which template it is on.
// So exactly one translation is needed, and this is it.
//
// ── WHY DERIVED AND NOT A SECOND LIST ───────────────────────────────────────
//
// `TEMPLATE_LOOKUPS` already carries both halves: `templateType: "eid"` and
// `editorRoute: "/eid-mubarak"`, and the slug is the editor route minus its
// leading slash. A hand-written map here would be a second list to keep in step,
// and the failure mode of forgetting is a template priced against a slug that
// nothing reads — a price the panel shows and nobody is charged.
//
// ── WHY IMPORTING share.controller IS SAFE HERE ─────────────────────────────
//
// `TEMPLATE_LOOKUPS` lives in a controller and pulls in every page model, so
// importing it drags mongoose into whatever imports this. That is fine for the
// gate and the payment controller, which already have mongoose loaded. It is NOT
// fine for `pricingMath.ts`, which is why the arithmetic lives in its own file
// with no imports at all — the admin panel's preview and the unit tests need the
// maths without the models.

import { TEMPLATE_LOOKUPS } from "../controllers/share.controller";

const typeToSlug = new Map<string, string>();
const slugToTypes = new Map<string, string[]>();

for (const { templateType, editorRoute } of TEMPLATE_LOOKUPS) {
  const type = String(templateType || "").trim().toLowerCase();
  const slug = String(editorRoute || "").replace(/^\/+/, "").trim().toLowerCase();
  if (!type || !slug) continue;

  typeToSlug.set(type, slug);

  const list = slugToTypes.get(slug) ?? [];
  if (!list.includes(type)) list.push(type);
  slugToTypes.set(slug, list);
}

/**
 * The slug a templateType is priced under.
 *
 * An unknown templateType returns itself rather than throwing: a template can
 * reach the publish gate before anybody adds it to `TEMPLATE_LOOKUPS`, and the
 * right outcome then is the free default, not a 500 on Publish.
 *
 * Lower-cased on the way in for the same reason. A mis-cased `"EID"` that missed
 * the map would resolve to a slug with no pricing row, which reads as free — a
 * publish nobody was charged for.
 */
export function slugForTemplateType(templateType: string): string {
  const key = String(templateType || "").trim().toLowerCase();
  if (!key) return "";
  return typeToSlug.get(key) ?? key;
}

/**
 * Every templateType that shares a slug — currently only `birthday-gf`, served
 * by both `birthday` and `birthday-gf`. Both take the same price, which is what
 * you want: they are one template in the gallery.
 */
export function templateTypesForSlug(slug: string): string[] {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return [];
  return slugToTypes.get(key) ?? [];
}

/** For the invariant tests, and for the panel to know what is priceable. */
export function allTemplateTypeSlugPairs(): Array<{ templateType: string; slug: string }> {
  return [...typeToSlug].map(([templateType, slug]) => ({ templateType, slug }));
}
