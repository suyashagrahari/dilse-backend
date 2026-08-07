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

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedCallPage);
router.post("/share/:shareId/verify", verifyCallPagePassword);

router.use(protect);
router.post("/", createCallPage);
// Above `/:id`, or "my" is read as an id and every dashboard fetch 404s.
router.get("/my", getMyCallPages);
router.get("/:id", getCallPage);
router.put("/:id", updateCallPage);
router.post("/:id/publish", publishCallPage);
router.delete("/:id", deleteCallPage);

export default router;
