import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createChallanPage,
  getMyChallanPages,
  getChallanPage,
  updateChallanPage,
  publishChallanPage,
  getSharedChallanPage,
  verifyChallanPagePassword,
  deleteChallanPage,
} from "../controllers/challanPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("challan");

router.get("/share/:shareId", getSharedChallanPage);
router.post("/share/:shareId/verify", verifyChallanPagePassword);

router.use(protect);
router.post("/", live, createChallanPage);
router.get("/my", getMyChallanPages);
router.get("/:id", getChallanPage);
router.put("/:id", live, updateChallanPage);
router.post("/:id/publish", live, publishChallanPage);
router.delete("/:id", deleteChallanPage);

export default router;
