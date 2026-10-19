// ─── Traction proof for creator outreach ─────────────────────────────────────
//
// Prospects → Traction: the admin uploads an analytics screenshot (Google
// Search Console, Google Analytics …). This file owns everything between the
// upload and the email, kept pure where it can be so it is tested without S3,
// Mongo or OpenAI:
//
//   sniffProofImage     the bytes decide the type (PNG / JPEG / WebP), never
//                       the declared MIME; ≤ 5 MB.
//   processProofImage   EXIF-orientation applied, metadata (EXIF, GPS) dropped,
//                       ≤ 1600 px wide, PNG (screenshots stay crisp and every
//                       mail client shows PNG); JPEG if the PNG is too heavy.
//   storeProofImage     S3 gifts-media/outreach-proof/<id>.<ext> → CDN URL.
//                       The store is injected, so tests stub S3.
//   extractProofStats   the vision model READS the screenshot and pre-fills the
//                       form. Never trusted: the admin confirms every number
//                       before the proof can be used (active = true).
//   proofFactsForPrompt the confirmed counts as facts for the AI, each with
//                       what it truthfully means for its source
//                       (Search Console clicks = visits from Google Search,
//                       impressions = times shown in Google, GA users = people).
//   proofAllowedNumbers the exact tokens the first-email linter lets through
//                       ("52.2K", "about 52K", "2.75M", "3 months") — and no
//                       others: no %, no ₹, no number the proof doesn't hold.

import crypto from "node:crypto";
import sharp from "sharp";
import { PROOF_SOURCES, type ProofSource, type ProofStat } from "../models/OutreachProof";
import { deleteS3Object, publicUrlForKey, putS3Object, uploadPrefix } from "./s3Media.service";
import { visionCompletion, type VisionCompletion } from "./prospectModel.service";
import { env } from "../config/env";
import { prospectPersonalHtml, prospectPersonalText } from "./prospectMail.service";

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_MAX_WIDTH = 1600;
/** Above this, the PNG is re-encoded as JPEG — an email attachment should stay light. */
const PNG_SOFT_LIMIT = 1_200_000;
export const PROOF_MAX_STATS = 6;
export const PROOF_FOLDER = "outreach-proof";

export class ProofInputError extends Error {}

// ── The image ──────────────────────────────────────────────────────────────

export type ProofImageType = "png" | "jpeg" | "webp";

/** What the bytes are, by their magic numbers. null for anything else. */
export function sniffProofImage(buf: Buffer): ProofImageType | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export interface ProcessedProofImage {
  buffer: Buffer;
  contentType: "image/png" | "image/jpeg";
  ext: "png" | "jpg";
  width: number;
  height: number;
}

/** Validate, strip metadata, resize, re-encode. Throws ProofInputError with a sentence. */
export async function processProofImage(input: Buffer): Promise<ProcessedProofImage> {
  if (!input?.length) throw new ProofInputError("Choose a screenshot to upload.");
  if (input.length > PROOF_MAX_BYTES) throw new ProofInputError("That image is over 5 MB — crop it or save it smaller.");
  const type = sniffProofImage(input);
  if (!type) throw new ProofInputError("That file isn't a PNG, JPG or WebP image.");
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ProofInputError("That image could not be read — it may be damaged.");
  }
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 120) {
    throw new ProofInputError("That image is too small to read — upload the full screenshot.");
  }
  // .rotate() applies the EXIF orientation; without withMetadata() sharp
  // writes no EXIF / GPS / ICC — nothing about the device leaves with it.
  const pipeline = () => sharp(input, { failOn: "error" }).rotate().resize({ width: PROOF_MAX_WIDTH, withoutEnlargement: true });
  let buffer = await pipeline().png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
  let contentType: ProcessedProofImage["contentType"] = "image/png";
  let ext: ProcessedProofImage["ext"] = "png";
  if (buffer.length > PNG_SOFT_LIMIT) {
    buffer = await pipeline().flatten({ background: "#ffffff" }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    contentType = "image/jpeg";
    ext = "jpg";
  }
  const out = await sharp(buffer).metadata();
  return { buffer, contentType, ext, width: out.width || 0, height: out.height || 0 };
}

/** Where proof screenshots live. Injected so tests never reach S3. */
export interface ProofStore {
  put(key: string, buffer: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export const s3ProofStore: ProofStore = {
  put: (key, buffer, contentType) => putS3Object(key, buffer, contentType),
  delete: (key) => deleteS3Object(key),
};

/** gifts-media/outreach-proof/<id>.<ext> — a fresh id per upload (CDN caches are immutable). */
export function proofKey(ext: string, id: string = crypto.randomBytes(10).toString("hex"), prefix: string = uploadPrefix()): string {
  return `${prefix}/${PROOF_FOLDER}/${id}.${ext.replace(/^\./, "")}`;
}

/** Is this one of OUR proof keys? (A delete never reaches anything else.) */
export function isProofKey(key: string, prefix: string = uploadPrefix()): boolean {
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${PROOF_FOLDER}/[a-f0-9]{8,40}\\.(png|jpg|webp)$`).test(String(key || ""));
}

export async function storeProofImage(img: ProcessedProofImage, store: ProofStore = s3ProofStore): Promise<{ url: string; key: string }> {
  const key = proofKey(img.ext);
  const url = await store.put(key, img.buffer, img.contentType);
  return { url, key };
}

/** The CDN host a proof image URL must be on (for the send-time fetch). */
export function proofImageHostOk(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const base = env.S3_PUBLIC_BASE_URL ? new URL(env.S3_PUBLIC_BASE_URL).hostname : "";
    return u.hostname === "cdn.subhsandesh.in" || (!!base && u.hostname === base) || u.hostname === new URL(publicUrlForKey("x")).hostname;
  } catch {
    return false;
  }
}

// ── The stats ──────────────────────────────────────────────────────────────

/** A count as analytics tools print it: 52.2K, 2.75M, 1,234, 980. */
const COUNT_RE = /^\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?\s?[KMB]?$|^\d+(?:\.\d{1,2})?\s?[KMB]?$/i;
const PERCENT_RE = /^\d{1,3}(?:\.\d{1,2})?\s?%$/;
/** Stats that are not "how many people / visits" and never go in an email. */
const NOT_A_COUNT = /\b(ctr|click[- ]?through|position|rank|rate|bounce|duration|time|revenue|₹|\$)\b/i;

export interface ProofInput {
  source: ProofSource;
  periodLabel: string;
  stats: ProofStat[];
  caption: string;
  isDefault: boolean;
}

const cleanText = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Normalise one value as typed: "52.2 k" → "52.2K", "1.9 %" → "1.9%". */
export function normaliseStatValue(v: unknown): string {
  return cleanText(v, 24).replace(/\s+(?=[KMBkmb%]$)/, "").replace(/[kmb]$/, (c) => c.toUpperCase());
}

/** Validate what the admin confirmed. Throws ProofInputError naming the first problem. */
export function parseProofInput(raw: Record<string, unknown>): ProofInput {
  const source = PROOF_SOURCES.includes(raw?.source as ProofSource) ? (raw.source as ProofSource) : null;
  if (!source) throw new ProofInputError("Pick where the screenshot is from.");
  const periodLabel = cleanText(raw?.periodLabel, 80);
  if (!periodLabel) throw new ProofInputError("Say what period the numbers cover, e.g. “last 3 months”.");
  const list = Array.isArray(raw?.stats) ? (raw.stats as unknown[]) : [];
  const stats: ProofStat[] = [];
  for (const s of list) {
    const label = cleanText((s as ProofStat)?.label, 60);
    const value = normaliseStatValue((s as ProofStat)?.value);
    if (!label && !value) continue;
    if (!label) throw new ProofInputError(`Give the number ${value} a label, e.g. “Total clicks”.`);
    if (!value) throw new ProofInputError(`“${label}” needs a number.`);
    if (!COUNT_RE.test(value) && !PERCENT_RE.test(value)) {
      throw new ProofInputError(`“${value}” for ${label} doesn't look like a number from the screenshot (e.g. 52.2K, 2.75M, 1.9%).`);
    }
    stats.push({ label, value });
  }
  if (!stats.length) throw new ProofInputError("Add at least one number from the screenshot.");
  if (stats.length > PROOF_MAX_STATS) throw new ProofInputError(`At most ${PROOF_MAX_STATS} numbers.`);
  return { source, periodLabel, stats, caption: cleanText(raw?.caption, 280), isDefault: raw?.isDefault === true };
}

/** The stats an email may quote: counts only (no %, no position, no rates). */
export function quotableStats(stats: ProofStat[]): ProofStat[] {
  return (stats || []).filter((s) => COUNT_RE.test(s.value) && !NOT_A_COUNT.test(s.label));
}

/** What a number truthfully means, by source and label. */
export function statMeaning(source: ProofSource, label: string): string {
  const l = label.toLowerCase();
  if (source === "search_console") {
    if (/click/.test(l)) return "visits to our pages that came from Google Search (people who clicked us in Google results) — not total users";
    if (/impression/.test(l)) return "times our pages were shown in Google Search results — not visits";
  }
  if (source === "google_analytics") {
    if (/new users/.test(l)) return "new people who visited our pages";
    if (/user/.test(l)) return "people who used our pages (Google Analytics users)";
    if (/session/.test(l)) return "visits to our pages (sessions)";
    if (/view/.test(l)) return "page views";
    if (/event/.test(l)) return "actions taken on our pages";
  }
  return `${label} (as shown on our analytics)`;
}

export const SOURCE_NAME: Record<ProofSource, string> = {
  search_console: "Google Search Console",
  google_analytics: "Google Analytics",
  other: "our analytics",
};

/** The plain-text line under the body when the screenshot is attached. */
export function screenshotNote(source: ProofSource): string {
  return source === "search_console"
    ? "(screenshot of our Google Search stats attached)"
    : source === "google_analytics"
      ? "(screenshot of our Google Analytics stats attached)"
      : "(screenshot of our stats attached)";
}

export interface ProofSnapshot {
  id: string;
  imageUrl: string;
  source: ProofSource;
  periodLabel: string;
  stats: ProofStat[];
  width?: number;
  height?: number;
}

/** The confirmed numbers as facts for the drafting prompt. */
export function proofFactsForPrompt(p: ProofSnapshot): string {
  const stats = quotableStats(p.stats);
  if (!stats.length) return "";
  return [
    `REAL NUMBERS — from our ${SOURCE_NAME[p.source]}, ${p.periodLabel}. These are the ONLY numbers you may write:`,
    ...stats.map((s) => `- ${s.value} — ${s.label}: ${statMeaning(p.source, s.label)}.`),
    "How to use them: ONE natural sentence, in your own words, using one or two of these numbers written exactly as above (you may say “about” or “over” before a number). Say truthfully what the number counts — Google Search visits are visits from Google Search, impressions are times shown in Google — never call them users or customers unless the line above says users.",
    "Then, in the same or the next sentence, connect it to them: people come to SubhSandesh to make something for someone they love — a birthday, an anniversary, a sorry — the same kind of people who watch their videos. Never claim who the visitors are (e.g. 'mostly couples'); the numbers don't show that.",
  ].join("\n");
}

const UNIT_WORD: Record<string, string> = { K: "thousand", M: "million", B: "billion" };

/** Every way an email may honestly write one confirmed value. */
export function numberForms(value: string): string[] {
  const v = normaliseStatValue(value);
  const m = /^([\d,]+(?:\.\d+)?)([KMB]?)$/.exec(v);
  if (!m) return [];
  const [, num, unit] = m;
  const forms = new Set<string>([`${num}${unit}`]);
  if (unit) {
    forms.add(`${num} ${UNIT_WORD[unit]}`);
    const n = Number(num.replace(/,/g, ""));
    if (num.includes(".")) {
      // Rounded the way people say it: 52.2K → 52K; 2.75M → 2.8M (and 2.7M, rounding down is also honest with "over").
      if (n >= 10) forms.add(`${Math.round(n)}${unit}`);
      else {
        forms.add(`${(Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "")}${unit}`);
        forms.add(`${(Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, "")}${unit}`);
      }
    }
  }
  return [...forms];
}

/** The period's own numbers ("last 3 months" → "3 months"). */
export function periodForms(periodLabel: string): string[] {
  const out = new Set<string>();
  for (const m of String(periodLabel || "").matchAll(/\b(\d{1,2})\s+(day|days|week|weeks|month|months|year|years)\b/gi)) out.add(`${m[1]} ${m[2].toLowerCase()}`);
  return [...out];
}

/** The exact tokens the linter allows in a first email for this proof. */
export function proofAllowedNumbers(p: Pick<ProofSnapshot, "stats" | "periodLabel">): string[] {
  const out = new Set<string>();
  for (const s of quotableStats(p.stats)) for (const f of numberForms(s.value)) out.add(f);
  for (const f of periodForms(p.periodLabel)) out.add(f);
  return [...out];
}

// ── Extraction (vision) ────────────────────────────────────────────────────

export interface ExtractedProof {
  source: ProofSource;
  periodLabel: string;
  stats: ProofStat[];
  caption: string;
  /** Anything the model said it could not read, for the admin. */
  notes: string;
}

export const EXTRACTION_SCHEMA = {
  name: "analytics_screenshot",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["source", "periodLabel", "stats", "caption", "notes"],
    properties: {
      source: { type: "string", enum: [...PROOF_SOURCES] },
      periodLabel: { type: "string" },
      stats: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "value"],
          properties: { label: { type: "string" }, value: { type: "string" } },
        },
      },
      caption: { type: "string" },
      notes: { type: "string" },
    },
  },
};

export const EXTRACTION_SYSTEM = `You read analytics screenshots for a small Indian website (SubhSandesh) and copy the headline numbers off them exactly as printed. You never estimate, round, convert or invent a number. If a number is not clearly visible, leave it out and say so in "notes".

Return JSON:
- "source": "search_console" for Google Search Console (Performance report: Total clicks, Total impressions, Average CTR, Average position), "google_analytics" for Google Analytics (Users, New users, Sessions, Views, Event count), else "other".
- "periodLabel": the date range shown, in plain words, e.g. "last 3 months (Jul 17 – Oct 2026)" or "last 28 days". Copy the dates as printed.
- "stats": the headline totals, label and value exactly as printed (e.g. {"label": "Total clicks", "value": "52.2K"}, {"label": "Average CTR", "value": "1.9%"}). Totals only — not chart axis labels, not table rows. At most six.
- "caption": one short factual line describing the screenshot, e.g. "Google Search performance, last 3 months". No adjectives.
- "notes": what you could not read, or "".`;

/** Parse + sanitise the model's reading. Pure. Never throws on a bad stat — it drops it. */
export function parseProofExtraction(raw: string): ExtractedProof {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw);
  } catch {
    return { source: "other", periodLabel: "", stats: [], caption: "", notes: "The screenshot could not be read automatically — type the numbers in." };
  }
  const source = PROOF_SOURCES.includes(j.source as ProofSource) ? (j.source as ProofSource) : "other";
  const stats: ProofStat[] = [];
  const dropped: string[] = [];
  for (const s of Array.isArray(j.stats) ? (j.stats as unknown[]) : []) {
    const label = cleanText((s as ProofStat)?.label, 60);
    const value = normaliseStatValue((s as ProofStat)?.value);
    if (!label || !value) continue;
    if (!COUNT_RE.test(value) && !PERCENT_RE.test(value)) { dropped.push(`${label}: ${value}`); continue; }
    if (stats.some((x) => x.label.toLowerCase() === label.toLowerCase())) continue;
    stats.push({ label, value });
    if (stats.length >= PROOF_MAX_STATS) break;
  }
  const notes = [cleanText(j.notes, 240), dropped.length ? `Left out (not a plain number): ${dropped.join(", ")}` : ""].filter(Boolean).join(" · ");
  return { source, periodLabel: cleanText(j.periodLabel, 80), stats, caption: cleanText(j.caption, 280), notes };
}

/** Read the numbers off a processed screenshot. Sends the image itself (data URL), not the CDN link. */
export async function extractProofStats(img: Pick<ProcessedProofImage, "buffer" | "contentType">, complete: VisionCompletion = visionCompletion): Promise<ExtractedProof> {
  const dataUrl = `data:${img.contentType};base64,${img.buffer.toString("base64")}`;
  try {
    const raw = await complete(EXTRACTION_SYSTEM, "Copy the headline numbers off this analytics screenshot.", dataUrl, EXTRACTION_SCHEMA);
    return parseProofExtraction(raw || "");
  } catch (error) {
    console.warn("Proof extraction failed:", (error as Error)?.message);
    return { source: "other", periodLabel: "", stats: [], caption: "", notes: "The AI could not read the screenshot just now — type the numbers in." };
  }
}

// ── Fetching the image for an email ────────────────────────────────────────

export interface InlineImage {
  cid: string;
  filename: string;
  contentType: string;
  content: Buffer;
}

export type ImageFetcher = (url: string) => Promise<{ contentType: string; content: Buffer }>;

const cache = new Map<string, { contentType: string; content: Buffer }>();

/** Fetch a proof image from OUR CDN only, ≤ 3 MB. Cached in memory per URL (the keys are immutable). */
export const fetchProofImage: ImageFetcher = async (url) => {
  const hit = cache.get(url);
  if (hit) return hit;
  if (!proofImageHostOk(url)) throw new Error(`The screenshot is not on our CDN (${url}).`);
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Couldn't fetch the screenshot (${r.status}).`);
  const content = Buffer.from(await r.arrayBuffer());
  if (content.length > 3 * 1024 * 1024) throw new Error("The screenshot is over 3 MB.");
  const type = sniffProofImage(content);
  if (!type) throw new Error("The screenshot on the CDN is not an image.");
  const out = { contentType: `image/${type}`, content };
  if (cache.size > 20) cache.clear();
  cache.set(url, out);
  return out;
};

/** The inline attachment for one email: a stable cid, a plain filename. */
export async function inlineProofImage(p: ProofSnapshot, fetcher: ImageFetcher = fetchProofImage): Promise<InlineImage> {
  const { contentType, content } = await fetcher(p.imageUrl);
  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] || "png";
  return {
    cid: `proof-${String(p.id).slice(-12)}@subhsandesh.in`,
    filename: `${p.source === "search_console" ? "google-search-stats" : p.source === "google_analytics" ? "google-analytics-stats" : "stats"}.${ext}`,
    contentType,
    content,
  };
}

/** The alt text of the inline screenshot. */
export function screenshotAlt(source: ProofSource): string {
  return source === "search_console" ? "Google Search stats for SubhSandesh" : source === "google_analytics" ? "Google Analytics stats for SubhSandesh" : "SubhSandesh stats";
}

/**
 * A personal email's two parts. With the screenshot: the text part carries
 * "(screenshot of our Google Search stats attached)" and the HTML twin shows
 * the image at `imageSrc` — "cid:<id>" when sent, the CDN URL in the admin
 * preview (so the preview is exactly the email, image included). Without it:
 * text only, html "".
 */
export function personalEmailParts(o: {
  body: string;
  signature: string;
  proof?: Pick<ProofSnapshot, "source" | "width" | "height"> | null;
  imageSrc?: string;
}): { text: string; html: string } {
  if (!o.proof || !o.imageSrc) return { text: prospectPersonalText({ body: o.body, signature: o.signature }), html: "" };
  return {
    text: prospectPersonalText({ body: o.body, signature: o.signature, screenshotNote: screenshotNote(o.proof.source) }),
    html: prospectPersonalHtml({ body: o.body, signature: o.signature, image: { src: o.imageSrc, alt: screenshotAlt(o.proof.source), width: o.proof.width, height: o.proof.height } }),
  };
}
