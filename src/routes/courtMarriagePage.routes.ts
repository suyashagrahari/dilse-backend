import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createCourtMarriagePage,
  getMyCourtMarriagePages,
  getCourtMarriagePage,
  updateCourtMarriagePage,
  publishCourtMarriagePage,
  getSharedCourtMarriagePage,
  verifyCourtMarriagePagePassword,
  deleteCourtMarriagePage,
} from "../controllers/courtMarriagePage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedCourtMarriagePage);
router.post("/share/:shareId/verify", verifyCourtMarriagePagePassword);

router.use(protect);
router.post("/", createCourtMarriagePage);
router.get("/my", getMyCourtMarriagePages);
router.get("/:id", getCourtMarriagePage);
router.put("/:id", updateCourtMarriagePage);
router.post("/:id/publish", publishCourtMarriagePage);
router.delete("/:id", deleteCourtMarriagePage);

export default router;
