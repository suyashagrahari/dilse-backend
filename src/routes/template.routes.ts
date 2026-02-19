import { Router } from "express";
import {
  getAllTemplates,
  getTemplateBySlug,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateTypes,
} from "../controllers/template.controller";

const router = Router();

router.get("/", getAllTemplates);
router.get("/types", getTemplateTypes);
router.get("/:slug", getTemplateBySlug);
router.post("/", createTemplate);
router.put("/:slug", updateTemplate);
router.delete("/:slug", deleteTemplate);

export default router;
