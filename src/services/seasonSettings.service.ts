import SeasonSettings from "../models/SeasonSettings";
import { applySeasonPatch, defaultSeason, seasonFromRow, type SeasonPatch, type SeasonView } from "../config/seasonSale";

// Every pricing read and every page that shows a banner asks for this, so it
// is answered from memory. Fifteen seconds is the most a super admin's switch
// takes to reach another instance; on the instance that took the write the
// cache is cleared at once.
const TTL_MS = 15_000;
let cache: { at: number; value: SeasonView } | null = null;

export function invalidateSeasonCache(): void {
  cache = null;
}

/**
 * Cached for 15 s; `fresh` skips the cache (the order path and the admin
 * panel). Never throws: a read failure returns the defaults, which is the
 * documented "owner asked for this live" state — and the direction that can
 * only ever charge less, never more. Rows from before per-season drops are
 * migrated on read (`seasonFromRow`).
 */
export async function getSeasonSettings(fresh = false): Promise<SeasonView> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const row = await SeasonSettings.findOne({ key: "global" }).lean();
    const value = seasonFromRow(row as Record<string, unknown> | null);
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[season] read failed, using defaults:", err);
    return defaultSeason();
  }
}

/**
 * Apply a validated patch to the current settings (the defaults on the first
 * write, so "turn the sale off" never silently changes the mode as well) and
 * store the whole result: every drop, plus the Halloween drop mirrored into the
 * legacy flat fields.
 */
export async function updateSeasonSettings(patch: SeasonPatch, byEmail?: string): Promise<SeasonView> {
  const before = await getSeasonSettings(true);
  const next = applySeasonPatch(before, patch);
  await SeasonSettings.findOneAndUpdate(
    { key: "global" },
    {
      $set: {
        mode: next.mode,
        drops: next.drops,
        saleEnabled: next.drops.halloween.saleEnabled,
        salePercent: next.drops.halloween.salePercent,
        saleSlugs: next.drops.halloween.saleSlugs,
        updatedBy: byEmail,
      },
      $setOnInsert: { key: "global" },
    },
    { upsert: true, runValidators: true }
  );
  cache = null;
  return getSeasonSettings(true);
}
