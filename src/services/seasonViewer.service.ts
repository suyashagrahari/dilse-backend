// ─── The season ONE visitor sees ─────────────────────────────────────────────
//
// The stored settings (seasonSettings.service.ts, cached, the same for
// everybody) plus the visitor's side of the India/abroad split, resolved from
// the server's own country lookup on every request — `audienceFor` in
// pricingQuote.service.ts, the same function every price read uses, so the
// banner a visitor sees and the sale they are charged come from one answer.

import type { Request } from "express";
import { getSeasonSettings } from "./seasonSettings.service";
import { audienceFor } from "./pricingQuote.service";
import { seasonForAudience, type Audience, type SeasonView } from "../config/seasonSale";

export interface ResolvedSeason {
  /** The stored settings, split and all. */
  settings: SeasonView;
  /** This visitor's side. */
  audience: Audience;
  /** This visitor's single-mode view (`seasonForAudience`). */
  season: SeasonView;
}

export async function resolveSeason(req: Request, { fresh = false } = {}): Promise<ResolvedSeason> {
  const [settings, audience] = await Promise.all([getSeasonSettings(fresh), audienceFor(req)]);
  return { settings, audience, season: seasonForAudience(settings, audience) };
}
