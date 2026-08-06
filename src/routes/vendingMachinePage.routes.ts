import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createVendingMachinePage,
  getMyVendingMachinePages,
  getVendingMachinePage,
  updateVendingMachinePage,
  publishVendingMachinePage,
  getSharedVendingMachinePage,
  verifyVendingMachinePagePassword,
  deleteVendingMachinePage,
} from "../controllers/vendingMachinePage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedVendingMachinePage);
router.post("/share/:shareId/verify", verifyVendingMachinePagePassword);

router.use(protect);
router.post("/", createVendingMachinePage);
router.get("/my", getMyVendingMachinePages);
router.get("/:id", getVendingMachinePage);
router.put("/:id", updateVendingMachinePage);
router.post("/:id/publish", publishVendingMachinePage);
router.delete("/:id", deleteVendingMachinePage);

export default router;
