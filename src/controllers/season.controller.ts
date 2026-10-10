// Season settings: one public read for the banners and pricing UI, and the
// super admin's switch. See config/seasonSale.ts for what the sale does.

import type { Request, Response } from "express";
import { getSeasonSettings, updateSeasonSettings, invalidateSeasonCache } from "../services/seasonSettings.service";
import { defaultSeason, publicSeason, validateSeasonPatch } from "../config/seasonSale";
import { invalidatePricingCache } from "../config/templatePricing";
import { audit } from "../services/adminAudit";

/** GET /season — public. Never errors: a failed read answers with the defaults. */
export const getPublicSeason = async (_req: Request, res: Response): Promise<void> => {
  let body;
  try {
    body = publicSeason(await getSeasonSettings());
  } catch (error) {
    console.error("Season read error:", error);
    body = publicSeason(defaultSeason());
  }
  res.set("Cache-Control", "public, max-age=15");
  res.json({ success: true, data: body });
};

function adminView(s: Awaited<ReturnType<typeof getSeasonSettings>>) {
  return {
    mode: s.mode,
    saleEnabled: s.saleEnabled,
    salePercent: s.salePercent,
    saleSlugs: s.saleSlugs,
    updatedAt: s.updatedAt ?? null,
    updatedBy: s.updatedBy ?? null,
  };
}

/** GET /admin/super/season */
export const adminGetSeason = async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  res.json({ success: true, data: adminView(await getSeasonSettings(true)) });
};

/** PUT /admin/super/season — { mode?, saleEnabled?, salePercent?, saleSlugs? } */
export const adminUpdateSeason = async (req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const parsed = validateSeasonPatch(req.body);
  if (!parsed.ok) {
    res.status(400).json({ success: false, error: parsed.error, code: "INVALID_SEASON" });
    return;
  }
  try {
    const before = await getSeasonSettings(true);
    // Slugs stay the two Halloween templates (the default) unless the body names them.
    const after = await updateSeasonSettings(parsed.value, req.userEmail);
    invalidateSeasonCache();
    invalidatePricingCache();
    await audit(req, {
      action: "season.settings",
      changes: {
        mode: { from: before.mode, to: after.mode },
        saleEnabled: { from: before.saleEnabled, to: after.saleEnabled },
        salePercent: { from: before.salePercent, to: after.salePercent },
        saleSlugs: { from: before.saleSlugs, to: after.saleSlugs },
      },
    });
    res.json({ success: true, data: adminView(after) });
  } catch (error) {
    console.error("Season update error:", error);
    res.status(500).json({ success: false, error: "Failed to save season settings" });
  }
};
