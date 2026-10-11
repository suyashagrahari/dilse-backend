// ─── Does this person publish priced templates free? ─────────────────────────
//
// Two answers live here, both facts about a PERSON (never a template, never a
// request):
//
//   "super_admin"  The account is a super admin and has NOT switched on
//                  "Pay like a customer". Super admins publish free by default —
//                  they own the prices — and flip the switch only to test a real
//                  checkout end to end.
//
//   "free_access"  A super admin granted this account "All templates free"
//                  (influencers, mostly). Every priced template publishes free.
//
// The publish gate (rule 4b), the paywall quote, create-order and spend-points
// all read `freeEntitlementFor`, so the price a user is shown and whether they are
// charged can never disagree.
//
// ── IMPERSONATION ───────────────────────────────────────────────────────────
//
// Keyed on the userId the caller passes, which under impersonation is the
// IMPERSONATED user (`protect` resolves req.userId to them). Nothing here reads
// `req.userRole` or `req.impersonatorId`, so a super admin viewing as somebody
// never makes that somebody free.
//
// ── FAIL CLOSED ─────────────────────────────────────────────────────────────
//
// A failed read answers "not entitled": the user sees the ordinary paywall, which
// is the state that existed before this file did. Failing open would hand every
// user free publishing during a database blip.

import mongoose from "mongoose";
import User from "../models/User";

export type FreeEntitlement = "super_admin" | "free_access";

export interface EntitlementFields {
  role?: string | null;
  paysAsCustomer?: boolean | null;
  freeAccess?: { enabled?: boolean | null } | null;
}

/** The pure rule, so it can be unit-tested without a database. */
export function entitlementFrom(user: EntitlementFields | null | undefined): FreeEntitlement | null {
  if (!user) return null;
  if (user.role === "superadmin" && !user.paysAsCustomer) return "super_admin";
  if (user.freeAccess?.enabled === true) return "free_access";
  return null;
}

const TTL_MS = 30_000;
const cache = new Map<string, { value: FreeEntitlement | null; at: number }>();

/** Drop the cached answer for one user after a toggle, or for everybody. */
export function invalidateEntitlement(userId?: string): void {
  if (userId) cache.delete(String(userId));
  else cache.clear();
}

/**
 * The entitlement for one user. `fresh` skips the cache — the order and points
 * paths, where a stale "free" would refuse a payment that is now owed (harmless)
 * and a stale "owes" would take money that is no longer owed (not harmless).
 */
export async function freeEntitlementFor(
  userId: string | undefined | null,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<FreeEntitlement | null> {
  const key = String(userId || "");
  if (!key || !mongoose.Types.ObjectId.isValid(key)) return null;

  const now = Date.now();
  if (!fresh) {
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) return hit.value;
  }

  try {
    const user = await User.findById(key).select("role paysAsCustomer freeAccess").lean<EntitlementFields>();
    const value = entitlementFrom(user);
    cache.set(key, { value, at: now });
    return value;
  } catch (err) {
    console.error("[freeAccess] entitlement read failed, treating as none:", err);
    return null;
  }
}

// ── Request-body validation for the two super-admin PUTs ─────────────────────

export const FREE_ACCESS_NOTE_MAX = 200;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** PUT /admin/super/me/pays — `{ paysAsCustomer: boolean }`, nothing else accepted. */
export function parsePaysBody(body: unknown): Parsed<{ paysAsCustomer: boolean }> {
  const v = (body as { paysAsCustomer?: unknown } | null | undefined)?.paysAsCustomer;
  if (typeof v !== "boolean") return { ok: false, error: "paysAsCustomer must be true or false" };
  return { ok: true, value: { paysAsCustomer: v } };
}

/** PUT /admin/super/users/:userId/free-access — `{ enabled: boolean, note?: string }`. */
export function parseFreeAccessBody(body: unknown): Parsed<{ enabled: boolean; note: string }> {
  const b = (body ?? {}) as { enabled?: unknown; note?: unknown };
  if (typeof b.enabled !== "boolean") return { ok: false, error: "enabled must be true or false" };
  if (b.note !== undefined && b.note !== null && typeof b.note !== "string") {
    return { ok: false, error: "note must be text" };
  }
  const note = String(b.note ?? "").trim();
  if (note.length > FREE_ACCESS_NOTE_MAX) {
    return { ok: false, error: `note must be ${FREE_ACCESS_NOTE_MAX} characters or fewer` };
  }
  return { ok: true, value: { enabled: b.enabled, note } };
}
