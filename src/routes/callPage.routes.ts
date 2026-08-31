import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createCallPage,
  getMyCallPages,
  getCallPage,
  updateCallPage,
  publishCallPage,
  getSharedCallPage,
  verifyCallPagePassword,
  deleteCallPage,
} from "../controllers/callPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("call");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedCallPage);
router.post("/share/:shareId/verify", verifyCallPagePassword);

router.use(protect);
router.post("/", live, createCallPage);
// Above `/:id`, or "my" is read as an id and every dashboard fetch 404s.
router.get("/my", getMyCallPages);
router.get("/:id", getCallPage);
router.put("/:id", live, updateCallPage);
router.post("/:id/publish", live, publishCallPage);
router.delete("/:id", deleteCallPage);

export default router;
