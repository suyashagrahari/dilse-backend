import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createRakshaBandhanSisterPage,
  getMyRakshaBandhanSisterPages,
  getRakshaBandhanSisterPage,
  updateRakshaBandhanSisterPage,
  publishRakshaBandhanSisterPage,
  getSharedRakshaBandhanSisterPage,
  verifyRakshaBandhanSisterPagePassword,
  submitSisterReply,
  deleteRakshaBandhanSisterPage,
} from "../controllers/rakshaBandhanSisterPage.controller";

const router = Router();

// The three public routes come BEFORE `router.use(protect)`, because Express
// applies middleware in declaration order and his sister will never have a
// token — mounting `protect` first would 401 the only person the page is for.
router.get("/share/:shareId", getSharedRakshaBandhanSisterPage);
router.post("/share/:shareId/verify", verifyRakshaBandhanSisterPagePassword);
// Public: she ties the rakhi and writes back without signing up. Write-once,
// two fields, 400 chars and a known style id — see the note on the controller.
router.post("/share/:shareId/reply", submitSisterReply);

router.use(protect);
router.post("/", createRakshaBandhanSisterPage);
router.get("/my", getMyRakshaBandhanSisterPages);
router.get("/:id", getRakshaBandhanSisterPage);
router.put("/:id", updateRakshaBandhanSisterPage);
router.post("/:id/publish", publishRakshaBandhanSisterPage);
router.delete("/:id", deleteRakshaBandhanSisterPage);

export default router;
