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
  recordVendingMachineAnswer,
  deleteVendingMachinePage,
} from "../controllers/vendingMachinePage.controller";

const router = Router();

// Public — the recipient's entry points. Must stay above `protect`.
// `answer` is public by design: the recipient earns a credit by typing, without
// an account. It is guarded by the unlockToken issued by `verify` whenever the
// page carries a password — see the controller.
router.get("/share/:shareId", getSharedVendingMachinePage);
router.post("/share/:shareId/verify", verifyVendingMachinePagePassword);
router.post("/share/:shareId/answer", recordVendingMachineAnswer);

router.use(protect);
router.post("/", createVendingMachinePage);
router.get("/my", getMyVendingMachinePages);
router.get("/:id", getVendingMachinePage);
router.put("/:id", updateVendingMachinePage);
router.post("/:id/publish", publishVendingMachinePage);
router.delete("/:id", deleteVendingMachinePage);

export default router;
