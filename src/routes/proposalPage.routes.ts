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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("proposal");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedProposalPage);
router.post("/share/:shareId/verify", verifyProposalPagePassword);

router.use(protect);
router.post("/", live, createProposalPage);
router.get("/my", getMyProposalPages);
router.get("/:id", getProposalPage);
router.put("/:id", live, updateProposalPage);
router.post("/:id/publish", live, publishProposalPage);
router.delete("/:id", deleteProposalPage);

export default router;
