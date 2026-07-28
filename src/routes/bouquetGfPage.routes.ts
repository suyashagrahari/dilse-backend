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

const router = Router();

router.get("/share/:shareId", getSharedBouquetGfPage);
router.post("/share/:shareId/verify", verifyBouquetGfPagePassword);

router.use(protect);
router.post("/", createBouquetGfPage);
router.get("/my", getMyBouquetGfPages);
router.get("/:id", getBouquetGfPage);
router.put("/:id", updateBouquetGfPage);
router.post("/:id/publish", publishBouquetGfPage);
router.delete("/:id", deleteBouquetGfPage);

export default router;
