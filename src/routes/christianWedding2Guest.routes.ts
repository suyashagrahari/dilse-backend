import { Router } from "express";
import mongoose from "mongoose";
import { protect } from "../middleware/auth";
import ChristianWeddingPage, { type IChristianWeddingPage } from "../models/ChristianWeddingPage";
import { guestExtrasOf } from "../services/christianScrollExtras";
import { mountWeddingGuestOwner, mountWeddingGuestPublic } from "./weddingGuest.routes";
import type { GuestPage } from "../controllers/weddingGuest.controller";

/**
 * Wedding-kit guest routes (per-function RSVPs + the owner's guest list / CSV)
 * for Christian Wedding — Scroll Edition, mounted at /christian-wedding-2-pages
 * (the kit client builds `/<slug>-pages/...`). The page itself still lives in
 * christian_wedding_pages and is created/published via /christian-wedding-pages.
 * Blessings stay on the page's own wall (voice notes), so the kit's blessing
 * routes answer 404 here (`blessings: false` in WEDDING_TIER_LIMITS).
 */
const SLUG = "christian-wedding-2";

function asGuestPage(doc: IChristianWeddingPage | null): GuestPage | null {
  if (!doc) return null;
  return {
    _id: doc._id,
    userId: doc.userId,
    shareId: doc.shareId,
    recipientName: doc.brideName,
    senderName: doc.groomName,
    extras: guestExtrasOf(doc),
    password: doc.password,
    comparePassword: (candidate: string) => doc.comparePassword(candidate),
  };
}

const deps = {
  findPublishedPage: async (shareId: string) =>
    asGuestPage(await ChristianWeddingPage.findOne({ shareId, isPublished: true, templateVariant: "scroll" })),
  findOwnedPage: async (id: string, userId: unknown) =>
    mongoose.Types.ObjectId.isValid(id) ? asGuestPage(await ChristianWeddingPage.findOne({ _id: id, userId })) : null,
};

const router = Router();
mountWeddingGuestPublic(router, SLUG, ChristianWeddingPage, deps);
router.use(protect);
mountWeddingGuestOwner(router, SLUG, ChristianWeddingPage, deps);

export default router;
