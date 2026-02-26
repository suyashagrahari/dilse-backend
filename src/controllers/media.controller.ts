import { Request, Response } from "express";
import { uploadAudioBuffer, uploadImageBuffer } from "../services/mediaProcessor.service";

const buildFolder = (template: string, userId?: string): string => {
  const safeTemplate = (template || "general").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const safeUserId = (userId || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "");
  return `${safeTemplate}/users/${safeUserId}`;
};

export const uploadMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded. Send multipart/form-data with field 'file'." });
      return;
    }

    const template = typeof req.body.template === "string" ? req.body.template : "general";
    const kindInput = typeof req.body.kind === "string" ? req.body.kind.toLowerCase() : "";
    const folder = buildFolder(template, req.userId);
    const mime = req.file.mimetype.toLowerCase();

    const kind = kindInput || (mime.startsWith("image/") ? "image" : "audio");
    const uploaded =
      kind === "image"
        ? await uploadImageBuffer(req.file.buffer, mime, folder)
        : await uploadAudioBuffer(req.file.buffer, mime, folder);

    res.status(201).json({
      success: true,
      data: uploaded,
    });
  } catch (error) {
    console.error("Media upload error:", error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Media upload failed",
    });
  }
};
