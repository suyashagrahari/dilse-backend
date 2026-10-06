// ─── Wishlist sale countdown ────────────────────────────────────────────────
//
// Pure functions behind the "30% off — ends in 09d 14h" banners, so the public
// endpoint, the admin panel and the tests agree on one definition of "live".
//
// The countdown is REAL: it runs to one `endsAt` stored on the server, the same
// instant for every visitor. Nothing here resets per visitor or per page load —
// a timer that restarts on refresh is a false-urgency dark pattern, and people
// notice. When the super admin wants more time they restart it deliberately,
// and the banner says so ("Last chance", "Extended").

export type PromoStyle = "sale" | "last-chance" | "extended";
export const PROMO_STYLES: readonly PromoStyle[] = ["sale", "last-chance", "extended"];

/** One hour to 30 days. Longer than a month stops being a countdown. */
export const MIN_PROMO_HOURS = 1;
export const MAX_PROMO_HOURS = 30 * 24;

export interface PromoState {
  enabled: boolean;
  endsAt?: Date | null;
}

/** Live means switched on AND not yet run out. Either alone is not enough. */
export function isPromoLive(p: PromoState | null | undefined, now: Date = new Date()): boolean {
  return Boolean(p?.enabled && p.endsAt && new Date(p.endsAt).getTime() > now.getTime());
}

/** Switched on but the clock ran out: the admin card offers a restart. */
export function isPromoEnded(p: PromoState | null | undefined, now: Date = new Date()): boolean {
  return Boolean(p?.enabled && p.endsAt && new Date(p.endsAt).getTime() <= now.getTime());
}

export type StartInput = { durationHours: number; style: PromoStyle };

/** Validate what the admin panel sends; returns a message a person can act on. */
export function parseStartInput(body: unknown): StartInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const hours = Number(b.durationHours);
  if (!Number.isInteger(hours) || hours < MIN_PROMO_HOURS || hours > MAX_PROMO_HOURS) {
    return { error: `Duration must be between 1 hour and ${MAX_PROMO_HOURS / 24} days` };
  }
  const style = String(b.style ?? "sale") as PromoStyle;
  if (!PROMO_STYLES.includes(style)) return { error: "Unknown banner style" };
  return { durationHours: hours, style };
}

export function endsAtFrom(now: Date, durationHours: number): Date {
  return new Date(now.getTime() + durationHours * 3_600_000);
}
