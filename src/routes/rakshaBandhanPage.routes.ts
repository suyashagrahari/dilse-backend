import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createRakshaBandhanPage,
  getMyRakshaBandhanPages,
  getRakshaBandhanPage,
  updateRakshaBandhanPage,
  publishRakshaBandhanPage,
  getSharedRakshaBandhanPage,
  verifyRakshaBandhanPagePassword,
  submitVachan,
  deleteRakshaBandhanPage,
} from "../controllers/rakshaBandhanPage.controller";

const router = Router();

router.get("/share/:shareId", getSharedRakshaBandhanPage);
router.post("/share/:shareId/verify", verifyRakshaBandhanPagePassword);
// Public: her brother writes his promise back without signing up. Write-once,
// one field, 120 chars — see the note on the controller.
router.post("/share/:shareId/vachan", submitVachan);

router.use(protect);
router.post("/", createRakshaBandhanPage);
router.get("/my", getMyRakshaBandhanPages);
router.get("/:id", getRakshaBandhanPage);
router.put("/:id", updateRakshaBandhanPage);
router.post("/:id/publish", publishRakshaBandhanPage);
router.delete("/:id", deleteRakshaBandhanPage);

export default router;
