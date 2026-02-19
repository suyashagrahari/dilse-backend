import { Router } from "express";
import { getSharedPage } from "../controllers/share.controller";

const router = Router();

router.get("/:shareId", getSharedPage);

export default router;
