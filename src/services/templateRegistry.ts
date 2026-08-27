import mongoose from "mongoose";
import { TEMPLATE_LOOKUPS } from "../controllers/share.controller";
import { templateLabel, templateApiBase } from "../config/templateCatalog";

/**
 * Addressing a page when you know only `(templateType, pageId)`.
 *
 * Admin surfaces are the one place that must operate on any of the ~43 page
 * collections without knowing which. Everything here DERIVES from
 * `TEMPLATE_LOOKUPS`, which is already the single list of which templates
 * exist. Adding a template to that list is the only step required for it to
 * appear in the admin panel, be searchable, have its password reset and be
 * deletable — there is deliberately no second list to keep in sync, because
 * the last one drifted to 30-of-43 missing before anybody noticed.
 */

export interface TemplateEntry {
  model: mongoose.Model<unknown>;
  templateType: string;
  label: string;
  editorRoute: string;
  apiBase: string;
}

export const TEMPLATE_REGISTRY: TemplateEntry[] = TEMPLATE_LOOKUPS.map((l) => ({
  model: l.model,
  templateType: l.templateType,
  label: templateLabel(l.templateType),
  editorRoute: l.editorRoute,
  apiBase: templateApiBase(l.templateType),
}));

const BY_TYPE = new Map(TEMPLATE_REGISTRY.map((t) => [t.templateType, t]));

export function templateByType(templateType: string): TemplateEntry | undefined {
  return BY_TYPE.get(templateType);
}

/**
 * Find a page by id when the caller did not say which template it belongs to.
 *
 * Queries every collection in parallel and returns the first hit. Ids are
 * ObjectIds and collision across collections is not a practical concern, so
 * "first hit" is unambiguous in practice.
 *
 * Prefer `templateByType` whenever the type is known: this is 43 queries and
 * exists for the delete-by-id route, which historically received only a page id.
 */
export async function findPageAnywhere(pageId: string): Promise<
  { entry: TemplateEntry; doc: mongoose.Document } | null
> {
  if (!mongoose.Types.ObjectId.isValid(pageId)) return null;

  const results = await Promise.all(
    TEMPLATE_REGISTRY.map(async (entry) => {
      const doc = await entry.model.findById(pageId);
      return doc ? { entry, doc: doc as mongoose.Document } : null;
    })
  );
  return results.find(Boolean) || null;
}

/**
 * Whether a template's documents carry a share password at all.
 *
 * Read off the compiled schema rather than a hand-kept list, so a template that
 * gains or loses password support is described correctly without anyone
 * remembering to update this file.
 */
export function supportsPassword(entry: TemplateEntry): boolean {
  return !!entry.model.schema.path("password");
}

export function supportsPasswordRaw(entry: TemplateEntry): boolean {
  return !!entry.model.schema.path("passwordRaw");
}
