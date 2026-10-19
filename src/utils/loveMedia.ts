// ─── Shared "love kit" media: framed photos with little letters, GIFs, themes ─
//
// Kundli Milan, Train Ticket, Legal Notice and Court Marriage all let the
// sender attach the same things: up to eight photos (each framed in the editor
// and carrying an optional little letter), up to three GIFs, one main letter
// and a colour theme. The schema, the limits and the sanitising live here so
// the four templates cannot drift apart.

import { Schema } from "mongoose";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";

/** A photo of the two of them, framed in the editor, with a little letter. */
export interface ILovePhoto {
  url: string;
  caption?: string;
  note?: string;
  /** Focal point, 0–100 on each axis. */
  cropX?: number;
  cropY?: number;
  /** Zoom, 100–300 (percent). */
  scale?: number;
  /**
   * Masonry galleries only (the wedding kit): how much room the photo takes —
   * "wide" = two columns, "tall" = 1.5× its natural height, "large" = both.
   * Absent = "normal". Every other template ignores it.
   */
  span?: PhotoSpan;
  /** Natural pixel size, measured in the editor, so a masonry lays out before the image loads (no CLS). */
  w?: number;
  h?: number;
}

export const PHOTO_SPANS = ["normal", "wide", "tall", "large"] as const;
export type PhotoSpan = (typeof PHOTO_SPANS)[number];

export const LOVE_LIMITS = {
  maxPhotos: 10,
  maxGifs: 3,
  photoCaption: 80,
  photoNote: 600,
  letter: 2000,
  url: 2000,
  theme: 24,
  lockQuestion: 140,
  lockAnswer: 40,
} as const;

export const lovePhotoSchema = new Schema<ILovePhoto>(
  {
    url: { type: String, required: true, maxlength: LOVE_LIMITS.url },
    caption: { type: String, maxlength: LOVE_LIMITS.photoCaption },
    note: { type: String, maxlength: LOVE_LIMITS.photoNote },
    cropX: { type: Number, min: 0, max: 100 },
    cropY: { type: Number, min: 0, max: 100 },
    scale: { type: Number, min: 100, max: 300 },
    span: { type: String, enum: PHOTO_SPANS },
    w: { type: Number, min: 1, max: 20000 },
    h: { type: Number, min: 1, max: 20000 },
  },
  { _id: false }
);

/** The four schema paths every love-kit template adds. */
export const loveKitFields = {
  photos: { type: [lovePhotoSchema], default: [] },
  gifs: { type: [String], default: [] },
  letter: { type: String, default: "", maxlength: LOVE_LIMITS.letter },
  theme: { type: String, default: "", maxlength: LOVE_LIMITS.theme },
  /** The question that unlocks the letter ("" = the template's default). */
  lockQuestion: { type: String, default: "", maxlength: LOVE_LIMITS.lockQuestion },
  /** The label on the button that answers it ("" = the template's default). */
  lockAnswer: { type: String, default: "", maxlength: LOVE_LIMITS.lockAnswer },
};

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

export const httpsUrl = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim().slice(0, LOVE_LIMITS.url) : "";
  return /^https:\/\/\S+$/i.test(s) ? s : "";
};

const clampNum = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
};

/**
 * Photos arrive as compressed data URLs straight from the editor (uploaded to
 * S3 here, only the link is stored) or as links already uploaded. A failed
 * upload drops that one photo rather than failing the save.
 */
export const sanitizeLovePhotos = async (
  raw: unknown,
  folder: string,
  /** Templates that allow more than the shared ten (the premium tier keeps 12). */
  max: number = LOVE_LIMITS.maxPhotos
): Promise<ILovePhoto[]> => {
  if (!Array.isArray(raw)) return [];
  const out: ILovePhoto[] = [];
  for (const item of raw.slice(0, 40)) {
    if (out.length >= max) break;
    const src = (item ?? {}) as Record<string, unknown>;
    let url = typeof src.url === "string" ? src.url.trim() : "";
    if (url.startsWith("data:")) {
      try {
        url = (await uploadImageDataUrl(url, folder)).url;
      } catch (error) {
        console.error(`Photo upload error (${folder}):`, error);
        continue;
      }
    } else {
      url = httpsUrl(url);
    }
    if (!url) continue;
    const photo: ILovePhoto = { url };
    const caption = str(src.caption, LOVE_LIMITS.photoCaption).trim();
    if (caption) photo.caption = caption;
    const note = str(src.note, LOVE_LIMITS.photoNote).trim();
    if (note) photo.note = note;
    const cropX = clampNum(src.cropX, 0, 100);
    const cropY = clampNum(src.cropY, 0, 100);
    const scale = clampNum(src.scale, 100, 300);
    if (cropX !== undefined) photo.cropX = cropX;
    if (cropY !== undefined) photo.cropY = cropY;
    if (scale !== undefined) photo.scale = scale;
    // Masonry layout hints. "normal" is the default and is not stored.
    if (typeof src.span === "string" && src.span !== "normal" && (PHOTO_SPANS as readonly string[]).includes(src.span)) {
      photo.span = src.span as PhotoSpan;
    }
    const w = typeof src.w === "number" ? clampNum(src.w, 1, 20000) : undefined;
    const h = typeof src.h === "number" ? clampNum(src.h, 1, 20000) : undefined;
    if (w !== undefined && h !== undefined) {
      photo.w = Math.round(w);
      photo.h = Math.round(h);
    }
    out.push(photo);
  }
  return out;
};

/** https links only, deduplicated, at most three. */
export const sanitizeLoveGifs = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const g of raw.slice(0, 20)) {
    const url = httpsUrl(g);
    if (url && !out.includes(url)) out.push(url);
    if (out.length >= LOVE_LIMITS.maxGifs) break;
  }
  return out;
};

export const sanitizeLoveLetter = (raw: unknown): string => str(raw, LOVE_LIMITS.letter);

/** The letter lock: a short question and the label of the answer that opens it. */
export const sanitizeLock = (b: { lockQuestion?: unknown; lockAnswer?: unknown }) => ({
  lockQuestion: str(b.lockQuestion, LOVE_LIMITS.lockQuestion).trim(),
  lockAnswer: str(b.lockAnswer, LOVE_LIMITS.lockAnswer).trim(),
});

/** A theme id from the template's own list; anything else falls back to "". */
export const sanitizeTheme = (raw: unknown, allowed: readonly string[]): string => {
  const s = typeof raw === "string" ? raw.trim().slice(0, LOVE_LIMITS.theme) : "";
  return allowed.includes(s) ? s : "";
};

export const userPhotoFolder = (slug: string, userId: unknown): string =>
  `${slug}/users/${String(userId || "anonymous")}/photos`;
