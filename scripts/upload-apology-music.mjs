import fs from "node:fs";
import dotenv from "dotenv";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

dotenv.config();

const prefix = (process.env.S3_UPLOAD_PREFIX || "gifts-media").replace(/^\/+|\/+$/g, "");
const files = [
  { src: "/Users/admin/Desktop/chalo jaane do... lyrics #shorts #lyrics #trending.mp3", key: `${prefix}/apology-dashboard/music/chalo-jaane-do.mp3` },
  { src: "/Users/admin/Desktop/sorry - justin bieber (lyrics) #trending #viral #shorts.mp3", key: `${prefix}/apology-dashboard/music/sorry-justin-bieber.mp3` },
];

const s3 = new S3Client({
  region: process.env.S3_REGION,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});
const base = (process.env.S3_PUBLIC_BASE_URL || `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com`).replace(/\/+$/, "");

for (const f of files) {
  const body = fs.readFileSync(f.src);
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: f.key,
    Body: body,
    ContentType: "audio/mpeg",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  console.log("UPLOADED:", `${base}/${f.key}`, `(${body.length} bytes)`);
}
