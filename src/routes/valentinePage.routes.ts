import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createValentinePage,
  getMyValentinePages,
  getValentinePage,
  updateValentinePage,
  publishValentinePage,
  getSharedValentinePage,
  deleteValentinePage,
} from "../controllers/valentinePage.controller";

const router = Router();

router.get("/share/:shareId", getSharedValentinePage);

router.use(protect);
router.post("/", createValentinePage);
router.get("/my", getMyValentinePages);
router.get("/:id", getValentinePage);
router.put("/:id", updateValentinePage);
router.post("/:id/publish", publishValentinePage);
router.delete("/:id", deleteValentinePage);

export default router;
