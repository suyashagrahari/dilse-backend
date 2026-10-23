import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createShaadiCardPage,
  getMyShaadiCardPages,
  getShaadiCardPage,
  updateShaadiCardPage,
  publishShaadiCardPage,
  deleteShaadiCardPage,
  extractFromShadiCard,
  getSharedShaadiCardPage,
  verifyShaadiCardPagePassword,
  addBlessing,
} from "../controllers/shaadiCardPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";
import ShaadiCardPage from "../models/ShaadiCardPage";
import { mountWeddingGuestOwner, mountWeddingGuestPublic } from "./weddingGuest.routes";
import type { WeddingGuestDeps } from "../controllers/weddingGuest.controller";
import { guestPageOf, type ShaadiDocLike } from "../config/shaadiCard";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("shaadi-card");

/**
 * The wedding kit's RSVP routes (per-function RSVP, owner dashboard + CSV),
 * reading a shaadi page as the kit expects it (config/shaadiCard guestPageOf).
 * The kit's own blessings routes 404 here (WEDDING_TIER_LIMITS blessings:false):
 * this template keeps its own wall with voice notes (POST /share/:id/blessings).
 */
const isObjectId = (v: string) => /^[a-f0-9]{24}$/i.test(v);
const guestDeps: Partial<WeddingGuestDeps> = {
  findPublishedPage: async (shareId) => {
    const doc = await ShaadiCardPage.findOne({ shareId, isPublished: true });
    return doc ? guestPageOf(doc as unknown as ShaadiDocLike) : null;
  },
  findOwnedPage: async (id, userId) => {
    if (!isObjectId(id)) return null;
    const doc = await ShaadiCardPage.findOne({ _id: id, userId });
    return doc ? guestPageOf(doc as unknown as ShaadiDocLike) : null;
  },
};

// Public routes
router.get("/share/:shareId", getSharedShaadiCardPage);
router.post("/share/:shareId/verify", verifyShaadiCardPagePassword);
router.post("/share/:shareId/blessings", addBlessing);
mountWeddingGuestPublic(router, "shaadi-card", ShaadiCardPage, guestDeps);

// Protected routes
router.use(protect);
router.post("/extract-card", extractFromShadiCard);
router.post("/", live, createShaadiCardPage);
router.get("/my", getMyShaadiCardPages);
mountWeddingGuestOwner(router, "shaadi-card", ShaadiCardPage, guestDeps);
router.get("/:id", getShaadiCardPage);
router.put("/:id", live, updateShaadiCardPage);
router.post("/:id/publish", live, publishShaadiCardPage);
router.delete("/:id", deleteShaadiCardPage);

export default router;
