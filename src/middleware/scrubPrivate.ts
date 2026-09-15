// ─── Nothing private leaves, whatever a controller forgets ───────────────────
//
// A last line of defence on every API response: a small set of keys is deleted
// from the JSON body on the way out, everywhere, always.
//
// ── WHY THIS EXISTS WHEN NOTHING IS ACTUALLY LEAKING ────────────────────────
//
// It was not added to fix a leak. It was added because of the SHAPE of the
// protection that was there: 45 of the 48 public read handlers strip the page
// password with a hand-written destructure —
//
//     const { password: _pw, passwordRaw: _pr, ...safeData } = page.toObject();
//
// — repeated, by hand, once per template. That works and it is also exactly the
// pattern this codebase has been bitten by before: forty-something copies of one
// rule, where forgetting a single one is silent and the failure is not a broken
// page but a published secret. `valentine` had already drifted to
// `res.json({ data: page })`, and only got away with it because that model has
// no password field to leak yet.
//
// So the rule moves to one place that cannot be forgotten by a forty-sixth
// controller. The destructures stay — defence in depth means both, not either.
//
// ── WHY THE LIST IS SHORT, AND WHY `email` IS NOT ON IT ─────────────────────
//
// Only keys that are NEVER legitimate in any response to any client. A field
// that is sometimes correct cannot be stripped globally without breaking the
// case where it is correct, and a middleware that silently removes real data is
// a worse bug than the one it prevents.
//
//   · `email` is deliberately absent. `/auth/me`, login and profile all return
//     the signed-in person their OWN address, which is both correct and load
//     bearing. Whether an email is appropriate is contextual, so it is policed
//     at build time by `npm run leak:check` instead, which understands which
//     handlers are public.
//   · `refreshToken` is absent for the same reason: the refresh endpoint exists
//     to hand one over.
//   · `adminNotes` is absent too, and that one was a near miss: it reads as
//     obviously private, and two admin panels render it. See the note on the
//     list itself.
//   · `passwordRaw` IS stripped, with two documented exceptions below — the
//     owner of a page asking for their own unlock word back.
//
// `password` is the bcrypt hash and is never legitimate anywhere. Same for the
// OTP, the token version, and the request metadata kept for abuse
// investigations.

import { NextFunction, Request, Response } from "express";

/**
 * Never correct in a response, anywhere, to anybody.
 *
 * Every entry here was checked against what the client actually reads, because
 * the danger of this file is not the leak it prevents — it is the field it
 * removes from somebody who legitimately needed it. Two candidates were
 * rejected on exactly those grounds and the check was worth doing:
 *
 *   · `adminNotes` looked obviously private and is NOT here, because
 *     /admin/feedback and /admin/contacts both read it back after a PATCH and
 *     render it. Stripping it would have silently broken the notes feature in
 *     two admin panels — the private support note is genuinely the point of
 *     that screen. It only matters that it never reaches a PUBLIC handler,
 *     which is a question about routes, so `leak:check` owns it.
 *   · `email` and `refreshToken`, for the reasons in the header note.
 *
 * `ipAddress`, `userAgent` and `tokenVersion` survive the same test: no client
 * file reads any of the three, they are kept for abuse investigation and token
 * invalidation, and neither has any business crossing the wire.
 */
const ALWAYS_PRIVATE = new Set([
  "password",
  "otp",
  "otpExpiry",
  "ipAddress",
  "userAgent",
  "tokenVersion",
  "__v",
]);

/**
 * The page's unlock word in plaintext. Private everywhere except the two routes
 * that exist to give it back to the person who SET it, so they can pass it on
 * to whoever they sent the card to. Both are owner-scoped and behind `protect`.
 *
 *   · /my-pages/... — `PagePasswordControl` setting or clearing it.
 *   · /share/me/...  — the profile's list of your own pages, which reveals and
 *     copies the word next to each card.
 *
 * The second one is why this is a list and not a single path: the first version
 * allowed only /my-pages and would have silently broken the reveal-and-copy on
 * /profile, which reads from /share/me/creations. Checked against the client
 * rather than assumed.
 *
 * Matched on the mounted path rather than a flag on the response, so a new
 * controller cannot opt itself in by accident.
 */
const PASSWORD_RAW_ALLOWED = /^\/(my-pages|share\/me)\//;

/**
 * Guard rails on the walk itself.
 *
 * A response is a plain JSON tree, but it is built from user-supplied content,
 * so the walk needs a bound. Depth stops a pathological nesting; the visited set
 * stops a cycle. Neither should ever trigger — they exist so that if one does,
 * the response is still sent rather than the process being tied up.
 */
const MAX_DEPTH = 12;

function scrub(value: unknown, allowRaw: boolean, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return value;

  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => scrub(v, allowRaw, depth + 1, seen));
  }

  // Dates, ObjectIds and anything else with a custom serialiser are left alone:
  // walking them would turn a Date into {} on the way out.
  if (value instanceof Date) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (ALWAYS_PRIVATE.has(key)) continue;
    if (key === "passwordRaw" && !allowRaw) continue;
    out[key] = scrub(v, allowRaw, depth + 1, seen);
  }
  return out;
}

/**
 * Wraps `res.json` for everything mounted under it.
 *
 * Returns the scrubbed copy rather than mutating what the controller passed in:
 * a controller may still be holding that object — a Mongoose document's
 * `toObject()` result, say — and deleting fields from underneath it would be a
 * side effect nobody asked for.
 */
export function scrubPrivate(req: Request, res: Response, next: NextFunction): void {
  const original = res.json.bind(res);
  const allowRaw = PASSWORD_RAW_ALLOWED.test(req.path);

  res.json = (body: unknown) => {
    try {
      return original(scrub(body, allowRaw, 0, new WeakSet()));
    } catch (err) {
      // A response that cannot be scrubbed must still be a response. Logged
      // loudly because it means this file has a bug, not the caller.
      console.error("[scrubPrivate] failed, sending unscrubbed", err);
      return original(body);
    }
  };

  next();
}

/** Exported for the test, so the list is asserted rather than described. */
export const __ALWAYS_PRIVATE = ALWAYS_PRIVATE;
