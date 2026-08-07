import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createWatchPage,
  getMyWatchPages,
  getWatchPage,
  updateWatchPage,
  publishWatchPage,
  getSharedWatchPage,
  verifyWatchPagePassword,
  deleteWatchPage,
} from "../controllers/watchPage.controller";

const router = Router();

router.get("/share/:shareId", getSharedWatchPage);
router.post("/share/:shareId/verify", verifyWatchPagePassword);

router.use(protect);
router.post("/", createWatchPage);
router.get("/my", getMyWatchPages);
router.get("/:id", getWatchPage);
router.put("/:id", updateWatchPage);
router.post("/:id/publish", publishWatchPage);
router.delete("/:id", deleteWatchPage);

export default router;
