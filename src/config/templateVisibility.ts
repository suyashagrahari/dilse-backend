// ─── Which templates are live on this deployment ─────────────────────────────
//
// The rule, in one line:
//
//     live(slug) = row in TemplateVisibility ? row.live : !DEFAULT_HIDDEN.has(slug)
//
// So a template is live unless somebody said otherwise, and the two ways to say
// otherwise are an admin toggle (per deployment, in the database) or this file
// (everywhere, until an admin overrides it).
//
// ── WHY A CODE-LEVEL DEFAULT AT ALL, WHEN THE POINT IS ADMIN CONTROL ────────
//
// Because of the gap between a deploy and a decision. A brand-new template
// arrives in production the moment its code does, and if the default were "live"
// it would be in the gallery — in front of everyone — for however many minutes it
// takes an admin to notice and switch it off. Whatever was wrong with it that
// made it worth holding back is then wrong in public.
//
// The reverse default is worse: "hidden unless a row says live" empties the whole
// gallery on the first deploy after this ships, because none of the fifty
// templates already in production has a row yet.
//
// So the default is per-template and lives in code, which is the only place that
// knows a template is new. Add a slug here in the same commit that adds the
// template; remove it once it has shipped and the admin has a row for it.
//
// ── A SLUG IN THIS LIST IS NOT HIDDEN FOREVER ───────────────────────────────
//
// An admin row always wins, in both directions. Turning the rakhi page on in
// staging writes `live: true` there and this list stops mattering for that
// deployment. That is the intended workflow: ship hidden, switch on per
// environment when it is ready.

import TemplateVisibility from "../models/TemplateVisibility";
import { isApexDeployment } from "./env";

/**
 * Templates that stay hidden until an admin turns them on, per deployment.
 *
 * These three are here because they are new and dated: Raksha Bandhan 2026 is
 * 28 August and Ganesh Chaturthi 2026 is 14 September, and a festival page is
 * worth showing when it is ready and not a day before. Everything else in the
 * app predates this mechanism and is live by default — do not add existing
 * templates here to "tidy up", it would hide them from production the moment
 * their admin rows are ever deleted.
 */
export const DEFAULT_HIDDEN: ReadonlySet<string> = new Set([
  "happy-rakshabandhan-to-brother",
  "happy-rakshabandhan-to-sister",
  "happy-ganesh-chaturthi",
]);

/**
 * The default, before any admin has an opinion.
 *
 * ── WHY THE DEFAULT ONLY BITES ON THE PUBLIC SITE ───────────────────────────
 *
 * `DEFAULT_HIDDEN` exists to stop a brand-new template appearing in front of
 * everyone the moment its code deploys. That reasoning applies to the apex domain
 * and nowhere else: on staging and on a laptop, a new template being visible is
 * the entire point — it is what the people reviewing it need to open.
 *
 * If this ignored the deployment, shipping a template would hide it from the very
 * environment it is supposed to be tested in, and somebody would have to remember
 * to switch it on there by hand every time. So: held back on the public site,
 * open everywhere else, and an admin row still overrules this on either.
 *
 * `isApexDeployment()` and not `env.IS_PROD` — staging reports itself as
 * production. See the note on that function.
 */
export const defaultLive = (slug: string): boolean =>
  isApexDeployment() ? !DEFAULT_HIDDEN.has(slug) : true;

// ── The cache ───────────────────────────────────────────────────────────────
//
// Every page create and every gallery load asks this question, and the answer
// changes only when an admin flips a switch — which is a handful of times in the
// life of the deployment. A short TTL keeps the read off the database without
// making the admin wait: the mutation paths call `invalidateVisibilityCache()`,
// so a toggle in the admin screen is visible immediately on the host that served
// it, and the TTL is only there to catch a second instance behind a load
// balancer that did not handle the write.
const TTL_MS = 30_000;

let cache: { rows: Map<string, boolean>; at: number } | null = null;

export function invalidateVisibilityCache(): void {
  cache = null;
}

async function rows(): Promise<Map<string, boolean>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.rows;

  const docs = await TemplateVisibility.find({}).select("slug live").lean();
  const map = new Map<string, boolean>();
  for (const d of docs) map.set(String(d.slug), Boolean(d.live));
  cache = { rows: map, at: now };
  return map;
}

/** Is this template live on this deployment? Unknown slugs take the default. */
export async function isTemplateLive(slug: string): Promise<boolean> {
  if (!slug) return false;
  const map = await rows();
  const row = map.get(slug.toLowerCase());
  return row === undefined ? defaultLive(slug) : row;
}

/**
 * Every slug that is NOT live, for the client to filter its gallery with.
 *
 * Returns the hidden ones rather than the live ones on purpose. The catalogue
 * lives in the client and runs to fifty-odd entries; the hidden list is normally
 * one or two. Sending the short list also makes the client's failure mode the
 * safe one — if this request fails it has an empty list and shows everything it
 * already had, rather than an empty gallery.
 */
export async function hiddenSlugs(): Promise<string[]> {
  const map = await rows();
  const hidden = new Set<string>();

  // The code-level defaults first — and only where they apply, which is the
  // public site. See `defaultLive`.
  if (isApexDeployment()) for (const slug of DEFAULT_HIDDEN) hidden.add(slug);
  // …then let admin rows overrule them in both directions.
  for (const [slug, live] of map) {
    if (live) hidden.delete(slug);
    else hidden.add(slug);
  }

  return [...hidden].sort();
}
