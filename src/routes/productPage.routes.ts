import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createProductPage,
  getMyProductPages,
  getProductPage,
  updateProductPage,
  publishProductPage,
  getSharedProductPage,
  verifyProductPagePassword,
  deleteProductPage,
} from "../controllers/productPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("product");

router.get("/share/:shareId", getSharedProductPage);
router.post("/share/:shareId/verify", verifyProductPagePassword);

router.use(protect);
router.post("/", live, createProductPage);
router.get("/my", getMyProductPages);
router.get("/:id", getProductPage);
router.put("/:id", live, updateProductPage);
router.post("/:id/publish", live, publishProductPage);
router.delete("/:id", deleteProductPage);

export default router;
