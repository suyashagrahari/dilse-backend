import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createLoveflixPage,
  getMyLoveflixPages,
  getLoveflixPage,
  updateLoveflixPage,
  publishLoveflixPage,
  getSharedLoveflixPage,
  verifyLoveflixPagePassword,
  deleteLoveflixPage,
} from "../controllers/loveflixPage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedLoveflixPage);
router.post("/share/:shareId/verify", verifyLoveflixPagePassword);

router.use(protect);
router.post("/", createLoveflixPage);
router.get("/my", getMyLoveflixPages);
router.get("/:id", getLoveflixPage);
router.put("/:id", updateLoveflixPage);
router.post("/:id/publish", publishLoveflixPage);
router.delete("/:id", deleteLoveflixPage);

export default router;
