import { Router } from "express";
import multer, { type FileFilterCallback } from "multer";
import { protect } from "../middleware/auth";
import { uploadMedia, uploadVideo } from "../controllers/media.controller";
import { isAllowedUploadMime } from "../services/mediaProcessor.service";
import { MAX_VIDEO_BYTES, isAllowedVideoMime } from "../services/videoProcessor.service";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    // A first, deliberately loose pass. `isAllowedUploadMime` lets through the
    // empty and octet-stream types a phone sends for a file it cannot name, so
    // the controller can sniff the bytes and give a real answer. Everything this
    // does stop is stopped before 20MB of it is buffered into memory.
    if (!isAllowedUploadMime(file.mimetype)) {
      cb(new Error("That file is not an image or an audio clip."));
      return;
    }
    cb(null, true);
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  // A little over the 10MB product limit, so the controller answers with a
  // sentence instead of multer answering with a stack trace.
  limits: { fileSize: MAX_VIDEO_BYTES + 512 * 1024 },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    if (!isAllowedVideoMime(file.mimetype)) {
      cb(new Error("That file is not a video."));
      return;
    }
    cb(null, true);
  },
});

router.use(protect);
router.post("/upload", upload.single("file"), uploadMedia);
router.post("/upload-video", (req, res, next) => {
  videoUpload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const tooBig = (err as { code?: string }).code === "LIMIT_FILE_SIZE";
    res.status(400).json({
      success: false,
      error: tooBig ? "Video is too large. Max size is 10MB." : err instanceof Error ? err.message : "Upload failed",
    });
  });
}, uploadVideo);

export default router;
