// ─── May this person use this template? ──────────────────────────────────────
//
// The one place that question is answered, for the builder gate, the write gate
// and the publish paywall alike.
//
//     canUseTemplate(userId, slug) = isTemplateReachable(slug) || hasGrant(userId, slug)
//
// So a template is usable if it is reachable for everybody — live in the
// gallery, or in the active seasonal drop (see the note at the top of
// templateVisibility.ts) — OR if this particular person has been given early
// access to it. Nothing else grants access.
//
// ── WHY THIS IS NOT IN templateVisibility.ts ────────────────────────────────
//
// Because they answer different questions with different cacheability, and the
// bug this design exists to avoid is conflating them. `isTemplateLive` is a fact
// about the DEPLOYMENT: the same for every visitor, safe to cache once and serve
// to everybody, which is exactly what `GET /api/template-visibility` does with a
// 60s public cache. A grant is a fact about a PERSON. Put it behind that same
// endpoint and a CDN hands one user's access to the next.
//
// Keeping them in separate modules keeps that distinction visible at every call
// site: anything reading `templateVisibility` is asking a public question, and
// anything reading this file is asking a private one.
//
// ── FAIL CLOSED HERE, OPEN THERE ────────────────────────────────────────────
//
// `isTemplateLive` fails OPEN — a database hiccup must not make a live template
// unreachable for everyone, and its own comment says so.
//
// The grant half fails CLOSED. If this read throws, `hasGrant` is false, the
// hidden template stays hidden, and the user sees the ordinary "not available
// yet". The alternative — failing open on a grant — would let a blip admit
// everybody to an unreleased template, which is the one outcome hiding it was
// meant to prevent. The two halves fail in opposite directions on purpose.

import mongoose from "mongoose";
import TemplateGrant from "../models/TemplateGrant";
import { isTemplateReachable } from "./templateVisibility";

const TTL_MS = 30_000;

/**
 * Keyed per user, not one map of the whole collection.
 *
 * The question asked here is always about one person, and there is no bound on
 * how many grants exist across all users. Caching per user means a busy tester's
 * repeated writes cost one read between them, and a user with no grants costs one
 * read and then nothing.
 */
const cache = new Map<string, { slugs: Set<string>; at: number }>();

/**
 * Drop cached grants — for one user after their grants change, or all of them.
 *
 * The mutation endpoints call this with the affected userId. The no-argument form
 * exists for the bulk paths and for tests.
 */
export function invalidateGrantCache(userId?: string): void {
  if (userId) cache.delete(String(userId));
  else cache.clear();
}

/**
 * Every template slug this user has been granted early access to.
 *
 * An empty set on failure — see the note above on failing closed. Deliberately
 * does NOT cache a failed read: an empty set cached for 30s would turn a blip
 * into half a minute of a granted client being locked out of their own demo.
 */
export async function grantedSlugsFor(userId: string | undefined | null): Promise<Set<string>> {
  const key = String(userId || "");
  if (!key || !mongoose.Types.ObjectId.isValid(key)) return new Set();

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.slugs;

  try {
    const rows = await TemplateGrant.find({ userId: key }).select("slug").lean();
    const slugs = new Set(rows.map((r) => String(r.slug)));
    cache.set(key, { slugs, at: now });
    return slugs;
  } catch (err) {
    console.error("[templateAccess] grant read failed, treating as no grants:", err);
    return new Set();
  }
}

/** Has this user been granted early access to this template? */
export async function hasGrant(
  userId: string | undefined | null,
  slug: string
): Promise<boolean> {
  const key = String(slug || "").trim().toLowerCase();
  if (!key || !userId) return false;
  return (await grantedSlugsFor(userId)).has(key);
}

/**
 * The whole question: may this person use this template?
 *
 * `isTemplateReachable` first, and short-circuited, because it is the answer for
 * every user on all but a couple of templates and it is served from a cache that
 * is already warm. The grant read only happens for a template that is actually
 * held back.
 */
export async function canUseTemplate(
  userId: string | undefined | null,
  slug: string
): Promise<boolean> {
  if (await isTemplateReachable(slug)) return true;
  return hasGrant(userId, slug);
}
