import User from "../models/User";

/**
 * Live account state for `protect`.
 *
 * ── WHY A CACHE EXISTS AT ALL ───────────────────────────────────────────────
 *
 * `protect` used to be pure JWT verification and touched no database. Suspending
 * an account by writing a field would therefore have done nothing until the
 * token expired — and access tokens live a day, refresh tokens a month. A ban
 * that takes effect tomorrow is not a ban.
 *
 * So the check has to be live. Doing it as a query on every authenticated
 * request adds a round trip to every request in the product, which is a real
 * cost to pay for a field that changes a few times a year. This cache is the
 * middle: one read per user per TTL window, so a ban lands within TTL seconds
 * instead of 24 hours, and the steady-state cost is a Map lookup.
 *
 * Mutating endpoints call `invalidateUser` so a ban the admin just applied is
 * effective immediately rather than up to TTL later.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────
 *
 * Per-process, so with N app instances a ban lands within TTL on the instances
 * that did not serve the request. That is acceptable at one container and is
 * the first thing to revisit when this scales out — the replacement is Redis
 * with the same interface, not a different call site.
 */

const TTL_MS = 30_000;

export interface AccountSnapshot {
  status: "active" | "suspended" | "banned";
  tokenVersion: number;
  role: string;
  email: string;
  suspendedUntil?: Date | null;
}

const cache = new Map<string, { snap: AccountSnapshot; expiresAt: number }>();

export function invalidateUser(userId: string): void {
  cache.delete(String(userId));
}

export function invalidateAll(): void {
  cache.clear();
}

export async function getAccountSnapshot(userId: string): Promise<AccountSnapshot | null> {
  const key = String(userId);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.snap;

  const user = await User.findById(key)
    .select("status tokenVersion role email suspendedUntil")
    .lean<{
      status?: AccountSnapshot["status"];
      tokenVersion?: number;
      role?: string;
      email?: string;
      suspendedUntil?: Date | null;
    }>();

  if (!user) {
    cache.delete(key);
    return null;
  }

  const snap: AccountSnapshot = {
    // Documents written before these fields existed have neither, so both
    // default here as well as in the schema — a user who has not been saved
    // since the migration must not read as suspended.
    status: user.status || "active",
    tokenVersion: user.tokenVersion ?? 0,
    role: user.role || "normal",
    email: user.email || "",
    suspendedUntil: user.suspendedUntil ?? null,
  };

  cache.set(key, { snap, expiresAt: Date.now() + TTL_MS });
  return snap;
}

/**
 * A suspension with a past `suspendedUntil` has served its term. Reported
 * rather than written back, so a read path never needs a write; the stored
 * field is tidied the next time an admin touches the account.
 */
export function isCurrentlyBlocked(snap: AccountSnapshot): false | "suspended" | "banned" {
  if (snap.status === "banned") return "banned";
  if (snap.status === "suspended") {
    if (snap.suspendedUntil && snap.suspendedUntil.getTime() <= Date.now()) return false;
    return "suspended";
  }
  return false;
}
