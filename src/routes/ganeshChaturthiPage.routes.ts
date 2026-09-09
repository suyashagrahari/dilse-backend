import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createGaneshChaturthiPage,
  getMyGaneshChaturthiPages,
  getGaneshChaturthiPage,
  updateGaneshChaturthiPage,
  publishGaneshChaturthiPage,
  getSharedGaneshChaturthiPage,
  verifyGaneshChaturthiPagePassword,
  submitReply,
  deleteGaneshChaturthiPage,
} from "../controllers/ganeshChaturthiPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * The visibility gate, per template rather than per mount path — the slug is
 * `happy-ganesh-chaturthi` and the mount is `/ganesh-chaturthi-pages`, and only
 * this file knows both. See the note in `middleware/templateGate.ts`.
 */
const live = requireTemplateAccess("happy-ganesh-chaturthi");

// PUBLIC, and above `protect` on purpose. A page already sent has to keep
// opening when the template is switched off in the admin screen — the recipient
// arrived from a link, not from the gallery.
router.get("/share/:shareId", getSharedGaneshChaturthiPage);
router.post("/share/:shareId/verify", verifyGaneshChaturthiPagePassword);
// Public: the reader writes one line back without signing up.
// Write-once, one field, 140 chars — see the note on the controller.
router.post("/share/:shareId/reply", submitReply);

router.use(protect);
router.post("/", live, createGaneshChaturthiPage);
router.get("/my", getMyGaneshChaturthiPages);
router.get("/:id", getGaneshChaturthiPage);
router.put("/:id", live, updateGaneshChaturthiPage);
router.post("/:id/publish", live, publishGaneshChaturthiPage);
router.delete("/:id", deleteGaneshChaturthiPage);

export default router;
