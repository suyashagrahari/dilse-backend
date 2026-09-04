// ─── Linking a feedback item or a conversation to its author's account ───────
//
// The admin panels show a name and an email and, until now, no way to get from
// either to the account behind it — you copied the address and searched
// /admin/users. This answers "whose profile does this row open?" for a whole
// page in one query.
//
// ── WHY IT IS NOT JUST `row.userId` ─────────────────────────────────────────
//
// Two cases that shape does not cover, both real:
//
//   1. A conversation may have NO userId. An unmatched inbound thread is
//      opened from an email address alone — that is what "unmatched" means:
//      somebody wrote in and nothing we held matched them. `User.email` is
//      unique, lowercase and indexed, so resolving the address is exact rather
//      than a guess, and it is the only way those rows ever get a link.
//
//   2. The account may be GONE. `PageFeedback.userId` is a plain ObjectId ref
//      with no cascade behind it, so deleting a user leaves their feedback
//      pointing at nothing. Rendering a link from that id gives a 404, which
//      reads as the panel being broken rather than as the account being gone.
//      So existence is checked, and a row with no live account simply has no
//      button.
//
// ── WHY ONE QUERY, NOT ONE PER ROW ──────────────────────────────────────────
//
// The feedback list is paginated at up to 100 and the conversation list at 25.
// A lookup per row is 100 round trips to Mongo for a screen someone is waiting
// on — the same mistake `getMyCreations` was fixed for earlier. Every candidate
// id and address across the page goes into a single `$or`.

import mongoose from "mongoose";
import User from "../models/User";
import { env } from "../config/env";

/** A row that might belong to somebody. */
export interface ProfileSubject {
  userId?: unknown;
  userEmail?: unknown;
}

/** What the batched query found: which accounts exist, and their addresses. */
export interface LiveAccounts {
  ids: Set<string>;
  byEmail: Map<string, string>;
}

/**
 * Pull a bare address out of whatever a mail header contained.
 *
 * `"Asha Verma" <asha@example.com>` is a legal From and a thread opened from
 * one can carry the whole string, so a plain lowercase comparison would miss.
 */
function bareAddress(value: unknown): string {
  if (typeof value !== "string") return "";
  const angled = value.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : value).toLowerCase().trim();
  const found = candidate.match(/[^\s<>,;"]+@[^\s<>,;"]+\.[^\s<>,;"]+/);
  return found ? found[0] : "";
}

/**
 * Addresses that are ours, never a person.
 *
 * `sesInbound` opens a thread as `unknown@unknown.invalid` when it cannot read
 * a sender at all, and our own sending addresses can appear as a sender on a
 * forwarded copy of our own mail — the same hazard `ourAddresses()` in
 * `sesInbound.controller` exists for. Neither should resolve to somebody's
 * profile.
 */
function nonPersonAddresses(): string[] {
  return [
    env.SES_FROM_EMAIL,
    env.SES_REPLY_TO_EMAIL,
    env.SES_OTP_FROM_EMAIL,
    "unknown@unknown.invalid",
  ]
    .map((a) => bareAddress(a))
    .filter(Boolean);
}

/**
 * The id of an existing account this row belongs to, or `""`.
 *
 * Pure, so the decision can be tested without a database. The id is preferred
 * over the address, but a stale id falls through to the address rather than
 * losing the link — a user who deleted and re-registered with the same address
 * has a new `_id`, so the old row points at the dead one while the address
 * points at the live account, and the live account is the useful answer.
 */
export function pickProfileUserId(
  subject: ProfileSubject,
  live: LiveAccounts,
  ours: string[] = nonPersonAddresses()
): string {
  const id = typeof subject.userId === "string" ? subject.userId : String(subject.userId ?? "");
  if (id && live.ids.has(id)) return id;

  const email = bareAddress(subject.userEmail);
  if (!email || ours.includes(email)) return "";
  return live.byEmail.get(email) || "";
}

/**
 * For each subject, the id of an account whose profile can be opened, or `""`.
 *
 * One query for the whole batch. Order matches the input, so a caller can zip
 * it straight back onto its rows.
 */
export async function resolveProfileUserIds(subjects: ProfileSubject[]): Promise<string[]> {
  if (subjects.length === 0) return [];

  const ours = nonPersonAddresses();
  const ids: string[] = [];
  const emails: string[] = [];

  for (const s of subjects) {
    const id = typeof s.userId === "string" ? s.userId : String(s.userId ?? "");
    // Only ids Mongo will accept — a malformed one in a `$in` throws a
    // CastError and would take the whole page's query down with it.
    if (id && mongoose.Types.ObjectId.isValid(id)) ids.push(id);

    const email = bareAddress(s.userEmail);
    if (email && !ours.includes(email)) emails.push(email);
  }

  if (ids.length === 0 && emails.length === 0) return subjects.map(() => "");

  const or: Record<string, unknown>[] = [];
  if (ids.length) or.push({ _id: { $in: [...new Set(ids)] } });
  if (emails.length) or.push({ email: { $in: [...new Set(emails)] } });

  let rows: { _id: mongoose.Types.ObjectId; email?: string }[] = [];
  try {
    rows = await User.find({ $or: or })
      .select("_id email")
      .lean<{ _id: mongoose.Types.ObjectId; email?: string }[]>();
  } catch (error) {
    // A profile button is a convenience. Losing it must not cost the panel the
    // feedback or the conversation it was decorating.
    console.error("Could not resolve profile links:", error);
    return subjects.map(() => "");
  }

  const live: LiveAccounts = { ids: new Set(), byEmail: new Map() };
  for (const r of rows) {
    const id = String(r._id);
    live.ids.add(id);
    const email = bareAddress(r.email);
    if (email) live.byEmail.set(email, id);
  }

  return subjects.map((s) => pickProfileUserId(s, live, ours));
}
