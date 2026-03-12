import { Router } from "express";
import { createContactInquiry } from "../controllers/contact.controller";

const router = Router();

router.post("/", createContactInquiry);

export default router;
