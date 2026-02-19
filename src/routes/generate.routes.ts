import { Router } from "express";
import {
  generateContent,
  getGeneratedHistory,
} from "../controllers/generate.controller";

const router = Router();

router.post("/", generateContent);
router.get("/history/:slug", getGeneratedHistory);

export default router;
