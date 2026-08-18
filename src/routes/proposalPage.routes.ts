import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createProposalPage,
  getMyProposalPages,
  getProposalPage,
  updateProposalPage,
  publishProposalPage,
  getSharedProposalPage,
  verifyProposalPagePassword,
  deleteProposalPage,
} from "../controllers/proposalPage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedProposalPage);
router.post("/share/:shareId/verify", verifyProposalPagePassword);

router.use(protect);
router.post("/", createProposalPage);
router.get("/my", getMyProposalPages);
router.get("/:id", getProposalPage);
router.put("/:id", updateProposalPage);
router.post("/:id/publish", publishProposalPage);
router.delete("/:id", deleteProposalPage);

export default router;
