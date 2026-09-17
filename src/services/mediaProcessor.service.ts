import sharp from "sharp";
import { uploadToS3, type UploadedMediaResult } from "./s3Media.service";
import { normalizeMime, parseAnyDataUrl, sniffMedia, type SniffResult } from "./mediaSniff";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

// ── WHY THESE SETS ARE ONLY A COURTESY NOW ──────────────────────────────────
//
// They used to be the gate, and they were the bug: `audio/webm;codecs=opus` —
// the literal string Chrome's MediaRecorder reports — is not in any of them,
// and neither is the empty type a file picked from Drive arrives with. What
// decides now is `sniffMedia`, which reads the container's magic bytes. These
// lists survive only so `isAllowedUploadMime` can answer multer's fileFilter,
// which runs before a single byte of the file has been buffered.
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/tiff",
  "image/svg+xml",
]);

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/flac",
  "audio/aiff",
  "audio/amr",
  "audio/x-caf",
  "audio/x-ms-wma",
  "audio/3gpp",
]);

/**
 * What a browser sends when it has no idea what the file is. Waved through the
 * fileFilter on purpose: the controller sniffs the bytes a moment later and
 * rejects it there if it turns out not to be media at all. Refusing it here
 * instead is what made "upload a song" fail on half of Android.
 */
const UNDECIDED_MIMES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

export interface MediaTransformOptions {
  template: string;
  userId?: string;
}

const audioExtensionForMime = (mimeType: string): string => {
  const normalized = normalizeMime(mimeType);
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "audio/webm") return "webm";
  if (normalized === "audio/ogg") return "ogg";
  if (normalized === "audio/mp4") return "m4a";
  if (normalized === "audio/flac") return "flac";
  if (normalized === "audio/3gpp") return "3gp";
  return "wav";
};

const processImageBuffer = async (buffer: Buffer): Promise<Buffer> => {
  return sharp(buffer)
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
};

/**
 * Identify a buffer, or explain in one sentence why it cannot be stored.
 *
 * `expected` narrows the answer for the callers that know what they asked for,
 * so a photo field handed an mp3 still fails loudly instead of quietly storing
 * a song where a picture belongs.
 */
const identify = (
  buffer: Buffer,
  declaredMime: string | null | undefined,
  expected?: "image" | "audio"
): SniffResult => {
  const sniffed = sniffMedia(buffer, declaredMime);

  if (sniffed.kind === "unknown") {
    throw new Error(
      expected === "audio"
        ? "That audio file could not be read. Try an mp3, m4a, wav, ogg or webm."
        : expected === "image"
          ? "That image could not be read. Try a jpg, png, webp or heic."
          : "That file could not be read as an image or an audio clip."
    );
  }
  if (expected && sniffed.kind !== expected) {
    throw new Error(
      expected === "audio"
        ? `Expected an audio clip but received ${sniffed.mimeType}.`
        : `Expected an image but received ${sniffed.mimeType}.`
    );
  }
  return sniffed;
};

const enforceSize = (buffer: Buffer, kind: "image" | "audio"): void => {
  if (kind === "image" && buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image file is too large. Max supported size is 12MB.");
  }
  if (kind === "audio" && buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large. Max supported size is 20MB.");
  }
};

// ─── the two primitives everything else routes through ──────────────────────

export const uploadImageBuffer = async (
  buffer: Buffer,
  mimeType: string,
  folder: string
): Promise<UploadedMediaResult> => {
  identify(buffer, mimeType, "image");
  enforceSize(buffer, "image");

  const optimized = await processImageBuffer(buffer);
  return uploadToS3({
    folder,
    extension: "webp",
    contentType: "image/webp",
    buffer: optimized,
    kind: "image",
  });
};

export const uploadAudioBuffer = async (
  buffer: Buffer,
  mimeType: string,
  folder: string
): Promise<UploadedMediaResult> => {
  const sniffed = identify(buffer, mimeType, "audio");
  enforceSize(buffer, "audio");

  // The sniffed type, not the declared one: an object served with the wrong
  // Content-Type is an <audio> element that silently refuses to play.
  return uploadToS3({
    folder,
    extension: sniffed.extension || audioExtensionForMime(sniffed.mimeType),
    contentType: sniffed.mimeType,
    buffer,
    kind: "audio",
  });
};

/**
 * Store a buffer as whatever it turns out to be.
 *
 * Used where the caller genuinely does not know — the payload walker, and the
 * `/media/upload` endpoint, whose `kind` field is a client's guess and was
 * hardcoded to "image" for years.
 */
export const uploadMediaBuffer = async (
  buffer: Buffer,
  mimeType: string,
  folder: string
): Promise<UploadedMediaResult> => {
  const sniffed = identify(buffer, mimeType);
  return sniffed.kind === "image"
    ? uploadImageBuffer(buffer, sniffed.mimeType, folder)
    : uploadAudioBuffer(buffer, sniffed.mimeType, folder);
};

// ─── data URLs ──────────────────────────────────────────────────────────────

const decodeOrThrow = (dataUrl: string, expected?: "image" | "audio") => {
  const parsed = parseAnyDataUrl(dataUrl);
  if (!parsed) {
    const preview = typeof dataUrl === "string" ? dataUrl.slice(0, 80) : String(dataUrl);
    throw new Error(
      `Unsupported ${expected || "media"} data URL format. Received: "${preview}..."`
    );
  }
  return parsed;
};

export const uploadImageDataUrl = async (dataUrl: string, folder: string): Promise<UploadedMediaResult> => {
  const { buffer, declaredMime } = decodeOrThrow(dataUrl, "image");
  return uploadImageBuffer(buffer, declaredMime, folder);
};

export const uploadAudioDataUrl = async (dataUrl: string, folder: string): Promise<UploadedMediaResult> => {
  const { buffer, declaredMime } = decodeOrThrow(dataUrl, "audio");
  return uploadAudioBuffer(buffer, declaredMime, folder);
};

/**
 * Answer multer's fileFilter, which sees a MIME string and nothing else.
 *
 * Deliberately permissive. Anything that could plausibly be media gets through
 * so the controller can look at the bytes; the real refusal happens there. The
 * only thing this still stops is an obviously wrong upload — a PDF, a zip —
 * before 20MB of it is buffered into memory.
 */
export const isAllowedUploadMime = (mimeType: string): boolean => {
  const normalized = normalizeMime(mimeType);
  if (UNDECIDED_MIMES.has(normalized)) return true;
  if (ALLOWED_IMAGE_MIMES.has(normalized) || ALLOWED_AUDIO_MIMES.has(normalized)) return true;
  // A type we have no entry for but whose family is right: a codec that did not
  // exist when this list was written should not cost a user their voice note.
  return normalized.startsWith("image/") || normalized.startsWith("audio/");
};

// ─── walking a whole page payload ───────────────────────────────────────────

/**
 * Replace every inline data URL in a page payload with the S3 URL of its bytes.
 *
 * ── THE RULE THIS ENFORCES ─────────────────────────────────────────────────
 *
 * No base64 blob is ever written to Mongo. The previous version only recognised
 * strings beginning `data:image/` or `data:audio/` and returned everything else
 * untouched — so a recording the browser could not name (`data:;base64,…`, or
 * `data:application/octet-stream;base64,…`) was persisted in full into a String
 * field with no maxlength, and turned up in the user's profile as a "music URL"
 * several megabytes long.
 *
 * Now anything that decodes as a base64 data URL is sniffed and uploaded. If it
 * is genuinely not media, the save fails with a sentence naming the field —
 * which is recoverable — rather than succeeding with a document that is not.
 */
export const transformMediaPayload = async <T>(
  payload: T,
  options: MediaTransformOptions
): Promise<T> => {
  const baseFolder = `${options.template}/users/${options.userId || "anonymous"}`;

  const transformNode = async (value: unknown, path = "root"): Promise<unknown> => {
    if (typeof value === "string") {
      if (!value.startsWith("data:")) return value;

      const parsed = parseAnyDataUrl(value);
      // Not base64 — a percent-encoded `data:text/plain,hi` or similar. Tiny and
      // harmless, and not this module's business.
      if (!parsed) return value;

      try {
        const uploaded = await uploadMediaBuffer(parsed.buffer, parsed.declaredMime, `${baseFolder}/${path}`);
        return uploaded.url;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "could not be stored";
        throw new Error(`${path.replace(/^root\//, "")}: ${reason}`);
      }
    }

    if (Array.isArray(value)) {
      return Promise.all(value.map((item, index) => transformNode(item, `${path}/${index}`)));
    }

    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      const transformedEntries = await Promise.all(
        entries.map(async ([key, val]) => [key, await transformNode(val, `${path}/${key}`)] as const)
      );
      return Object.fromEntries(transformedEntries);
    }

    return value;
  };

  return (await transformNode(payload)) as T;
};

/**
 * Upload one media field and return the URL to store in its place.
 *
 * ── WHY A SINGLE-FIELD FORM EXISTS ──────────────────────────────────────────
 *
 * Most templates carry one photograph — `photoUrl`, `imageUrl`, `qrImageUrl` —
 * assigned in both create and update. Written out longhand that is a four-line
 * `transformMediaPayload` call in twenty places, and the shape of the wrapper
 * object is the sort of detail that gets copied slightly wrong once and stores
 * a data URL forever.
 *
 * Returns "" for anything that is not a string, matching what the call sites
 * were already doing with `typeof x === "string" ? x : ""`.
 *
 * A value that is already a URL passes straight through — `transformMediaPayload`
 * only touches strings beginning `data:` — so this is safe to call on every
 * save, including one where the user did not change the picture.
 */
export const uploadMediaField = async (
  value: unknown,
  template: string,
  userId: string | undefined
): Promise<string> => {
  const out = await transformMediaPayload(
    { value: typeof value === "string" ? value : "" },
    { template, userId }
  );
  return out.value;
};
