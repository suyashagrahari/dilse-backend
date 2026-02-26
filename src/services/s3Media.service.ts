import crypto from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env";

type MediaKind = "image" | "audio";

export interface UploadToS3Options {
  folder: string;
  extension: string;
  contentType: string;
  buffer: Buffer;
  kind: MediaKind;
  cacheControl?: string;
}

export interface UploadedMediaResult {
  url: string;
  key: string;
  contentType: string;
  kind: MediaKind;
  size: number;
}

const hasS3Credentials =
  !!env.S3_REGION &&
  !!env.S3_BUCKET_NAME &&
  !!env.S3_ACCESS_KEY_ID &&
  !!env.S3_SECRET_ACCESS_KEY;

const s3 = hasS3Credentials
  ? new S3Client({
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    })
  : null;

const sanitizeSegment = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^-+|-+$/g, "")
    .replace(/^\/+|\/+$/g, "");

const getPublicUrl = (key: string): string => {
  if (env.S3_PUBLIC_BASE_URL) {
    const base = env.S3_PUBLIC_BASE_URL.replace(/\/+$/, "");
    return `${base}/${key}`;
  }
  return `https://${env.S3_BUCKET_NAME}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
};

export const ensureS3Configured = (): void => {
  if (!s3) {
    throw new Error(
      "S3 is not configured. Set S3_REGION, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }
};

export const uploadToS3 = async ({
  folder,
  extension,
  contentType,
  buffer,
  kind,
  cacheControl,
}: UploadToS3Options): Promise<UploadedMediaResult> => {
  ensureS3Configured();

  const monthPath = new Date().toISOString().slice(0, 7).replace("-", "/");
  const randomPart = crypto.randomBytes(8).toString("hex");
  const safeFolder = sanitizeSegment(folder || "general");
  const safePrefix = sanitizeSegment(env.S3_UPLOAD_PREFIX || "gifts-media");
  const safeExt = extension.replace(/^\./, "").toLowerCase();
  const key = `${safePrefix}/${safeFolder}/${monthPath}/${Date.now()}-${randomPart}.${safeExt}`;

  await s3!.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl:
        cacheControl || (kind === "image" ? "public, max-age=31536000, immutable" : "public, max-age=604800"),
    })
  );

  return {
    url: getPublicUrl(key),
    key,
    contentType,
    kind,
    size: buffer.length,
  };
};
