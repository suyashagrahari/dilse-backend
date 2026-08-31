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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("loveflix");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedLoveflixPage);
router.post("/share/:shareId/verify", verifyLoveflixPagePassword);

router.use(protect);
router.post("/", live, createLoveflixPage);
router.get("/my", getMyLoveflixPages);
router.get("/:id", getLoveflixPage);
router.put("/:id", live, updateLoveflixPage);
router.post("/:id/publish", live, publishLoveflixPage);
router.delete("/:id", deleteLoveflixPage);

export default router;
