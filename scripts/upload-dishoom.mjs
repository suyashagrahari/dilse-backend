import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

dotenv.config();

const SRC = "/Users/admin/Desktop/_Dishoom_Sound_Ringtone_(by Fringster.com).mp3";
const prefix = (process.env.S3_UPLOAD_PREFIX || "gifts-media").replace(/^\/+|\/+$/g, "");
const key = `${prefix}/apology-dashboard/sfx/dishoom.mp3`;

const s3 = new S3Client({
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

const body = fs.readFileSync(SRC);
await s3.send(
  new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: "audio/mpeg",
    CacheControl: "public, max-age=31536000, immutable",
  })
);

const base = (process.env.S3_PUBLIC_BASE_URL || `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com`).replace(/\/+$/, "");
console.log("UPLOADED:", `${base}/${key}`);
console.log("SIZE:", body.length, "bytes");
