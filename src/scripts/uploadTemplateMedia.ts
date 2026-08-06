/**
 * Bulk uploader for the document-template media set (court-marriage,
 * hold-my-hand, train-ticket, legal-notice).
 *
 * Unlike the bouquet uploader, the source folder for these lives OUTSIDE both
 * git repos — at <repo-root>/../media-src/templates. That is deliberate: these
 * assets are binary, they never diff usefully, and they are served from S3 in
 * every environment, so keeping a second copy under client/public only bloats
 * the repo and the Docker image. media-src is the source of truth; S3 is the
 * origin; the repo carries neither.
 *
 * Mirrors every file to
 *   <S3_UPLOAD_PREFIX>/templates/<slug>/<file>
 * with stable keys and a 1-year immutable cache. Keys are stable, so a re-run
 * overwrites in place and the URLs in client/app/(templates)/<slug>/assets.ts
 * never change.
 *
 * Usage (from /server):
 *   npm run upload:template-media            # upload everything
 *   npm run upload:template-media -- --dry   # list what would upload
 *   npm run upload:template-media -- --only=train-ticket
 */
import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env";

const DRY = process.argv.includes("--dry");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";

const SLUGS = ["court-marriage", "hold-my-hand", "train-ticket", "legal-notice"];

/** Source of truth, intentionally outside the repos. */
const MEDIA_SRC = path.resolve(process.cwd(), "../media-src/templates");
const KEY_ROOT = `${(env.S3_UPLOAD_PREFIX || "gifts-media").replace(/\/+$/, "")}/templates`;

const CONTENT_TYPES: Record<string, string> = {
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function publicBase(): string {
  if (env.S3_PUBLIC_BASE_URL) return `${env.S3_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${KEY_ROOT}`;
  return `https://${env.S3_BUCKET_NAME}.s3.${env.S3_REGION}.amazonaws.com/${KEY_ROOT}`;
}

async function main() {
  if (!env.S3_REGION || !env.S3_BUCKET_NAME || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    console.error("❌ S3 is not configured. Set S3_REGION, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in server/.env");
    process.exit(1);
  }
  if (!fs.existsSync(MEDIA_SRC)) {
    console.error(`❌ Media source not found: ${MEDIA_SRC}`);
    console.error("   This folder is the source of truth and is deliberately not in git.");
    process.exit(1);
  }

  const slugs = ONLY ? SLUGS.filter((s) => s === ONLY) : SLUGS;
  if (slugs.length === 0) { console.error(`❌ Unknown --only=${ONLY}. Known: ${SLUGS.join(", ")}`); process.exit(1); }

  const s3 = new S3Client({
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });

  console.log(`\n🗂   Template media → S3`);
  console.log(`   bucket : ${env.S3_BUCKET_NAME} (${env.S3_REGION})`);
  console.log(`   prefix : ${KEY_ROOT}/`);
  console.log(`   source : ${MEDIA_SRC}${DRY ? "   [DRY RUN]" : ""}\n`);

  let count = 0;
  let bytes = 0;

  for (const slug of slugs) {
    const dir = path.join(MEDIA_SRC, slug);
    if (!fs.existsSync(dir)) { console.log(`   – ${slug}: no folder, skipped`); continue; }

    const files = fs.readdirSync(dir).filter((f) => !f.startsWith(".")).sort();
    console.log(`   ${slug}/`);

    for (const file of files) {
      const key = `${KEY_ROOT}/${slug}/${file}`;
      const ext = path.extname(file).toLowerCase();
      const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

      if (DRY) { console.log(`     • would upload ${file}  →  ${key}  (${contentType})`); continue; }

      const buffer = fs.readFileSync(path.join(dir, file));
      await s3.send(new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // Keys are stable and content is versioned by filename, so this can be
        // cached forever. Re-running the uploader replaces the object in place.
        CacheControl: "public, max-age=31536000, immutable",
      }));
      count += 1;
      bytes += buffer.length;
      console.log(`     ✓ ${file.padEnd(28)} ${(buffer.length / 1024).toFixed(0)} KB  ${contentType}`);
    }
  }

  console.log(`\n✅  ${DRY ? "Dry run complete" : `Uploaded ${count} files (${(bytes / 1024 / 1024).toFixed(2)} MB)`}`);
  console.log(`   Base URL for client/app/(templates)/<slug>/assets.ts:\n   ${publicBase()}/<slug>\n`);
}

main().catch((err) => { console.error("❌ Upload failed:", err); process.exit(1); });
