import PaymentSettings from "../models/PaymentSettings";
import { DEFAULT_INR_PER_USD } from "../config/currency";

export interface PaymentSettingsView {
  intlPricingEnabled: boolean;
  chargeOnlyAbroad: boolean;
  inrPerUsd: number;
  updatedByEmail?: string;
  updatedAt?: Date;
}

const DEFAULTS: PaymentSettingsView = { intlPricingEnabled: false, chargeOnlyAbroad: false, inrPerUsd: DEFAULT_INR_PER_USD };
let cache: { at: number; value: PaymentSettingsView } | null = null;
const TTL_MS = 30_000;

/**
 * Cached for 30s. `fresh` is for the order path, where a stale "on" after a
 * super admin switched it off would charge somebody in the wrong currency.
 * A read failure falls back to the defaults — international pricing OFF and
 * everyone pays — which is the safe direction: everyone pays INR exactly as
 * before, and nothing becomes free because a read failed.
 */
export async function getPaymentSettings(fresh = false): Promise<PaymentSettingsView> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const row = await PaymentSettings.findOne({ key: "global" }).lean();
    const value: PaymentSettingsView = row
      ? {
          intlPricingEnabled: !!row.intlPricingEnabled,
          chargeOnlyAbroad: !!row.chargeOnlyAbroad,
          inrPerUsd: row.inrPerUsd || DEFAULT_INR_PER_USD,
          updatedByEmail: row.updatedByEmail,
          updatedAt: row.updatedAt,
        }
      : { ...DEFAULTS };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[payment-settings] read failed, using defaults (INR only):", err);
    return { ...DEFAULTS };
  }
}

export async function updatePaymentSettings(
  patch: Partial<Pick<PaymentSettingsView, "intlPricingEnabled" | "chargeOnlyAbroad" | "inrPerUsd">>,
  byEmail?: string
): Promise<PaymentSettingsView> {
  await PaymentSettings.findOneAndUpdate(
    { key: "global" },
    { $set: { ...patch, updatedByEmail: byEmail }, $setOnInsert: { key: "global" } },
    { upsert: true, runValidators: true }
  );
  cache = null;
  return getPaymentSettings(true);
}
