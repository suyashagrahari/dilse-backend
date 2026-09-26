import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { uploadToS3 } from "./s3Media.service";

/**
 * Short personal videos (the dedication radio's "clips").
 *
 * The phone hands us whatever its camera wrote — a 10MB HEVC .mov, a 4K webm —
 * and a recipient on mobile data should not pay for that. Every upload is
 * re-encoded to H.264/AAC mp4 at no more than 720p with faststart, which plays
 * inline on every browser including iOS Safari, and is typically 3–6x smaller.
 *
 * If ffmpeg is missing (a laptop without it) or the transcode fails, an input
 * that is already a browser-playable container is stored as-is rather than
 * failing the upload: a bigger file beats a lost video.
 */

export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
/** A clip, not a film. Anything longer is trimmed to this. */
const MAX_VIDEO_SECONDS = 180;
const TRANSCODE_TIMEOUT_MS = 150_000;

export interface UploadedVideoResult {
  url: string;
  posterUrl: string;
  size: number;
  originalSize: number;
  transcoded: boolean;
}

const PLAYABLE_AS_IS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const isAllowedVideoMime = (mime: string): boolean => {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  return m.startsWith("video/") || m === "" || m === "application/octet-stream";
};

/** ISO-BMFF (`ftyp` at offset 4), EBML (webm/mkv), or AVI. */
const looksLikeVideo = (buf: Buffer): boolean => {
  if (buf.length < 12) return false;
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return true;
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "AVI ") return true;
  return false;
};

const run = (args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("video transcode timed out"));
    }, TRANSCODE_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.split("\n").slice(-3).join(" ")}`));
    });
  });

export const uploadVideoBuffer = async (
  buffer: Buffer,
  mimeType: string,
  folder: string
): Promise<UploadedVideoResult> => {
  if (buffer.length > MAX_VIDEO_BYTES) throw new Error("Video is too large. Max size is 10MB.");
  if (!looksLikeVideo(buffer)) throw new Error("That file could not be read as a video. Try an mp4 or mov.");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vid-"));
  const input = path.join(dir, "in");
  const output = path.join(dir, "out.mp4");
  const poster = path.join(dir, "poster.jpg");

  try {
    await fs.writeFile(input, buffer);

    let videoBuf: Buffer | null = null;
    try {
      await run([
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", input,
        "-t", String(MAX_VIDEO_SECONDS),
        // Shorter side capped at 720, never upscaled, even dimensions for x264.
        "-vf", "scale='trunc(iw*min(1,720/min(iw,ih))/2)*2':'trunc(ih*min(1,720/min(iw,ih))/2)*2',fps=30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-profile:v", "main",
        "-c:a", "aac", "-b:a", "96k", "-ac", "2",
        "-movflags", "+faststart",
        output,
      ]);
      videoBuf = await fs.readFile(output);
    } catch (e) {
      console.warn("[video] transcode failed, storing original:", e instanceof Error ? e.message : e);
    }

    let transcoded = Boolean(videoBuf);
    // A transcode that came out bigger than the source bought nothing.
    if (videoBuf && videoBuf.length >= buffer.length && PLAYABLE_AS_IS[normalize(mimeType)] === "mp4") {
      videoBuf = null;
      transcoded = false;
    }

    let ext = "mp4";
    let contentType = "video/mp4";
    if (!videoBuf) {
      const m = normalize(mimeType);
      const asIs = PLAYABLE_AS_IS[m] ?? (buffer.subarray(4, 8).toString("ascii") === "ftyp" ? "mp4" : undefined);
      if (!asIs) throw new Error("That video format can't be played in a browser. Try an mp4.");
      ext = asIs;
      contentType = m && PLAYABLE_AS_IS[m] ? m : "video/mp4";
      videoBuf = buffer;
    }

    const uploaded = await uploadToS3({
      folder,
      extension: ext,
      contentType,
      buffer: videoBuf,
      kind: "video",
      cacheControl: "public, max-age=31536000, immutable",
    });

    // Poster: best effort. A video with no poster still plays.
    let posterUrl = "";
    try {
      await run(["-hide_banner", "-loglevel", "error", "-y", "-ss", "0.8", "-i", transcoded ? output : input, "-frames:v", "1", poster]);
      const webp = await sharp(await fs.readFile(poster))
        .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      posterUrl = (
        await uploadToS3({ folder, extension: "webp", contentType: "image/webp", buffer: webp, kind: "image" })
      ).url;
    } catch {
      /* no poster */
    }

    return { url: uploaded.url, posterUrl, size: videoBuf.length, originalSize: buffer.length, transcoded };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};

const normalize = (m: string): string => (m || "").toLowerCase().split(";")[0].trim();
