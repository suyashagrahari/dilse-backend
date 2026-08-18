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

const router = Router();

router.get("/share/:shareId", getSharedChallanPage);
router.post("/share/:shareId/verify", verifyChallanPagePassword);

router.use(protect);
router.post("/", createChallanPage);
router.get("/my", getMyChallanPages);
router.get("/:id", getChallanPage);
router.put("/:id", updateChallanPage);
router.post("/:id/publish", publishChallanPage);
router.delete("/:id", deleteChallanPage);

export default router;
