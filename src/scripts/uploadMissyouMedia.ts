/**
 * One-shot bulk uploader for the Miss-You template's static media (gifs + songs).
 *
 * It walks client/public/assets/missyou-gf and mirrors every file to S3 under
 *   <S3_UPLOAD_PREFIX>/missyou-gf/<relative-path>
 * with STABLE keys (no random suffix) + long cache-control, so the URLs are
 * predictable. When it finishes it prints the exact base URL to paste into
 *   client/app/(templates)/missyou-gf/components/assets.ts  → MU_MEDIA_BASE
 *
 * Usage (from /server):
 *   npm run upload:missyou-media          # upload everything
 *   npm run upload:missyou-media -- --dry # list what would upload, no writes
 *
 * Credentials come from the same .env the server uses (S3_* vars).
 */
import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env";

const DRY = process.argv.includes("--dry");

const ASSETS_DIR = path.resolve(process.cwd(), "../client/public/assets/missyou-gf");
const KEY_PREFIX = `${(env.S3_UPLOAD_PREFIX || "gifts-media").replace(/\/+$/, "")}/missyou-gf`;

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile() && !entry.name.startsWith(".")) out.push(path.relative(base, full));
  }
  return out;
}

function publicBase(): string {
  if (env.S3_PUBLIC_BASE_URL) return `${env.S3_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${KEY_PREFIX}`;
  return `https://${env.S3_BUCKET_NAME}.s3.${env.S3_REGION}.amazonaws.com/${KEY_PREFIX}`;
}

async function main() {
  if (!env.S3_REGION || !env.S3_BUCKET_NAME || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    console.error("❌ S3 is not configured. Set S3_REGION, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in server/.env");
    process.exit(1);
  }
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`❌ Assets folder not found: ${ASSETS_DIR}`);
    process.exit(1);
  }

  const files = walk(ASSETS_DIR).sort();
  if (files.length === 0) {
    console.error(`❌ No files found under ${ASSETS_DIR}`);
    process.exit(1);
  }

  console.log(`\n🎁  Miss-You media → S3`);
  console.log(`   bucket : ${env.S3_BUCKET_NAME} (${env.S3_REGION})`);
  console.log(`   prefix : ${KEY_PREFIX}/`);
  console.log(`   source : ${ASSETS_DIR}`);
  console.log(`   files  : ${files.length}${DRY ? "   [DRY RUN — nothing will be written]" : ""}\n`);

  const s3 = new S3Client({
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });

  const urlMap: Record<string, string> = {};
  for (const rel of files) {
    const posixRel = rel.split(path.sep).join("/");
    const key = `${KEY_PREFIX}/${posixRel}`;
    const ext = path.extname(rel).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    const url = `${publicBase()}/${posixRel}`;
    urlMap[posixRel] = url;

    if (DRY) {
      console.log(`   • would upload  ${posixRel}  →  ${key}  (${contentType})`);
      continue;
    }

    const buffer = fs.readFileSync(path.join(ASSETS_DIR, rel));
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    console.log(`   ✓ ${posixRel}  (${(buffer.length / 1024).toFixed(0)} KB)`);
  }

  console.log(`\n✅  Done. Set MU_MEDIA_BASE in assets.ts to:\n`);
  console.log(`   ${publicBase()}\n`);
  console.log(`   (verify one URL opens in a browser, e.g.)`);
  console.log(`   ${urlMap["chibi-phones.gif"] || Object.values(urlMap)[0]}\n`);
}

main().catch((err) => {
  console.error("❌ Upload failed:", err);
  process.exit(1);
});
