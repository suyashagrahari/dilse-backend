import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createChristianWeddingPage,
  getMyChristianWeddingPages,
  getChristianWeddingPage,
  updateChristianWeddingPage,
  publishChristianWeddingPage,
  deleteChristianWeddingPage,
  extractFromWeddingInvitationCard,
  getSharedChristianWeddingPage,
  verifyChristianWeddingPagePassword,
  addChristianWeddingBlessing,
} from "../controllers/christianWeddingPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";
import ChristianWeddingPage, { type IChristianWeddingPage } from "../models/ChristianWeddingPage";
import { guestExtrasOf } from "../config/christianWedding";
import type { GuestPage } from "../controllers/weddingGuest.controller";
import { mountWeddingGuestOwner, mountWeddingGuestPublic } from "./weddingGuest.routes";

const router = Router();

/**
 * Guest RSVPs (one per guest, per event) through the shared wedding-guest
 * controller. This model is flat, so each page is shown to it in the engine's
 * shape: the bride and groom as the couple, the enabled events as `extras`.
 */
const asGuestPage = (p: IChristianWeddingPage | null): GuestPage | null =>
  p && {
    _id: p._id,
    userId: p.userId,
    shareId: p.shareId,
    recipientName: p.brideName,
    senderName: p.groomName,
    extras: guestExtrasOf(p),
    password: p.password,
    comparePassword: (candidate: string) => p.comparePassword(candidate),
  };
const guestDeps = {
  findPublishedPage: async (shareId: string) => asGuestPage(await ChristianWeddingPage.findOne({ shareId, isPublished: true })),
  findOwnedPage: async (id: string, userId: unknown) =>
    /^[a-f0-9]{24}$/i.test(id) ? asGuestPage(await ChristianWeddingPage.findOne({ _id: id, userId })) : null,
};

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("christian-wedding");

// Public
router.get("/share/:shareId", getSharedChristianWeddingPage);
router.post("/share/:shareId/verify", verifyChristianWeddingPagePassword);
router.post("/share/:shareId/blessings", addChristianWeddingBlessing);
mountWeddingGuestPublic(router, "christian-wedding", ChristianWeddingPage, guestDeps);

// Authenticated
router.use(protect);
router.post("/extract-card", extractFromWeddingInvitationCard);
mountWeddingGuestOwner(router, "christian-wedding", ChristianWeddingPage, guestDeps);
router.post("/", live, createChristianWeddingPage);
router.get("/my", getMyChristianWeddingPages);
router.get("/:id", getChristianWeddingPage);
router.put("/:id", live, updateChristianWeddingPage);
router.post("/:id/publish", live, publishChristianWeddingPage);
router.delete("/:id", deleteChristianWeddingPage);

export default router;
