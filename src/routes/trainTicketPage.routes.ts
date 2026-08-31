import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createTrainTicketPage,
  getMyTrainTicketPages,
  getTrainTicketPage,
  updateTrainTicketPage,
  publishTrainTicketPage,
  getSharedTrainTicketPage,
  verifyTrainTicketPagePassword,
  deleteTrainTicketPage,
} from "../controllers/trainTicketPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("train-ticket");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedTrainTicketPage);
router.post("/share/:shareId/verify", verifyTrainTicketPagePassword);

router.use(protect);
router.post("/", live, createTrainTicketPage);
router.get("/my", getMyTrainTicketPages);
router.get("/:id", getTrainTicketPage);
router.put("/:id", live, updateTrainTicketPage);
router.post("/:id/publish", live, publishTrainTicketPage);
router.delete("/:id", deleteTrainTicketPage);

export default router;
