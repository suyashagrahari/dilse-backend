/**
 * One-shot bulk uploader for the Build-a-Bouquet template's static media
 * (flower + greenery webp, color/ and mono/).
 *
 * It walks client/public/assets/bouquet-gf and mirrors every file to S3 under
 *   <S3_UPLOAD_PREFIX>/bouquet-gf/<relative-path>
 * with STABLE keys + long cache-control. When done it prints the base URL to
 * paste into
 *   client/app/(templates)/bouquet-gf/components/assets.ts → BQ_MEDIA_BASE
 * (change bqMedia to prefix with the CDN base if you switch off local assets).
 *
 * Usage (from /server):
 *   npm run upload:bouquet-media          # upload everything
 *   npm run upload:bouquet-media -- --dry # list what would upload, no writes
 */
import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env";

const DRY = process.argv.includes("--dry");

const ASSETS_DIR = path.resolve(process.cwd(), "../client/public/assets/bouquet-gf");
const KEY_PREFIX = `${(env.S3_UPLOAD_PREFIX || "gifts-media").replace(/\/+$/, "")}/bouquet-gf`;

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
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
  if (files.length === 0) { console.error(`❌ No files found under ${ASSETS_DIR}`); process.exit(1); }

  console.log(`\n💐  Bouquet media → S3`);
  console.log(`   bucket : ${env.S3_BUCKET_NAME} (${env.S3_REGION})`);
  console.log(`   prefix : ${KEY_PREFIX}/`);
  console.log(`   files  : ${files.length}${DRY ? "   [DRY RUN]" : ""}\n`);

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
    urlMap[posixRel] = `${publicBase()}/${posixRel}`;

    if (DRY) { console.log(`   • would upload  ${posixRel}  →  ${key}  (${contentType})`); continue; }

    const buffer = fs.readFileSync(path.join(ASSETS_DIR, rel));
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    console.log(`   ✓ ${posixRel}  (${(buffer.length / 1024).toFixed(0)} KB)`);
  }

  console.log(`\n✅  Done. CDN base for bouquet-gf:\n   ${publicBase()}\n`);
  console.log(`   (e.g.) ${urlMap["color/rose.webp"] || Object.values(urlMap)[0]}\n`);
}

main().catch((err) => { console.error("❌ Upload failed:", err); process.exit(1); });
