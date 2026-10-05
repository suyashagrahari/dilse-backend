/**
 * Commission arithmetic, kept pure so the money rules are tested without Mongo.
 *
 * All amounts are integer paise. Commission is floored: across thousands of
 * payments, rounding up would pay out money the platform never received.
 */

export function effectiveCommissionPercent(
  override: number | null | undefined,
  defaultPercent: number
): number {
  const pick = typeof override === "number" && Number.isFinite(override) ? override : defaultPercent;
  return clampPercent(pick);
}

export function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, Math.round(p * 100) / 100));
}

export function commissionPaise(amountPaise: number, percent: number): number {
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) return 0;
  return Math.floor((Math.round(amountPaise) * clampPercent(percent)) / 100);
}

export function pendingPaise(earnedPaise: number, paidOutPaise: number): number {
  return Math.max(0, earnedPaise - paidOutPaise);
}

/** "priyanka@gmail.com" → "pr•••••a@gmail.com". Influencers see who, not how to reach them. */
export function maskEmail(email: string | undefined): string {
  if (!email || !email.includes("@")) return "";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0] || ""}•@${domain}`;
  return `${local.slice(0, 2)}${"•".repeat(Math.min(5, local.length - 3))}${local.slice(-1)}@${domain}`;
}

/** UTC calendar day, the bucket key for click counters. */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
