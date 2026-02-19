import { Router } from "express";
import {
  saveUserContent,
  getUserContent,
  getAllUserContent,
  deleteUserContent,
} from "../controllers/userContent.controller";

const router = Router();

router.get("/", getAllUserContent);
router.get("/:slug", getUserContent);
router.post("/", saveUserContent);
router.delete("/:slug", deleteUserContent);

export default router;
