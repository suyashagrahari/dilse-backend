import sharp from "sharp";
import { uploadToS3, type UploadedMediaResult } from "./s3Media.service";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
]);

interface ParsedDataUrl {
  mimeType: string;
  buffer: Buffer;
}

export interface MediaTransformOptions {
  template: "eid" | "holi" | "wedding" | "reception" | "shaadi" | "christian-wedding" | "love-gf" | "darling";
  userId?: string;
}

const parseDataUrl = (value: string): ParsedDataUrl | null => {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");

  if (!buffer.length) return null;
  return { mimeType, buffer };
};

const audioExtensionForMime = (mimeType: string): string => {
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") return "mp3";
  if (mimeType === "audio/webm") return "webm";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4" || mimeType === "audio/aac" || mimeType === "audio/x-m4a") return "mp4";
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

export const uploadImageDataUrl = async (dataUrl: string, folder: string): Promise<UploadedMediaResult> => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !ALLOWED_IMAGE_MIMES.has(parsed.mimeType)) {
    throw new Error("Unsupported image data URL format.");
  }
  if (parsed.buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image file is too large. Max supported size is 12MB.");
  }

  const optimized = await processImageBuffer(parsed.buffer);

  return uploadToS3({
    folder,
    extension: "webp",
    contentType: "image/webp",
    buffer: optimized,
    kind: "image",
  });
};

export const uploadAudioDataUrl = async (dataUrl: string, folder: string): Promise<UploadedMediaResult> => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !ALLOWED_AUDIO_MIMES.has(parsed.mimeType)) {
    throw new Error("Unsupported audio format. Use mp3 or wav.");
  }
  if (parsed.buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large. Max supported size is 20MB.");
  }

  return uploadToS3({
    folder,
    extension: audioExtensionForMime(parsed.mimeType),
    contentType: parsed.mimeType,
    buffer: parsed.buffer,
    kind: "audio",
  });
};

export const uploadImageBuffer = async (
  buffer: Buffer,
  mimeType: string,
  folder: string
): Promise<UploadedMediaResult> => {
  const normalizedMime = mimeType.toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(normalizedMime)) {
    throw new Error("Unsupported image format.");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image file is too large. Max supported size is 12MB.");
  }
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
  const normalizedMime = mimeType.toLowerCase();
  if (!ALLOWED_AUDIO_MIMES.has(normalizedMime)) {
    throw new Error("Unsupported audio format. Use mp3 or wav.");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large. Max supported size is 20MB.");
  }
  return uploadToS3({
    folder,
    extension: audioExtensionForMime(normalizedMime),
    contentType: normalizedMime,
    buffer,
    kind: "audio",
  });
};

export const isAllowedUploadMime = (mimeType: string): boolean => {
  const normalizedMime = mimeType.toLowerCase();
  return ALLOWED_IMAGE_MIMES.has(normalizedMime) || ALLOWED_AUDIO_MIMES.has(normalizedMime);
};

export const transformMediaPayload = async <T>(
  payload: T,
  options: MediaTransformOptions
): Promise<T> => {
  const baseFolder = `${options.template}/users/${options.userId || "anonymous"}`;

  const transformNode = async (value: unknown, path = "root"): Promise<unknown> => {
    if (typeof value === "string") {
      if (!value.startsWith("data:")) return value;
      if (value.startsWith("data:image/")) {
        const uploaded = await uploadImageDataUrl(value, `${baseFolder}/${path}`);
        return uploaded.url;
      }
      if (value.startsWith("data:audio/")) {
        const uploaded = await uploadAudioDataUrl(value, `${baseFolder}/${path}`);
        return uploaded.url;
      }
      return value;
    }

    if (Array.isArray(value)) {
      const transformedArray = await Promise.all(
        value.map((item, index) => transformNode(item, `${path}/${index}`))
      );
      return transformedArray;
    }

    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      const transformedEntries = await Promise.all(
        entries.map(async ([key, val]) => {
          const transformedValue = await transformNode(val, `${path}/${key}`);
          return [key, transformedValue] as const;
        })
      );
      return Object.fromEntries(transformedEntries);
    }

    return value;
  };

  return (await transformNode(payload)) as T;
};
