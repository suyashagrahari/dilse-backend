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
    if (!isAllowedUploadMime(file.mimetype)) {
      cb(
        new Error(
          "Unsupported file type. Allowed: jpg, jpeg, png, webp, gif, avif, mp3, wav, webm, ogg, mp4, aac, m4a"
        )
      );
      return;
    }
    cb(null, true);
  },
});

router.use(protect);
router.post("/upload", upload.single("file"), uploadMedia);

export default router;
