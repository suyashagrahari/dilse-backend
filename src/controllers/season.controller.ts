// Season settings: one public read for the banners and pricing UI, and the
// super admin's switch. See config/seasonSale.ts for what the sale does.

import type { Request, Response } from "express";
import { getSeasonSettings, updateSeasonSettings, invalidateSeasonCache } from "../services/seasonSettings.service";
import {
  adminSeason,
  AUDIENCES,
  defaultSeason,
  DROP_IDS,
  publicSeason,
  UNKNOWN_COUNTRY_AUDIENCE,
  validateSeasonPatch,
  type Audience,
} from "../config/seasonSale";
import { resolveSeason } from "../services/seasonViewer.service";
import { invalidatePricingCache } from "../config/templatePricing";
import { audit } from "../services/adminAudit";

/**
 * GET /season — public, and PER VISITOR: `{ mode, sale, drops, audience, split,
 * audiences }` for this visitor's side of the India/abroad split (resolved from
 * the server's own country lookup, never from anything the client sends).
 *
 * `private`: the body depends on where the request came from, so no shared
 * cache (CDN, proxy) may hand one country's season to another. The browser
 * keeps it for 15 s, the same as the settings cache behind it.
 *
 * Never errors: a failed read answers with the defaults.
 */
export const getPublicSeason = async (req: Request, res: Response): Promise<void> => {
  let body;
  try {
    const { settings, audience } = await resolveSeason(req);
    body = publicSeason(settings, audience);
  } catch (error) {
    console.error("Season read error:", error);
    body = publicSeason(defaultSeason(), UNKNOWN_COUNTRY_AUDIENCE);
  }
  res.set("Cache-Control", "private, max-age=15");
  res.json({ success: true, data: body });
};

/**
 * GET /admin/super/season/preview?audience=india|abroad — super admin only (the
 * router's guard). The public body as that side sees it, so the super admin can
 * look at the site "as India" or "as abroad" from wherever they are. Only what
 * the site WEARS is previewed: prices still follow the admin's real country.
 */
export const adminPreviewSeason = async (req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const audience = String(req.query.audience || "") as Audience;
  if (!AUDIENCES.includes(audience)) {
    res.status(400).json({ success: false, error: `audience must be one of ${AUDIENCES.join(", ")}`, code: "INVALID_AUDIENCE" });
    return;
  }
  res.json({ success: true, data: publicSeason(await getSeasonSettings(true), audience) });
};

/** GET /admin/super/season */
export const adminGetSeason = async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  res.json({ success: true, data: adminSeason(await getSeasonSettings(true)) });
};

/**
 * PUT /admin/super/season — { mode?, split?, modeIndia?, modeAbroad?, drops?: { halloween?|dandiya?|diwali?: { saleEnabled?, salePercent?, saleSlugs? } },
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
        split: { from: before.split, to: after.split },
        modeIndia: { from: before.modeIndia, to: after.modeIndia },
        modeAbroad: { from: before.modeAbroad, to: after.modeAbroad },
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
