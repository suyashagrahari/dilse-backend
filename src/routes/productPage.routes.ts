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

const router = Router();

router.get("/share/:shareId", getSharedProductPage);
router.post("/share/:shareId/verify", verifyProductPagePassword);

router.use(protect);
router.post("/", createProductPage);
router.get("/my", getMyProductPages);
router.get("/:id", getProductPage);
router.put("/:id", updateProductPage);
router.post("/:id/publish", publishProductPage);
router.delete("/:id", deleteProductPage);

export default router;
