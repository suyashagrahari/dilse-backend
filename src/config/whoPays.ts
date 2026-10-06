// ─── Who pays: everyone, or only visitors outside India ─────────────────────
//
// A super admin can make priced templates free for visitors in India while
// visitors abroad still pay (Admin → Pricing → "Who pays"). This is the one
// definition of "this visitor publishes free", used by the publish gate, the
// quote, the order and the points spend, so they can never disagree.
//
// ── WHY UNKNOWN PAYS ────────────────────────────────────────────────────────
//
// For choosing ₹ or $, an unknown country is treated as India (config/
// currency.ts) — harmless, it only picks a currency. Here the stakes are
// different: if the geo database were missing, "unknown = India" would make
// every template free for everyone. So free needs a POSITIVE India answer from
// the server's own lookup (or a super admin's test override); anything else,
// including unknown, pays as before.

export type GeoSource = "cdn" | "ip" | "unknown" | "debug";

export interface WhoPaysInput {
  chargeOnlyAbroad: boolean;
  country: string | null;
  source: GeoSource;
}

export function isFreeForViewer({ chargeOnlyAbroad, country, source }: WhoPaysInput): boolean {
  if (!chargeOnlyAbroad) return false;
  if (source === "unknown") return false;
  return country === "IN";
}
