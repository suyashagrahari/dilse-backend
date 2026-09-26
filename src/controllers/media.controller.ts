import { Request, Response } from "express";
import { uploadMediaBuffer } from "../services/mediaProcessor.service";
import { uploadVideoBuffer } from "../services/videoProcessor.service";

const buildFolder = (template: string, userId?: string): string => {
  const safeTemplate = (template || "general").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const safeUserId = (userId || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "");
  return `${safeTemplate}/users/${safeUserId}`;
};

/**
 * ── WHY `kind` FROM THE BODY IS IGNORED ─────────────────────────────────────
 *
 * The shared client uploader (`lib/draft/mediaUpload.ts`) sent `kind=image` on
 * every request, audio included, because it was written when only photos went
 * through here. This endpoint dutifully handed voice notes to sharp, which
 * answered "Unsupported image format", so every audio upload from the draft
 * adoption path failed — and the caller, having no URL to substitute, left the
 * multi-megabyte data URL in the payload it then saved.
 *
 * The client has been fixed, but the fix that matters is here: the bytes are
 * read, and they decide. A caller cannot mislabel a file into failing any more.
 */
export const uploadMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded. Send multipart/form-data with field 'file'." });
      return;
    }

    const template = typeof req.body.template === "string" ? req.body.template : "general";
    const folder = buildFolder(template, req.userId);

    const uploaded = await uploadMediaBuffer(req.file.buffer, req.file.mimetype, folder);

    res.status(201).json({ success: true, data: uploaded });
  } catch (error) {
    console.error("Media upload error:", error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Media upload failed",
    });
  }
};

/**
 * `POST /media/upload-video` — one short clip, transcoded to a small mp4.
 * Answers `{ url, posterUrl, size, originalSize, transcoded }`.
 */
export const uploadVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No video uploaded. Send multipart/form-data with field 'file'." });
      return;
    }
    const template = typeof req.body.template === "string" ? req.body.template : "general";
    const folder = `${buildFolder(template, req.userId)}/video`;
    const uploaded = await uploadVideoBuffer(req.file.buffer, req.file.mimetype, folder);
    res.status(201).json({ success: true, data: uploaded });
  } catch (error) {
    console.error("Video upload error:", error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Video upload failed",
    });
  }
};
