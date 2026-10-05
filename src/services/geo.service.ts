// ─── Which country a request comes from ──────────────────────────────────────
//
// An in-process lookup against an MMDB file (DB-IP "IP to Country Lite", CC BY
// 4.0, or MaxMind GeoLite2-Country — same format). No network call, no CDN, no
// per-request cost: ~1µs per lookup once the file is in memory.
//
// ── WHICH IP ────────────────────────────────────────────────────────────────
//
// `req.ip`, and only `req.ip`. The API is reached as client → nginx → Express
// (api.subhsandesh.in resolves straight to the EC2 box; nginx terminates TLS and
// sets X-Forwarded-For with $proxy_add_x_forwarded_for). `app.set("trust proxy",
// 1)` makes Express take the address nginx appended — the TCP peer nginx saw.
// Anything a client puts in X-Forwarded-For itself sits to the LEFT of that and
// is ignored, so a forged header cannot change the country. Reading the first
// X-Forwarded-For entry by hand, as a couple of older call sites do, would let
// anyone pick their price.
//
// If a CDN is ever put in front of the API, `trust proxy` must grow by one hop
// AND the CDN's own country header can be trusted — see GEO_TRUSTED_HEADER.
//
// ── FAILURE IS "UNKNOWN", AND UNKNOWN IS INR ────────────────────────────────
//
// No database file, a corrupt file, a private address, an address the database
// does not know: every one of them returns null, which the currency rule maps
// to INR — exactly today's behaviour. Geo can only ever ADD a USD quote; it can
// never break an Indian checkout.

import fs from "fs";
import path from "path";
import type { Request } from "express";
import { Reader, open, type CountryResponse } from "maxmind";
import { normalizeCountry } from "../config/currency";

const DB_PATH = process.env.GEOIP_DB_PATH || path.join(process.cwd(), "geo", "country.mmdb");

let reader: Reader<CountryResponse> | null = null;
let loadedMtimeMs = 0;
let loading: Promise<void> | null = null;
let lastCheck = 0;
const RECHECK_MS = 60 * 60 * 1000;

async function load(): Promise<void> {
  try {
    const stat = await fs.promises.stat(DB_PATH);
    if (reader && stat.mtimeMs === loadedMtimeMs) return;
    reader = await open<CountryResponse>(DB_PATH);
    loadedMtimeMs = stat.mtimeMs;
    console.log(`[geo] country database loaded: ${DB_PATH}`);
  } catch (err) {
    if (!reader) {
      console.warn(`[geo] no country database at ${DB_PATH} — every request resolves to "unknown" (INR). ${(err as Error).message}`);
    }
  }
}

/** Load at boot, and pick up a refreshed file at most once an hour. */
export async function ensureGeoLoaded(): Promise<void> {
  const now = Date.now();
  if (reader && now - lastCheck < RECHECK_MS) return;
  lastCheck = now;
  if (!loading) loading = load().finally(() => { loading = null; });
  await loading;
}

export function geoReady(): boolean {
  return !!reader;
}

/** Country for a bare IP, or null. Never throws. */
export function countryForIp(ip: string | undefined | null): string | null {
  if (!ip || !reader) return null;
  const clean = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  try {
    const hit = reader.get(clean);
    return normalizeCountry(hit?.country?.iso_code ?? hit?.registered_country?.iso_code);
  } catch {
    return null;
  }
}

/**
 * Optional: a CDN-provided country header, trusted ONLY when the request also
 * carries a shared secret the CDN adds (so a client cannot send the header
 * itself). Both env vars unset — today — means it is never consulted.
 *   GEO_TRUSTED_HEADER=cloudfront-viewer-country
 *   GEO_TRUSTED_SECRET_HEADER=x-origin-verify   GEO_TRUSTED_SECRET=<random>
 */
function trustedHeaderCountry(req: Request): string | null {
  const header = process.env.GEO_TRUSTED_HEADER;
  const secretHeader = process.env.GEO_TRUSTED_SECRET_HEADER;
  const secret = process.env.GEO_TRUSTED_SECRET;
  if (!header || !secretHeader || !secret) return null;
  if (req.get(secretHeader) !== secret) return null;
  return normalizeCountry(req.get(header));
}

export interface GeoResult {
  country: string | null;
  source: "cdn" | "ip" | "unknown";
  ip: string | undefined;
}

export async function resolveCountry(req: Request): Promise<GeoResult> {
  const fromCdn = trustedHeaderCountry(req);
  if (fromCdn) return { country: fromCdn, source: "cdn", ip: req.ip };
  await ensureGeoLoaded();
  const country = countryForIp(req.ip);
  return { country, source: country ? "ip" : "unknown", ip: req.ip };
}
