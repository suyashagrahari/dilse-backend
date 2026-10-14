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
//
// ── LIVE IS NOT THE SAME AS REACHABLE ───────────────────────────────────────
//
// Two questions, two functions, and they must not be conflated:
//
//     live(slug)      = the rule above — is it LISTED in the general gallery
//                       (/templates, home carousels, search, sitemap, promos)?
//                       `hiddenSlugs()` is the complement, for those filters.
//
//     reachable(slug) = live(slug) || slug ∈ activeDrop
//                       may its builder open and may it be created/published?
//
// `activeDrop` is the active mode's drop slugs while the mode has a drop —
// "halloween", "dandiya" or "diwali" (see
// `dropSlugs` in config/seasonSale.ts). That lets the owner hide a template
// from the gallery in /admin/templates and still sell it through the drop on
// /halloween-offer, /dandiya-offer or /diwali-offer: hidden from listing, open to anyone who follows the drop.
// When the mode is "valentine" or "off" there is no drop and reachable == live.
//
// Per-user early-access grants sit on top of `reachable`, in
// config/templateAccess.ts (`canUseTemplate`) — a private fact, kept out of
// this public module on purpose.
//
// Caching: `live` is cached here (invalidated by the visibility admin writes);
// the drop half reads `getSeasonSettings()`, whose cache the season PUT clears.
// Nothing new is cached for reachability itself, so there is no third cache to
// forget to invalidate.

import TemplateVisibility from "../models/TemplateVisibility";
import { isApexDeployment } from "./env";
import { isInDrop, type SeasonView } from "./seasonSale";
import { getSeasonSettings } from "../services/seasonSettings.service";

/**
 * Templates that stay hidden until an admin turns them on, per deployment.
 *
 * These two are here because they are new and dated: Raksha Bandhan 2026 is
 * 28 August, and a festival page is worth showing when it is ready and not a
 * day before. Everything else in the app predates this mechanism and is live by
 * default — do not add existing templates here to "tidy up", it would hide them
 * from production the moment their admin rows are ever deleted.
 *
 * ── WHY GANESH CHATURTHI IS NOT IN THIS LIST ANY MORE ───────────────────────
 *
 * It has shipped, which is exactly the condition the note above the list gives
 * for taking a slug out again. It is in the gallery on the apex today, its
 * guide is published at /guides/happy-ganesh-chaturthi, and the walkthrough is
 * public on YouTube and Instagram with the template's URL in the description.
 *
 * Leaving it in would not have held anything back — it would have BROKEN it.
 * The routes in ganeshChaturthiPage.routes.ts gate POST / and POST /:id/publish
 * on this, so on the apex, with no admin row, every publish would answer
 * 403 TEMPLATE_NOT_LIVE. Publishing is already failing in production for the
 * simpler reason that these routes were never deployed at all; shipping them
 * with the slug still listed would have swapped one failure for another and
 * made it look like the deploy had not worked.
 */
export const DEFAULT_HIDDEN: ReadonlySet<string> = new Set([
  "happy-rakshabandhan-to-brother",
  "happy-rakshabandhan-to-sister",
  // Valentine's week ships hidden; the super admin releases each day in
  // /admin/templates when it is ready (only bites on the apex — see below).
  "happy-rose-day",
  "happy-propose-day",
  "happy-chocolate-day",
  "happy-teddy-day",
  "happy-promise-day",
  "happy-hug-day",
  "happy-kiss-day",
  "happy-valentines-day",
  // Halloween ships hidden the same way; released in /admin/templates.
  "happy-halloween",
  // Be My Dandiya Partner (Navratri) ships hidden the same way.
  "dandiya-partner",
  // Diwali ships hidden the same way.
  "happy-diwali",
  // I'm Sorry ships hidden the same way; released (and priced) by the super admin.
  "sorry",
  // Happy Birthday ships hidden the same way; released (and priced) by the super admin.
  "happy-birthday",
  // Birthday Surprise ✦ Premium ships hidden the same way; released (and priced) by the super admin.
  "birthday-premium",
  // Miss You ships hidden the same way; released (and priced) by the super admin.
  "miss-you",
  // Will You Be Mine ships hidden the same way; released (and priced) by the super admin.
  "will-you-be-mine",
  // Miss You ✦ Premium ships hidden the same way; released (and priced) by the super admin.
  "miss-you-premium",
  // I'm Sorry ✦ Premium ships hidden the same way; released (and priced) by the super admin.
  "sorry-premium",
  // The Proposal ✦ Premium ships hidden the same way; released (and priced) by the super admin.
  "proposal-premium",
  // Happy Anniversary ships hidden the same way; released (and priced) by the super admin.
  "happy-anniversary",
  // Anniversary ✦ Premium ships hidden the same way; released (and priced) by the super admin.
  "anniversary-premium",
  // The ultra-premium tier ships hidden too; each twin is released on its own.
  "happy-rose-day-premium",
  "happy-propose-day-premium",
  "happy-chocolate-day-premium",
  "happy-teddy-day-premium",
  "happy-promise-day-premium",
  "happy-hug-day-premium",
  "happy-kiss-day-premium",
  "happy-valentines-day-premium",
  "happy-halloween-premium",
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
 * The pure reachability rule — `live || inDrop` — split out so it can be tested
 * without a database. See the header note.
 */
export function reachableFrom(slug: string, live: boolean, season: SeasonView | null | undefined): boolean {
  if (!slug) return false;
  return live || isInDrop(slug, season);
}

/**
 * May this template's builder open and its pages be created and published,
 * for everybody? True when it is live in the gallery OR in the active drop —
 * with the India/abroad split on, the drop of EITHER side's mode (`dropSlugs`),
 * so a shared link opens wherever its recipient is. Reachability is never
 * per visitor; only the sale is.
 * Use this, never `isTemplateLive`, for access guards; `isTemplateLive` and
 * `hiddenSlugs` are for LISTING only.
 */
export async function isTemplateReachable(slug: string): Promise<boolean> {
  if (!slug) return false;
  if (await isTemplateLive(slug)) return true;
  // Never throws: a failed season read returns the defaults.
  return reachableFrom(slug, false, await getSeasonSettings());
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
