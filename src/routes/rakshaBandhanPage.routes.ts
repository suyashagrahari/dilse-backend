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
import { requireTemplateLive } from "../middleware/templateGate";

const router = Router();

/** See the twin of this line in rakshaBandhanSisterPage.routes.ts. */
const live = requireTemplateLive("happy-rakshabandhan-to-brother");

router.get("/share/:shareId", getSharedRakshaBandhanPage);
router.post("/share/:shareId/verify", verifyRakshaBandhanPagePassword);
// Public: her brother writes his promise back without signing up. Write-once,
// one field, 120 chars — see the note on the controller.
router.post("/share/:shareId/vachan", submitVachan);

router.use(protect);
router.post("/", live, createRakshaBandhanPage);
router.get("/my", getMyRakshaBandhanPages);
router.get("/:id", getRakshaBandhanPage);
router.put("/:id", live, updateRakshaBandhanPage);
router.post("/:id/publish", live, publishRakshaBandhanPage);
router.delete("/:id", deleteRakshaBandhanPage);

export default router;
