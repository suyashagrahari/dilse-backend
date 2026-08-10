import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createNutritionPage,
  getMyNutritionPages,
  getNutritionPage,
  updateNutritionPage,
  publishNutritionPage,
  getSharedNutritionPage,
  verifyNutritionPagePassword,
  deleteNutritionPage,
} from "../controllers/nutritionPage.controller";

const router = Router();

// Public — the recipient has a link, not an account. These MUST stay above
// `router.use(protect)` or every shared page 401s.
router.get("/share/:shareId", getSharedNutritionPage);
router.post("/share/:shareId/verify", verifyNutritionPagePassword);

router.use(protect);
router.post("/", createNutritionPage);
router.get("/my", getMyNutritionPages);
router.get("/:id", getNutritionPage);
router.put("/:id", updateNutritionPage);
router.post("/:id/publish", publishNutritionPage);
router.delete("/:id", deleteNutritionPage);

export default router;
