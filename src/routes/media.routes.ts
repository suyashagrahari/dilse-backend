import { Router } from "express";
import multer, { type FileFilterCallback } from "multer";
import { protect } from "../middleware/auth";
import { uploadMedia } from "../controllers/media.controller";
import { isAllowedUploadMime } from "../services/mediaProcessor.service";

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

router.use(protect);
router.post("/upload", upload.single("file"), uploadMedia);

export default router;
