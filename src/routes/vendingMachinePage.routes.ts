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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("vending-machine");

// Public — the recipient's entry points. Must stay above `protect`.
// `answer` is public by design: the recipient earns a credit by typing, without
// an account. It is guarded by the unlockToken issued by `verify` whenever the
// page carries a password — see the controller.
router.get("/share/:shareId", getSharedVendingMachinePage);
router.post("/share/:shareId/verify", verifyVendingMachinePagePassword);
router.post("/share/:shareId/answer", recordVendingMachineAnswer);

router.use(protect);
router.post("/", live, createVendingMachinePage);
router.get("/my", getMyVendingMachinePages);
router.get("/:id", getVendingMachinePage);
router.put("/:id", live, updateVendingMachinePage);
router.post("/:id/publish", live, publishVendingMachinePage);
router.delete("/:id", deleteVendingMachinePage);

export default router;
