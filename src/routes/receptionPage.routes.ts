import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createReceptionPage,
  getMyReceptionPages,
  getReceptionPage,
  updateReceptionPage,
  publishReceptionPage,
  deleteReceptionPage,
  extractFromReceptionCard,
  getSharedReceptionPage,
  verifyReceptionPagePassword,
  addBlessing,
} from "../controllers/receptionPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";
import { mountWeddingGuestOwner, mountWeddingGuestPublic } from "./weddingGuest.routes";
import ReceptionPage from "../models/ReceptionPage";
import { receptionAsGuestPage } from "../config/receptionPage";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("reception");

// Public routes
router.get("/share/:shareId", getSharedReceptionPage);
router.post("/share/:shareId/verify", verifyReceptionPagePassword);
router.post("/share/:shareId/blessings", addBlessing);

// Guests' RSVPs per part of the evening (the wedding kit's store, mailer and
// limits). The reception document is seen through receptionAsGuestPage, so an
// older page with no `events` still takes RSVPs for its one implicit reception.
// The kit's own blessing routes 404 here (blessings:false): this template keeps
// its original wall above.
const guestDeps = {
  findPublishedPage: async (shareId: string) => receptionAsGuestPage(await ReceptionPage.findOne({ shareId, isPublished: true })),
  findOwnedPage: async (id: string, userId: unknown) =>
    /^[a-f0-9]{24}$/i.test(id) ? receptionAsGuestPage(await ReceptionPage.findOne({ _id: id, userId })) : null,
};
mountWeddingGuestPublic(router, "reception", ReceptionPage, guestDeps);

// Protected routes
router.use(protect);
router.post("/extract-card", extractFromReceptionCard);
mountWeddingGuestOwner(router, "reception", ReceptionPage, guestDeps);
router.post("/", live, createReceptionPage);
router.get("/my", getMyReceptionPages);
router.get("/:id", getReceptionPage);
router.put("/:id", live, updateReceptionPage);
router.post("/:id/publish", live, publishReceptionPage);
router.delete("/:id", deleteReceptionPage);

export default router;
