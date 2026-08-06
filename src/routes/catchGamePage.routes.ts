import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createCatchPage,
  getMyCatchPages,
  getCatchPage,
  updateCatchPage,
  publishCatchPage,
  getSharedCatchPage,
  verifyCatchPagePassword,
  deleteCatchPage,
} from "../controllers/catchGamePage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedCatchPage);
router.post("/share/:shareId/verify", verifyCatchPagePassword);

router.use(protect);
router.post("/", createCatchPage);
router.get("/my", getMyCatchPages);
router.get("/:id", getCatchPage);
router.put("/:id", updateCatchPage);
router.post("/:id/publish", publishCatchPage);
router.delete("/:id", deleteCatchPage);

export default router;
