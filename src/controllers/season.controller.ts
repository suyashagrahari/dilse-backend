// Season settings: one public read for the banners and pricing UI, and the
// super admin's switch. See config/seasonSale.ts for what the sale does.

import type { Request, Response } from "express";
import { getSeasonSettings, updateSeasonSettings, invalidateSeasonCache } from "../services/seasonSettings.service";
import { adminSeason, defaultSeason, DROP_IDS, publicSeason, validateSeasonPatch } from "../config/seasonSale";
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

/** GET /admin/super/season */
export const adminGetSeason = async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  res.json({ success: true, data: adminSeason(await getSeasonSettings(true)) });
};

/**
 * PUT /admin/super/season — { mode?, drops?: { halloween?|dandiya?|diwali?: { saleEnabled?, salePercent?, saleSlugs? } },
 * saleEnabled?, salePercent?, saleSlugs? } (flat fields edit one drop; see applySeasonPatch).
 */
export const adminUpdateSeason = async (req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const parsed = validateSeasonPatch(req.body);
  if (!parsed.ok) {
    res.status(400).json({ success: false, error: parsed.error, code: "INVALID_SEASON" });
    return;
  }
  try {
    const before = await getSeasonSettings(true);
    // Each drop keeps its slugs (the defaults until first edited) unless the body names them.
    const after = await updateSeasonSettings(parsed.value, req.userEmail);
    invalidateSeasonCache();
    invalidatePricingCache();
    await audit(req, {
      action: "season.settings",
      changes: {
        mode: { from: before.mode, to: after.mode },
        ...Object.fromEntries(
          DROP_IDS.flatMap((id) => [
            [`${id}.saleEnabled`, { from: before.drops[id].saleEnabled, to: after.drops[id].saleEnabled }],
            [`${id}.salePercent`, { from: before.drops[id].salePercent, to: after.drops[id].salePercent }],
            [`${id}.saleSlugs`, { from: before.drops[id].saleSlugs, to: after.drops[id].saleSlugs }],
          ])
        ),
      },
    });
    res.json({ success: true, data: adminSeason(after) });
  } catch (error) {
    console.error("Season update error:", error);
    res.status(500).json({ success: false, error: "Failed to save season settings" });
  }
};
