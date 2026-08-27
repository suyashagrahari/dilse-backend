// ─── Roles and the super-admin identity ──────────────────────────────────────
//
// Before this file, the super-admin was an email string literal duplicated in
// `models/User.ts` and `controllers/admin.controller.ts`. Two copies of an
// identity check is one copy too many: whichever one you find first is the one
// you believe, and nothing tells you the other exists. It lives here now, and
// both callers import it.
//
// ── WHY A TIER ABOVE `admin` ────────────────────────────────────────────────
//
// `admin` already existed and is handed out to staff who moderate contacts and
// flip template visibility. The capabilities added alongside this file — reading
// a recipient's password, adjusting points, banning an account, signing in AS
// somebody — are a different kind of power, so they get a different role rather
// than quietly widening what `admin` means for everyone who already has it.

export const SUPER_ADMIN_EMAIL = "suyashagrahari2121@gmail.com";

export type UserRole = "normal" | "member" | "admin" | "superadmin";

export const USER_ROLES: UserRole[] = ["normal", "member", "admin", "superadmin"];

/**
 * Roles ordered by privilege. Compare with `roleAtLeast` rather than `===`, so
 * a superadmin passes every `admin` gate without each gate listing both roles.
 */
const RANK: Record<UserRole, number> = {
  normal: 0,
  member: 1,
  admin: 2,
  superadmin: 3,
};

export function roleAtLeast(role: string | undefined, min: UserRole): boolean {
  const r = RANK[(role || "normal") as UserRole];
  return r !== undefined && r >= RANK[min];
}

export function isSuperAdminEmail(email: string | undefined): boolean {
  return !!email && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}
