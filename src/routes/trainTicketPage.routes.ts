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

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedTrainTicketPage);
router.post("/share/:shareId/verify", verifyTrainTicketPagePassword);

router.use(protect);
router.post("/", createTrainTicketPage);
router.get("/my", getMyTrainTicketPages);
router.get("/:id", getTrainTicketPage);
router.put("/:id", updateTrainTicketPage);
router.post("/:id/publish", publishTrainTicketPage);
router.delete("/:id", deleteTrainTicketPage);

export default router;
