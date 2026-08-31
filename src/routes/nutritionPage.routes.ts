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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("nutrition");

// Public — the recipient has a link, not an account. These MUST stay above
// `router.use(protect)` or every shared page 401s.
router.get("/share/:shareId", getSharedNutritionPage);
router.post("/share/:shareId/verify", verifyNutritionPagePassword);

router.use(protect);
router.post("/", live, createNutritionPage);
router.get("/my", getMyNutritionPages);
router.get("/:id", getNutritionPage);
router.put("/:id", live, updateNutritionPage);
router.post("/:id/publish", live, publishNutritionPage);
router.delete("/:id", deleteNutritionPage);

export default router;
