// ─── What are these bytes, actually? ─────────────────────────────────────────
//
// Every audio bug this file exists to kill had the same shape: a decision made
// from a MIME string the browser handed us, which was wrong.
//
//   • Chrome's MediaRecorder reports `audio/webm;codecs=opus`. Compared against
//     a Set of bare types it matches nothing, so multer's fileFilter rejected
//     every voice note recorded in Chrome before the controller ever ran.
//   • A file picked through Drive, a downloads folder, or any Android picker
//     that does not recognise the extension arrives with `type === ""`.
//     `FileReader.readAsDataURL` then produces `data:;base64,…` or
//     `data:application/octet-stream;base64,…`, which matched neither the
//     `data:image/` nor the `data:audio/` branch of the payload walker — so the
//     megabyte of base64 was returned unchanged and written into Mongo, into a
//     String field with no maxlength. That is the "enormous music URL" in a
//     user's profile: not a URL at all, the whole song.
//
// A declared MIME is a hint. The bytes are the fact. This module reads the
// bytes, and everything downstream — allowed or not, which processor, which
// extension, which Content-Type on the S3 object — is decided from what it
// finds. It has no imports so `node --test` can exercise it directly.

export type SniffedKind = "image" | "audio" | "unknown";

export interface SniffResult {
  kind: SniffedKind;
  /** Canonical type, parameters stripped. Empty when `kind` is "unknown". */
  mimeType: string;
  /** Extension for the S3 key, no leading dot. Empty when `kind` is "unknown". */
  extension: string;
  /** True when the verdict came from the bytes rather than the declared type. */
  fromBytes: boolean;
}

const MIME_ALIASES: Record<string, string> = {
  // audio
  "audio/mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/wave": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/aac": "audio/mp4",
  "audio/aacp": "audio/mp4",
  "audio/x-aac": "audio/mp4",
  "audio/opus": "audio/ogg",
  "audio/vorbis": "audio/ogg",
  "audio/x-flac": "audio/flac",
  "audio/x-aiff": "audio/aiff",
  // image
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};

/**
 * `audio/WEBM;codecs=opus` → `audio/webm`, and the spellings browsers disagree
 * about collapse onto one name.
 *
 * Parameter stripping is the load-bearing half: a media type with parameters is
 * perfectly legal, and every Set-membership check in this codebase was written
 * as though it were not.
 */
export function normalizeMime(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const bare = value.split(";")[0].trim().toLowerCase();
  if (!bare) return "";
  return MIME_ALIASES[bare] || bare;
}

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/flac": "flac",
  "audio/aiff": "aiff",
  "audio/amr": "amr",
  "audio/x-caf": "caf",
  "audio/x-ms-wma": "wma",
  "audio/3gpp": "3gp",
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/svg+xml": "svg",
};

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

const ascii = (b: Buffer, start: number, length: number): string =>
  b.length >= start + length ? b.toString("latin1", start, start + length) : "";

const startsWithBytes = (b: Buffer, bytes: number[]): boolean =>
  b.length >= bytes.length && bytes.every((byte, i) => b[i] === byte);

/**
 * The brand inside an ISO base media container (`…ftyp<brand>`), which is the
 * only thing separating an m4a voice note from a HEIC photo — both are `ftyp`
 * boxes and both come off an iPhone.
 */
function fromIsoBaseMedia(buffer: Buffer): SniffResult | null {
  if (ascii(buffer, 4, 4) !== "ftyp") return null;
  const brand = ascii(buffer, 8, 4).trim().toLowerCase();

  if (brand === "heic" || brand === "heix" || brand === "hevc" || brand === "heim") {
    return { kind: "image", mimeType: "image/heic", extension: "heic", fromBytes: true };
  }
  if (brand === "mif1" || brand === "msf1") {
    return { kind: "image", mimeType: "image/heif", extension: "heif", fromBytes: true };
  }
  if (brand === "avif" || brand === "avis") {
    return { kind: "image", mimeType: "image/avif", extension: "avif", fromBytes: true };
  }
  if (brand.startsWith("3g")) {
    return { kind: "audio", mimeType: "audio/3gpp", extension: "3gp", fromBytes: true };
  }
  // M4A, M4B, mp42, isom, qt… — audio as far as this pipeline is concerned. We
  // store the bytes untouched and let the browser's <audio> element decode them.
  return { kind: "audio", mimeType: "audio/mp4", extension: "m4a", fromBytes: true };
}

/** An MPEG audio frame header: eleven set sync bits, and not a reserved version. */
function looksLikeMpegFrame(buffer: Buffer): boolean {
  if (buffer.length < 2) return false;
  if (buffer[0] !== 0xff) return false;
  if ((buffer[1] & 0xe0) !== 0xe0) return false;
  return ((buffer[1] >> 3) & 0x03) !== 0x01; // reserved MPEG version ID
}

/**
 * Identify a media buffer.
 *
 * `declaredMime` is consulted only when the bytes say nothing — an SVG, or a
 * codec this list has never heard of. It can never override a byte match,
 * because the whole point is that the declared value is the thing that lies.
 */
export function sniffMedia(buffer: Buffer, declaredMime?: string | null): SniffResult {
  const unknown: SniffResult = { kind: "unknown", mimeType: "", extension: "", fromBytes: false };
  if (!buffer || buffer.length < 4) return unknown;

  const magic4 = ascii(buffer, 0, 4);
  const declared = normalizeMime(declaredMime);

  // ── images ───────────────────────────────────────────────────────────────
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: "image", mimeType: "image/jpeg", extension: "jpg", fromBytes: true };
  }
  if (startsWithBytes(buffer, PNG_MAGIC)) {
    return { kind: "image", mimeType: "image/png", extension: "png", fromBytes: true };
  }
  if (magic4 === "GIF8") {
    return { kind: "image", mimeType: "image/gif", extension: "gif", fromBytes: true };
  }
  if (magic4 === "II* " || magic4 === "MM *") {
    return { kind: "image", mimeType: "image/tiff", extension: "tiff", fromBytes: true };
  }
  // Two ASCII bytes is a weak signal, so BM only counts when the declared type agrees.
  if (buffer[0] === 0x42 && buffer[1] === 0x4d && declared === "image/bmp") {
    return { kind: "image", mimeType: "image/bmp", extension: "bmp", fromBytes: true };
  }

  // ── RIFF containers: WAVE is audio, WEBP is an image ─────────────────────
  if (magic4 === "RIFF") {
    const form = ascii(buffer, 8, 4);
    if (form === "WEBP") {
      return { kind: "image", mimeType: "image/webp", extension: "webp", fromBytes: true };
    }
    if (form === "WAVE") {
      return { kind: "audio", mimeType: "audio/wav", extension: "wav", fromBytes: true };
    }
  }

  // ── audio ────────────────────────────────────────────────────────────────
  if (magic4 === "OggS") {
    return { kind: "audio", mimeType: "audio/ogg", extension: "ogg", fromBytes: true };
  }
  if (magic4 === "fLaC") {
    return { kind: "audio", mimeType: "audio/flac", extension: "flac", fromBytes: true };
  }
  if (magic4 === "caff") {
    return { kind: "audio", mimeType: "audio/x-caf", extension: "caf", fromBytes: true };
  }
  if (ascii(buffer, 0, 5) === "#!AMR") {
    return { kind: "audio", mimeType: "audio/amr", extension: "amr", fromBytes: true };
  }
  if (magic4 === "FORM") {
    const form = ascii(buffer, 8, 4);
    if (form === "AIFF" || form === "AIFC") {
      return { kind: "audio", mimeType: "audio/aiff", extension: "aiff", fromBytes: true };
    }
  }
  if (ascii(buffer, 0, 3) === "ID3" || looksLikeMpegFrame(buffer)) {
    return { kind: "audio", mimeType: "audio/mpeg", extension: "mp3", fromBytes: true };
  }
  // ASF / WMA
  if (startsWithBytes(buffer, [0x30, 0x26, 0xb2, 0x75])) {
    return { kind: "audio", mimeType: "audio/x-ms-wma", extension: "wma", fromBytes: true };
  }

  // ── EBML: Matroska carries both, and the declared type is the only hint ──
  //
  // A MediaRecorder blob is `audio/webm` or `video/webm` and the header is
  // identical for both. We keep the container either way — this pipeline stores
  // a recording, it does not transcode — and only the label differs.
  if (startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { kind: "audio", mimeType: "audio/webm", extension: "webm", fromBytes: true };
  }

  // ── ISO base media (ftyp) ────────────────────────────────────────────────
  const iso = fromIsoBaseMedia(buffer);
  if (iso) return iso;

  // ── nothing in the bytes: fall back to a declared type we recognise ──────
  if (IMAGE_EXTENSIONS[declared]) {
    return { kind: "image", mimeType: declared, extension: IMAGE_EXTENSIONS[declared], fromBytes: false };
  }
  if (AUDIO_EXTENSIONS[declared]) {
    return { kind: "audio", mimeType: declared, extension: AUDIO_EXTENSIONS[declared], fromBytes: false };
  }

  return unknown;
}

/** The `data:` URL header a browser produced, split from its payload. */
export interface ParsedDataUrl {
  /** Normalized; empty string when the URL carried no type (`data:;base64,…`). */
  declaredMime: string;
  buffer: Buffer;
}

/**
 * Parse any base64 data URL, including the two shapes that used to fall through
 * every branch and get stored whole: `data:;base64,…` and
 * `data:application/octet-stream;base64,…`.
 */
export function parseAnyDataUrl(value: string): ParsedDataUrl | null {
  if (typeof value !== "string" || !value.startsWith("data:")) return null;
  const comma = value.indexOf(",");
  if (comma < 0) return null;

  const header = value.slice(5, comma);
  if (!/(^|;)base64$/i.test(header)) return null; // percent-encoded data URLs are not media here

  const declaredMime = normalizeMime(header.split(";")[0]);
  const buffer = Buffer.from(value.slice(comma + 1), "base64");
  if (!buffer.length) return null;

  return { declaredMime, buffer };
}
