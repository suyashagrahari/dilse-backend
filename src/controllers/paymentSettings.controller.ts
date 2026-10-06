import type { Request, Response } from "express";
import { getPaymentSettings, updatePaymentSettings } from "../services/paymentSettings.service";
import { resolveCountry, geoReady } from "../services/geo.service";
import { currencyForCountry, MIN_INR_PER_USD, MAX_INR_PER_USD } from "../config/currency";
import { audit } from "../services/adminAudit";
import { isFreeForViewer } from "../config/whoPays";

/** GET /admin/super/payment-settings */
export const adminGetPaymentSettings = async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: { ...(await getPaymentSettings(true)), geoReady: geoReady() } });
};

/** PUT /admin/super/payment-settings — { intlPricingEnabled?, chargeOnlyAbroad?, inrPerUsd? } */
export const adminUpdatePaymentSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const patch: { intlPricingEnabled?: boolean; chargeOnlyAbroad?: boolean; inrPerUsd?: number } = {};
    // "Who pays": strictly a boolean — a truthy string must not make India free.
    if (req.body.chargeOnlyAbroad !== undefined) {
      if (typeof req.body.chargeOnlyAbroad !== "boolean") {
        res.status(400).json({ success: false, error: "chargeOnlyAbroad must be true or false" });
        return;
      }
      patch.chargeOnlyAbroad = req.body.chargeOnlyAbroad;
    }
    if (req.body.intlPricingEnabled !== undefined) {
      if (typeof req.body.intlPricingEnabled !== "boolean") {
        res.status(400).json({ success: false, error: "intlPricingEnabled must be true or false" });
        return;
      }
      patch.intlPricingEnabled = req.body.intlPricingEnabled;
    }
    if (req.body.inrPerUsd !== undefined) {
      const r = Number(req.body.inrPerUsd);
      if (!Number.isFinite(r) || r < MIN_INR_PER_USD || r > MAX_INR_PER_USD) {
        res.status(400).json({ success: false, error: `Rate must be between ₹${MIN_INR_PER_USD} and ₹${MAX_INR_PER_USD} per $1` });
        return;
      }
      patch.inrPerUsd = Math.round(r * 100) / 100;
    }
    const before = await getPaymentSettings(true);
    const after = await updatePaymentSettings(patch, req.userEmail);
    await audit(req, {
      action: "payment.settings",
      changes: {
        intlPricingEnabled: { from: before.intlPricingEnabled, to: after.intlPricingEnabled },
        chargeOnlyAbroad: { from: before.chargeOnlyAbroad, to: after.chargeOnlyAbroad },
        inrPerUsd: { from: before.inrPerUsd, to: after.inrPerUsd },
      },
    });
    res.json({ success: true, data: { ...after, geoReady: geoReady() } });
  } catch (error) {
    console.error("Payment settings update error:", error);
    res.status(500).json({ success: false, error: "Failed to save payment settings" });
  }
};

/**
 * GET /admin/super/geo-check — what the server sees for THIS request: the
 * client IP after trust-proxy, the country, and the currency it would quote.
 * The quickest way to prove the proxy chain is right after a deploy.
 */
export const adminGeoCheck = async (req: Request, res: Response): Promise<void> => {
  const settings = await getPaymentSettings(true);
  const geo = await resolveCountry(req);
  res.set("Cache-Control", "private, no-store");
  res.json({
    success: true,
    data: {
      ip: geo.ip,
      country: geo.country,
      source: geo.source,
      geoReady: geoReady(),
      wouldCharge: currencyForCountry(geo.country, settings.intlPricingEnabled),
      intlPricingEnabled: settings.intlPricingEnabled,
      chargeOnlyAbroad: settings.chargeOnlyAbroad,
      // With "Who pays" as it is now, would THIS connection publish priced templates free?
      wouldPublishFree: isFreeForViewer({ chargeOnlyAbroad: settings.chargeOnlyAbroad, country: geo.country, source: geo.source }),
    },
  });
};
