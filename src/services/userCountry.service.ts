import type { Request } from "express";
import User from "../models/User";
import { resolveCountry } from "./geo.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Record where a user is, at country level only — no city, no IP kept.
 * `signup` also sets `signupCountry`, once. Otherwise only `lastSeenCountry`
 * moves, and at most once a day, so this is one cheap write per user per day.
 *
 * Informational: shown in admin and used for reporting. It NEVER decides a
 * price — the payment path re-resolves the country on every request.
 * Fire-and-forget; never throws into the caller.
 */
export async function stampUserCountry(
  userId: string,
  req: Request,
  { signup = false, lastSeenAt }: { signup?: boolean; lastSeenAt?: Date | null } = {}
): Promise<void> {
  try {
    if (!signup && lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < DAY_MS) return;
    const { country } = await resolveCountry(req);
    if (!country) {
      // Still stamp the time, so an unresolvable visitor costs one lookup a
      // day rather than one per /auth/me.
      if (!signup) await User.updateOne({ _id: userId }, { $set: { lastSeenCountryAt: new Date() } });
      return;
    }
    const set: Record<string, unknown> = { lastSeenCountry: country, lastSeenCountryAt: new Date() };
    if (signup) {
      await User.updateOne({ _id: userId, signupCountry: { $in: [null, undefined] } }, { $set: { ...set, signupCountry: country } });
      return;
    }
    await User.updateOne({ _id: userId }, { $set: set });
  } catch (err) {
    console.error("[geo] stampUserCountry failed (non-fatal):", err);
  }
}
