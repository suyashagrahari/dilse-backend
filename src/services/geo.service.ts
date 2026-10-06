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
/** Set GEOIP_AUTO_DOWNLOAD=false to manage the file yourself (e.g. MaxMind). */
const AUTO_DOWNLOAD = process.env.GEOIP_AUTO_DOWNLOAD !== "false";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RECHECK_MS = 24 * 60 * 60 * 1000;

let reader: Reader<CountryResponse> | null = null;
let loadedMtimeMs = 0;
let loading: Promise<void> | null = null;
let lastCheck = 0;
let warned = false;

function monthsToTry(now = new Date()): string[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const cur = `${y}-${String(m + 1).padStart(2, "0")}`;
  const prevDate = new Date(Date.UTC(y, m - 1, 1));
  const prev = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return [cur, prev];
}

/**
 * Fetch DB-IP "Country Lite" (this month's, else last month's), gunzip, and
 * replace the file atomically (write to .tmp, rename). Done by the server at
 * runtime rather than in the Docker build: a build step is cached by Docker
 * and would never refresh, or would cache an empty result forever.
 */
async function download(): Promise<boolean> {
  const zlib = await import("zlib");
  await fs.promises.mkdir(path.dirname(DB_PATH), { recursive: true });
  for (const month of monthsToTry()) {
    const url = `https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) continue;
      const gz = Buffer.from(await res.arrayBuffer());
      const db = zlib.gunzipSync(gz);
      if (db.length < 1_000_000) continue; // not a real database
      const tmp = `${DB_PATH}.tmp`;
      await fs.promises.writeFile(tmp, db);
      await fs.promises.rename(tmp, DB_PATH);
      console.log(`[geo] downloaded dbip-country-lite-${month} (${(db.length / 1e6).toFixed(1)} MB)`);
      return true;
    } catch (err) {
      console.warn(`[geo] download ${month} failed: ${(err as Error).message}`);
    }
  }
  return false;
}

async function load(): Promise<void> {
  let stat: fs.Stats | null = await fs.promises.stat(DB_PATH).catch(() => null);
  if (AUTO_DOWNLOAD && (!stat || Date.now() - stat.mtimeMs > MAX_AGE_MS)) {
    if (await download()) stat = await fs.promises.stat(DB_PATH).catch(() => null);
  }
  if (!stat) {
    if (!warned) {
      console.warn(`[geo] no country database at ${DB_PATH} — every request resolves to "unknown" (INR).`);
      warned = true;
    }
    return;
  }
  if (reader && stat.mtimeMs === loadedMtimeMs) return;
  try {
    reader = await open<CountryResponse>(DB_PATH);
    loadedMtimeMs = stat.mtimeMs;
    warned = false;
    console.log(`[geo] country database loaded: ${DB_PATH}`);
  } catch (err) {
    console.error(`[geo] could not open ${DB_PATH}: ${(err as Error).message}`);
  }
}

/**
 * Load at boot, and re-check (and refresh if older than 30 days) at most once
 * a day — whether or not a database is loaded, so a missing file costs one
 * check a day, not one per request.
 */
export async function ensureGeoLoaded(): Promise<void> {
  const now = Date.now();
  // Daily once loaded; hourly while there is still no database (a failed
  // download at boot should not leave a whole day of INR-only quotes).
  if (now - lastCheck < (reader ? RECHECK_MS : 60 * 60 * 1000)) {
    if (loading) await loading;
    return;
  }
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
  // Never make a buyer wait on a download: kick the (throttled) refresh off in
  // the background and answer from whatever database is loaded right now.
  void ensureGeoLoaded();
  const country = countryForIp(req.ip);
  return { country, source: country ? "ip" : "unknown", ip: req.ip };
}
