import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createBouquetGfPage,
  getMyBouquetGfPages,
  getBouquetGfPage,
  updateBouquetGfPage,
  publishBouquetGfPage,
  getSharedBouquetGfPage,
  verifyBouquetGfPagePassword,
  deleteBouquetGfPage,
} from "../controllers/bouquetGfPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("bouquet-gf");

router.get("/share/:shareId", getSharedBouquetGfPage);
router.post("/share/:shareId/verify", verifyBouquetGfPagePassword);

router.use(protect);
router.post("/", live, createBouquetGfPage);
router.get("/my", getMyBouquetGfPages);
router.get("/:id", getBouquetGfPage);
router.put("/:id", live, updateBouquetGfPage);
router.post("/:id/publish", live, publishBouquetGfPage);
router.delete("/:id", deleteBouquetGfPage);

export default router;
