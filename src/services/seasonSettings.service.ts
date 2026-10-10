import SeasonSettings from "../models/SeasonSettings";
import { defaultSeason, SEASON_MODES, type SeasonMode, type SeasonView } from "../config/seasonSale";

// Every pricing read and every page that shows a banner asks for this, so it
// is answered from memory. Fifteen seconds is the most a super admin's switch
// takes to reach another instance; on the instance that took the write the
// cache is cleared at once.
const TTL_MS = 15_000;
let cache: { at: number; value: SeasonView } | null = null;

export function invalidateSeasonCache(): void {
  cache = null;
}

function toView(row: Record<string, unknown> | null): SeasonView {
  const d = defaultSeason();
  if (!row) return d;
  const mode = SEASON_MODES.includes(row.mode as SeasonMode) ? (row.mode as SeasonMode) : d.mode;
  const pct = Number(row.salePercent);
  const slugs = Array.isArray(row.saleSlugs) ? (row.saleSlugs as unknown[]).map((s) => String(s).toLowerCase()) : d.saleSlugs;
  return {
    mode,
    saleEnabled: typeof row.saleEnabled === "boolean" ? row.saleEnabled : d.saleEnabled,
    salePercent: Number.isFinite(pct) ? Math.round(pct) : d.salePercent,
    saleSlugs: slugs,
    updatedAt: (row.updatedAt as Date) ?? null,
    updatedBy: (row.updatedBy as string) ?? null,
  };
}

/**
 * Cached for 15 s; `fresh` skips the cache (the order path and the admin
 * panel). Never throws: a read failure returns the defaults, which is the
 * documented "owner asked for this live" state — and the direction that can
 * only ever charge less, never more.
 */
export async function getSeasonSettings(fresh = false): Promise<SeasonView> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const row = await SeasonSettings.findOne({ key: "global" }).lean();
    const value = toView(row as Record<string, unknown> | null);
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[season] read failed, using defaults:", err);
    return defaultSeason();
  }
}

export async function updateSeasonSettings(
  patch: Partial<Pick<SeasonView, "mode" | "saleEnabled" | "salePercent" | "saleSlugs">>,
  byEmail?: string
): Promise<SeasonView> {
  // Insert with the defaults for whatever the patch leaves out, so the first
  // write ("turn the sale off") does not silently change the mode as well.
  const d = defaultSeason();
  const setOnInsert: Record<string, unknown> = { key: "global" };
  for (const k of ["mode", "saleEnabled", "salePercent", "saleSlugs"] as const) {
    if (patch[k] === undefined) setOnInsert[k] = d[k];
  }
  await SeasonSettings.findOneAndUpdate(
    { key: "global" },
    { $set: { ...patch, updatedBy: byEmail }, $setOnInsert: setOnInsert },
    { upsert: true, runValidators: true }
  );
  cache = null;
  return getSeasonSettings(true);
}
