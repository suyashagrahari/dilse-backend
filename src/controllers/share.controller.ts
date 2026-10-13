import { Request, Response } from "express";
import { templateLabel, templateApiBase } from "../config/templateCatalog";
import BirthdayPage from "../models/BirthdayPage";
import ProductPage from "../models/ProductPage";
import WatchPage from "../models/WatchPage";
import CallPage from "../models/CallPage";
import RechargePage from "../models/RechargePage";
import ChallanPage from "../models/ChallanPage";
import NutritionPage from "../models/NutritionPage";
import AppPage from "../models/AppPage";
import ProfileProPage from "../models/ProfileProPage";
import ValentinePage from "../models/ValentinePage";
import HoliPage from "../models/HoliPage";
import EidPage from "../models/EidPage";
import WeddingPage from "../models/WeddingPage";
import ReceptionPage from "../models/ReceptionPage";
import ShaadiCardPage from "../models/ShaadiCardPage";
import ChristianWeddingPage from "../models/ChristianWeddingPage";
import LoveGfPage from "../models/LoveGfPage";
import DarlingPage from "../models/DarlingPage";
import BirthdayGfPage from "../models/BirthdayGfPage";
import ApologyDashboardPage from "../models/ApologyDashboardPage";
import MissYouGfPage from "../models/MissYouGfPage";
import BouquetGfPage from "../models/BouquetGfPage";
import CourtOfLovePage from "../models/CourtOfLovePage";
import ProposalPage from "../models/ProposalPage";
import CourtMarriagePage from "../models/CourtMarriagePage";
import HoldMyHandPage from "../models/HoldMyHandPage";
import TrainTicketPage from "../models/TrainTicketPage";
import LegalNoticePage from "../models/LegalNoticePage";
import KundliMilanPage from "../models/KundliMilanPage";
import VendingMachinePage from "../models/VendingMachinePage";
import CatchPage from "../models/CatchPage";
import FlagsPage from "../models/FlagsPage";
import DateInvitationPage from "../models/DateInvitationPage";
import PhotoPuzzlePage from "../models/PhotoPuzzlePage";
import LoveflixPage from "../models/LoveflixPage";
import RewindPage from "../models/RewindPage";
import StreakPage from "../models/StreakPage";
import DedicationPage from "../models/DedicationPage";
import SearchedPage from "../models/SearchedPage";
import CapsulePage from "../models/CapsulePage";
import UsPage from "../models/UsPage";
import RakshaBandhanPage from "../models/RakshaBandhanPage";
import RakshaBandhanSisterPage from "../models/RakshaBandhanSisterPage";
import GaneshChaturthiPage from "../models/GaneshChaturthiPage";
import { HIDDEN_CONTENT_STATUSES } from "../services/accountStatus";
import SharedAccess from "../models/SharedAccess";
import PageView from "../models/PageView";
import User from "../models/User";
import { isApexDeployment } from "../config/env";
import mongoose from "mongoose";
import { projectSharedCapsuleData } from "./capsulePage.controller";
import { projectSharedStreakData } from "./streakPage.controller";
import { projectValentineShared } from "./valentineDayPage.controller";
import { VALENTINE_DAY_MODELS } from "../models/ValentineDayPage";

/** Premium pages withhold everything but a teaser until their unlock time — except from the signed-in owner. */
const valentineShared = (data: Record<string, unknown>, req: Request) =>
  projectValentineShared(data, { viewerId: req.userId ? String(req.userId) : null });

function detectDevice(ua: string): "mobile" | "desktop" | "tablet" {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

interface TemplateLookup {
  model: mongoose.Model<unknown>;
  templateType: string;
  editorRoute: string;
  /**
   * Optional per-template narrowing of what a share response may contain.
   *
   * Two templates withhold content that they hold in the same document as the
   * content they show — capsule's sealed predictions and streak's sealed notes.
   * Their own `/share/:shareId` routes enforce that, but this generic resolver
   * walks every model and would otherwise hand the whole document over through
   * a different URL. The hook runs on the already-password-stripped object.
   */
  projectShared?: (
    data: Record<string, unknown>,
    req: Request
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

/**
 * Exported so the activity feed can count real creations without a second copy
 * of this list. A duplicate registry would drift the moment a template is added
 * to one and not the other, and the symptom — a template quietly missing from
 * the homepage — is invisible.
 */
export const TEMPLATE_LOOKUPS: TemplateLookup[] = [
  { model: BirthdayPage as mongoose.Model<unknown>, templateType: "birthday", editorRoute: "/birthday-gf" },
  { model: ProductPage as mongoose.Model<unknown>, templateType: "product", editorRoute: "/product" },
  { model: WatchPage as mongoose.Model<unknown>, templateType: "watch", editorRoute: "/watch" },
  { model: CallPage as mongoose.Model<unknown>, templateType: "call", editorRoute: "/call" },
  { model: RechargePage as mongoose.Model<unknown>, templateType: "recharge", editorRoute: "/recharge" },
  { model: ChallanPage as mongoose.Model<unknown>, templateType: "challan", editorRoute: "/challan" },
  { model: NutritionPage as mongoose.Model<unknown>, templateType: "nutrition", editorRoute: "/nutrition" },
  { model: AppPage as mongoose.Model<unknown>, templateType: "app", editorRoute: "/app" },
  { model: ProfileProPage as mongoose.Model<unknown>, templateType: "profile-pro", editorRoute: "/profile-pro" },
  { model: ValentinePage as mongoose.Model<unknown>, templateType: "valentine", editorRoute: "/valentine-gf" },
  { model: HoliPage as mongoose.Model<unknown>, templateType: "holi", editorRoute: "/holi" },
  { model: EidPage as mongoose.Model<unknown>, templateType: "eid", editorRoute: "/eid-mubarak" },
  { model: WeddingPage as mongoose.Model<unknown>, templateType: "wedding", editorRoute: "/wedding-shaadi" },
  { model: ReceptionPage as mongoose.Model<unknown>, templateType: "reception", editorRoute: "/reception" },
  { model: ShaadiCardPage as mongoose.Model<unknown>, templateType: "shaadi", editorRoute: "/shaadi-card" },
  { model: ChristianWeddingPage as mongoose.Model<unknown>, templateType: "christian-wedding", editorRoute: "/christian-wedding" },
  { model: LoveGfPage as mongoose.Model<unknown>, templateType: "love-gf", editorRoute: "/love-gf" },
  { model: DarlingPage as mongoose.Model<unknown>, templateType: "darling", editorRoute: "/darling" },
  { model: BirthdayGfPage as mongoose.Model<unknown>, templateType: "birthday-gf", editorRoute: "/birthday-gf" },
  { model: ApologyDashboardPage as mongoose.Model<unknown>, templateType: "apology-dashboard", editorRoute: "/apology-dashboard" },
  { model: MissYouGfPage as mongoose.Model<unknown>, templateType: "missyou-gf", editorRoute: "/missyou-gf" },
  { model: BouquetGfPage as mongoose.Model<unknown>, templateType: "bouquet-gf", editorRoute: "/bouquet-gf" },
  { model: CourtOfLovePage as mongoose.Model<unknown>, templateType: "court-of-love", editorRoute: "/court-of-love" },
  { model: ProposalPage as mongoose.Model<unknown>, templateType: "proposal", editorRoute: "/proposal" },
  { model: CourtMarriagePage as mongoose.Model<unknown>, templateType: "court-marriage", editorRoute: "/court-marriage" },
  { model: HoldMyHandPage as mongoose.Model<unknown>, templateType: "hold-my-hand", editorRoute: "/hold-my-hand" },
  { model: TrainTicketPage as mongoose.Model<unknown>, templateType: "train-ticket", editorRoute: "/train-ticket" },
  { model: LegalNoticePage as mongoose.Model<unknown>, templateType: "legal-notice", editorRoute: "/legal-notice" },
  { model: KundliMilanPage as mongoose.Model<unknown>, templateType: "kundli-milan", editorRoute: "/kundli-milan" },
  { model: VendingMachinePage as mongoose.Model<unknown>, templateType: "vending-machine", editorRoute: "/vending-machine" },
  { model: CatchPage as mongoose.Model<unknown>, templateType: "catch", editorRoute: "/catch" },
  { model: FlagsPage as mongoose.Model<unknown>, templateType: "flags", editorRoute: "/flags" },
  { model: DateInvitationPage as mongoose.Model<unknown>, templateType: "date-invitation", editorRoute: "/date-invitation" },
  { model: PhotoPuzzlePage as mongoose.Model<unknown>, templateType: "photo-puzzle", editorRoute: "/photo-puzzle" },
  { model: LoveflixPage as mongoose.Model<unknown>, templateType: "loveflix", editorRoute: "/loveflix" },
  { model: RewindPage as mongoose.Model<unknown>, templateType: "rewind", editorRoute: "/rewind" },
  {
    model: StreakPage as mongoose.Model<unknown>,
    templateType: "streak",
    editorRoute: "/streak",
    // Today's sealed note stays out of the body until the viewer checks in.
    // The reader's side is resolved from the `?k=` token, not asserted.
    projectShared: (data, req) => projectSharedStreakData(data, req),
  },
  { model: DedicationPage as mongoose.Model<unknown>, templateType: "dedication", editorRoute: "/dedication" },
  { model: SearchedPage as mongoose.Model<unknown>, templateType: "searched", editorRoute: "/searched" },
  {
    model: CapsulePage as mongoose.Model<unknown>,
    templateType: "capsule",
    editorRoute: "/capsule",
    // Counts and authorship only until server time passes `opensOn`.
    projectShared: (data) => projectSharedCapsuleData(data),
  },
  { model: UsPage as mongoose.Model<unknown>, templateType: "us", editorRoute: "/us" },
  { model: RakshaBandhanPage as mongoose.Model<unknown>, templateType: "raksha-bandhan", editorRoute: "/happy-rakshabandhan-to-brother" },
  { model: RakshaBandhanSisterPage as mongoose.Model<unknown>, templateType: "raksha-bandhan-sister", editorRoute: "/happy-rakshabandhan-to-sister" },
  { model: GaneshChaturthiPage as mongoose.Model<unknown>, templateType: "ganesh-chaturthi", editorRoute: "/happy-ganesh-chaturthi" },
  // Valentine's week: eight DISCRIMINATOR models over one collection, so each
  // entry sees only its own day (see models/ValentineDayPage.ts). templateType
  // === slug === route, so each day prices, releases and reports on its own.
  // `reactions` (opened / said yes) are the sender's — never on a share response.
  { model: VALENTINE_DAY_MODELS["happy-rose-day"] as unknown as mongoose.Model<unknown>, templateType: "happy-rose-day", editorRoute: "/happy-rose-day", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-propose-day"] as unknown as mongoose.Model<unknown>, templateType: "happy-propose-day", editorRoute: "/happy-propose-day", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-chocolate-day"] as unknown as mongoose.Model<unknown>, templateType: "happy-chocolate-day", editorRoute: "/happy-chocolate-day", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-teddy-day"] as unknown as mongoose.Model<unknown>, templateType: "happy-teddy-day", editorRoute: "/happy-teddy-day", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-promise-day"] as unknown as mongoose.Model<unknown>, templateType: "happy-promise-day", editorRoute: "/happy-promise-day", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-hug-day"] as unknown as mongoose.Model<unknown>, templateType: "happy-hug-day", editorRoute: "/happy-hug-day", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-kiss-day"] as unknown as mongoose.Model<unknown>, templateType: "happy-kiss-day", editorRoute: "/happy-kiss-day", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-valentines-day"] as unknown as mongoose.Model<unknown>, templateType: "happy-valentines-day", editorRoute: "/happy-valentines-day", projectShared: valentineShared },
  // Happy Halloween — a ninth discriminator on the same engine.
  { model: VALENTINE_DAY_MODELS["happy-halloween"] as unknown as mongoose.Model<unknown>, templateType: "happy-halloween", editorRoute: "/happy-halloween", projectShared: valentineShared },
  // Be My Dandiya Partner — Navratri, on the same engine.
  { model: VALENTINE_DAY_MODELS["dandiya-partner"] as unknown as mongoose.Model<unknown>, templateType: "dandiya-partner", editorRoute: "/dandiya-partner", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS.sorry as unknown as mongoose.Model<unknown>, templateType: "sorry", editorRoute: "/sorry", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-birthday"] as unknown as mongoose.Model<unknown>, templateType: "happy-birthday", editorRoute: "/happy-birthday", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["miss-you"] as unknown as mongoose.Model<unknown>, templateType: "miss-you", editorRoute: "/miss-you", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["will-you-be-mine"] as unknown as mongoose.Model<unknown>, templateType: "will-you-be-mine", editorRoute: "/will-you-be-mine", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-diwali"] as unknown as mongoose.Model<unknown>, templateType: "happy-diwali", editorRoute: "/happy-diwali", projectShared: valentineShared },
  // The ultra-premium twins — same discriminator collection; valentineShared withholds a sealed page.
  { model: VALENTINE_DAY_MODELS["happy-rose-day-premium"] as unknown as mongoose.Model<unknown>, templateType: "happy-rose-day-premium", editorRoute: "/happy-rose-day-premium", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-propose-day-premium"] as unknown as mongoose.Model<unknown>, templateType: "happy-propose-day-premium", editorRoute: "/happy-propose-day-premium", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-chocolate-day-premium"] as unknown as mongoose.Model<unknown>, templateType: "happy-chocolate-day-premium", editorRoute: "/happy-chocolate-day-premium", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-teddy-day-premium"] as unknown as mongoose.Model<unknown>, templateType: "happy-teddy-day-premium", editorRoute: "/happy-teddy-day-premium", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-promise-day-premium"] as unknown as mongoose.Model<unknown>, templateType: "happy-promise-day-premium", editorRoute: "/happy-promise-day-premium", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-hug-day-premium"] as unknown as mongoose.Model<unknown>, templateType: "happy-hug-day-premium", editorRoute: "/happy-hug-day-premium", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-kiss-day-premium"] as unknown as mongoose.Model<unknown>, templateType: "happy-kiss-day-premium", editorRoute: "/happy-kiss-day-premium", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-valentines-day-premium"] as unknown as mongoose.Model<unknown>, templateType: "happy-valentines-day-premium", editorRoute: "/happy-valentines-day-premium", projectShared: valentineShared },
  { model: VALENTINE_DAY_MODELS["happy-halloween-premium"] as unknown as mongoose.Model<unknown>, templateType: "happy-halloween-premium", editorRoute: "/happy-halloween-premium", projectShared: valentineShared },
];

export const getSharedPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;

    for (const { model, templateType, editorRoute, projectShared } of TEMPLATE_LOOKUPS) {
      const page = await model.findOneAndUpdate(
        { shareId, isPublished: true },
        { $inc: { viewCount: 1 } },
        { new: true }
      );
      if (page) {
        // flattenMaps: rewind stores `answers` and searched stores
        // `alternateResults` as Maps, and `JSON.stringify` of a Map is `{}`.
        // A no-op for every other model — none store a Map.
        const pageObj = (
          page as { toObject: (o: { flattenMaps: boolean }) => Record<string, unknown> }
        ).toObject({ flattenMaps: true });
        // `contribToken` is the friends' WRITE link and must never ride along on
        // the recipient's READ response. This resolver is the one place every
        // template's document passes through generically, so stripping it here
        // also covers templates that do not exist yet — the alternative is
        // trusting each of them to remember, and share links get forwarded.
        const { password: _pw, passwordRaw: _pr, contribToken: _ct, ...stripped } = pageObj;
        const safeData = projectShared ? await projectShared(stripped, req) : stripped;
        const hasPassword = !!pageObj.password;

        // Track page view for analytics (fire-and-forget)
        const ua = req.headers["user-agent"] || "";
        PageView.create({
          shareId,
          templateType,
          pageOwnerId: pageObj.userId as mongoose.Types.ObjectId,
          visitorIp: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip,
          userAgent: ua.slice(0, 500),
          referer: (req.headers.referer || req.headers.referrer || "").toString().slice(0, 500),
          device: detectDevice(ua),
        }).catch(() => {});

        res.json({
          success: true,
          templateType,
          editorRoute,
          hasPassword,
          installCount: (pageObj.installCount as number) || 0,
          viewCount: (pageObj.viewCount as number) || 0,
          senderUserId: String(pageObj.userId),
          templateVariant: (pageObj.templateVariant as string) || undefined,
          // Where subdomains are served, a creator who has one shares ONLY
          // `{subdomain}.{ROOT_DOMAIN}/{id}`: the bare-domain route reads this
          // and refuses the page. Staging serves path links, so it never gets it.
          ownerSubdomain: isApexDeployment()
            ? (await User.findById(pageObj.userId).select("subdomain").lean())?.subdomain || undefined
            : undefined,
          data: safeData,
        });
        return;
      }
    }

    res.status(404).json({ success: false, error: "Page not found" });
  } catch (error) {
    console.error("Get shared page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const trackInstall = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;

    for (const { model } of TEMPLATE_LOOKUPS) {
      const page = await model.findOneAndUpdate(
        { shareId, isPublished: true },
        { $inc: { installCount: 1 } },
        { new: true }
      );
      if (page) {
        const count = (page as unknown as { installCount: number }).installCount;
        res.json({ success: true, installCount: count });
        return;
      }
    }

    res.status(404).json({ success: false, error: "Page not found" });
  } catch (error) {
    console.error("Track install error:", error);
    res.status(500).json({ success: false, error: "Failed to track install" });
  }
};

export const recordAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;
    const recipientUserId = req.userId;
    if (!recipientUserId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    for (const { model, templateType } of TEMPLATE_LOOKUPS) {
      const page = await model.findOne({ shareId, isPublished: true });
      if (page) {
        const pageObj = page as unknown as { userId: mongoose.Types.ObjectId };
        const senderUserId = pageObj.userId;

        if (String(senderUserId) === String(recipientUserId)) {
          res.json({ success: true, message: "Own page, no access record needed" });
          return;
        }

        await SharedAccess.findOneAndUpdate(
          { shareId, recipientUserId },
          {
            shareId,
            templateType,
            senderUserId,
            recipientUserId,
          },
          { upsert: true, new: true }
        );
        res.json({ success: true, message: "Access recorded" });
        return;
      }
    }

    res.status(404).json({ success: false, error: "Page not found" });
  } catch (error) {
    console.error("Record access error:", error);
    res.status(500).json({ success: false, error: "Failed to record access" });
  }
};

export const markPasswordVerified = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;
    const recipientUserId = req.userId;
    if (!recipientUserId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const access = await SharedAccess.findOneAndUpdate(
      { shareId, recipientUserId },
      { passwordVerified: true },
      { new: true }
    );
    if (!access) {
      res.status(404).json({ success: false, error: "Access record not found" });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Mark pw verified error:", error);
    res.status(500).json({ success: false, error: "Failed to update" });
  }
};

export const getReceivedPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const accesses = await SharedAccess.find({ recipientUserId: userId }).sort({ createdAt: -1 });
    if (!accesses.length) {
      res.json({ success: true, data: [] });
      return;
    }

    const senderIds = [...new Set(accesses.map((a) => String(a.senderUserId)))];
    const senders = await User.find({ _id: { $in: senderIds } }).select("name email avatar");
    const senderMap = new Map(senders.map((s) => [String(s._id), s]));

    const results: Record<string, unknown>[] = [];
    for (const access of accesses) {
      const lookup = TEMPLATE_LOOKUPS.find((t) => t.templateType === access.templateType);
      if (!lookup) continue;

      const query = lookup.model.findOne({ shareId: access.shareId, isPublished: true });
      if (access.passwordVerified) query.select("+passwordRaw");
      const page = await query;
      if (!page) continue;

      const pageObj = (page as { toObject: () => Record<string, unknown> }).toObject();
      const sender = senderMap.get(String(access.senderUserId));

      const entry: Record<string, unknown> = {
        shareId: access.shareId,
        templateType: access.templateType,
        // Same reason as creations. No apiBase: a recipient does not own the
        // page and has nothing to update or delete.
        templateLabel: templateLabel(access.templateType),
        editorRoute: lookup.editorRoute,
        recipientName: pageObj.recipientName,
        senderName: sender?.name || (pageObj.senderName as string) || "Someone",
        senderAvatar: sender?.avatar || null,
        hasPassword: !!pageObj.password,
        passwordVerified: access.passwordVerified,
        viewCount: (pageObj.viewCount as number) || 0,
        createdAt: access.createdAt,
      };

      if (access.passwordVerified && pageObj.passwordRaw) {
        entry.passwordRaw = pageObj.passwordRaw;
      }

      results.push(entry);
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Get received pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch received pages" });
  }
};

// ─── The fields a "My Pages" row needs, and nothing else ─────────────────────
//
// This projection is load-bearing, not tidiness.
//
// Thirty-eight of the templates store their photos as base64 data URLs INSIDE
// the page document. `find({ userId })` with no projection returns those blobs,
// so rendering a list of titles used to pull the user's entire photo library
// over the wire — tolerable while a row only existed after someone pressed
// Publish, and not tolerable now that every abandoned build is a draft.
//
// `+passwordRaw` has to be named explicitly: it is `select: false` on the
// schemas, so a projection would otherwise silently drop the one field the
// profile needs to show a page's password back to its owner.
export const CREATION_FIELDS = [
  "_id",
  "shareId",
  "isPublished",
  "recipientName",
  "senderName",
  "password",
  "viewCount",
  "installCount",
  "createdAt",
  "updatedAt",
  "+passwordRaw",
  // The question days (Valentine engine): "Said YES 💛" / "Said no 💔" on the
  // row. Two scalars; every other collection simply has no such path.
  "reactions.answer",
  "reactions.answeredAt",
].join(" ");

/** A row's answer, only when the page recorded one (absent keys otherwise). */
export function answerOfRow(obj: Record<string, unknown>): { answer?: "yes" | "no"; answeredAt?: unknown } {
  const r = obj.reactions && typeof obj.reactions === "object" ? (obj.reactions as Record<string, unknown>) : null;
  if (!r || (r.answer !== "yes" && r.answer !== "no")) return {};
  return { answer: r.answer, answeredAt: r.answeredAt ?? null };
}

export const getMyCreations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    // ── WHY Promise.all AND NOT A for..of ────────────────────────────────────
    //
    // Forty-three collections, one round trip each. Sequentially that is
    // forty-three times the latency to Mongo for a screen the user is staring
    // at, and it grew from "slow" to "the slowest authenticated endpoint we
    // have" the moment drafts meant most users had rows in several of them.
    //
    // Nothing here depends on anything else here, so they all go at once.
    const perTemplate = await Promise.all(
      TEMPLATE_LOOKUPS.map(async ({ model, templateType, editorRoute }) => {
        const pages = await model
          .find({ userId })
          .select(CREATION_FIELDS)
          .sort({ updatedAt: -1 })
          .lean();

        return (pages as Record<string, unknown>[]).map((obj) => ({
          _id: obj._id,
          shareId: obj.shareId,
          templateType,
          // Name, builder route and REST base travel WITH the row.
          //
          // The profile used to hold its own map of templateType to all three,
          // and it covered sixteen of forty-three: everything else rendered as
          // "🎁 Gift", its Edit button went to the gallery instead of the
          // builder, and Delete was disabled because there was no route to send
          // it to. Answering it here means a template is complete in a user's
          // profile the moment it exists, and the client cannot hold a stale
          // copy of a mapping only the server knows.
          templateLabel: templateLabel(templateType),
          editorRoute,
          apiBase: templateApiBase(templateType),
          recipientName: obj.recipientName,
          senderName: obj.senderName,
          isPublished: obj.isPublished,
          hasPassword: !!obj.password,
          passwordRaw: obj.passwordRaw || "",
          viewCount: (obj.viewCount as number) || 0,
          installCount: (obj.installCount as number) || 0,
          updatedAt: obj.updatedAt,
          createdAt: obj.createdAt,
          ...answerOfRow(obj),
        }));
      })
    );

    const results = perTemplate.flat();
    results.sort((a, b) => new Date(b.updatedAt as string).getTime() - new Date(a.updatedAt as string).getTime());
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Get my creations error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch creations" });
  }
};

// ─── Discarding a draft ──────────────────────────────────────────────────────
//
// Deleting a PUBLISHED page already has a home: the profile sends a DELETE to
// the template's own REST base, which is where the per-template cleanup lives.
// A draft needs a different door for one reason — the caller does not
// necessarily know the REST base. A draft the user abandoned before signing in
// is addressed the way every admin surface addresses a page across the 43
// collections, by `(templateType, pageId)`, and this endpoint resolves that pair
// through the same registry rather than making the client hold a 43-entry map it
// would keep stale.
//
// It refuses a published page on purpose. "Discard draft" and "delete the card I
// already sent people" are different decisions with different consequences, and
// a route that silently did both would turn one misplaced tap into an
// unrecoverable loss. Published pages keep going through the deliberate,
// confirmed path.
export const discardMyDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const templateType = String(req.params.templateType || "");
    const pageId = String(req.params.pageId || "");
    const lookup = TEMPLATE_LOOKUPS.find((t) => t.templateType === templateType);
    if (!lookup) {
      res.status(404).json({ success: false, error: "Unknown template" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      res.status(400).json({ success: false, error: "Invalid page id" });
      return;
    }

    // Ownership and draft-ness are BOTH in the filter, so neither is a
    // read-then-write that a concurrent publish could slip between.
    const deleted = await lookup.model.findOneAndDelete({
      _id: pageId,
      userId,
      isPublished: { $ne: true },
    });

    if (!deleted) {
      // One message for "not yours", "not there" and "already published". The
      // distinction is only useful to someone probing for other people's ids.
      res.status(404).json({ success: false, error: "No such draft" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Discard draft error:", error);
    res.status(500).json({ success: false, error: "Failed to discard draft" });
  }
};

export const getPublicProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.params.username as string;
    const user = await User.findOne({ subdomain: username.toLowerCase() }).select("name avatar subdomain status");
    // A banned or closed account's profile is hidden like its share links
    // (bannedContent.ts): it would otherwise list every page those hide.
    if (!user || HIDDEN_CONTENT_STATUSES.includes(user.status)) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    const pages: Record<string, unknown>[] = [];
    for (const { model, templateType, editorRoute } of TEMPLATE_LOOKUPS) {
      const found = await model
        .find({ userId: user._id, isPublished: true })
        .sort({ updatedAt: -1 })
        .select("shareId recipientName viewCount createdAt updatedAt");
      for (const p of found) {
        const obj = (p as { toObject: () => Record<string, unknown> }).toObject();
        pages.push({
          shareId: obj.shareId,
          templateType,
          templateLabel: templateLabel(templateType),
          editorRoute,
          recipientName: obj.recipientName,
          viewCount: (obj.viewCount as number) || 0,
          createdAt: obj.createdAt,
        });
      }
    }
    pages.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
    res.json({
      success: true,
      owner: { name: user.name, avatar: user.avatar, subdomain: user.subdomain },
      pages,
    });
  } catch (error) {
    console.error("Get public profile error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch profile" });
  }
};

export const getSharedPageByUsername = async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.params.username as string;
    const shareId = req.params.shareId as string;
    // The subdomain is part of the link, so it is checked against the owner's
    // CURRENT name: a misspelt name, somebody else's name, or a name the owner
    // has since changed away from is a 404 rather than the page.
    const name = username.toLowerCase();
    const owners = await User.find({ subdomain: name }).select("_id subdomain").lean();
    if (!owners.length) {
      res.status(404).json({ success: false, code: "SUBDOMAIN_NOT_FOUND", error: "No link with this name" });
      return;
    }
    for (const { model, templateType, editorRoute, projectShared } of TEMPLATE_LOOKUPS) {
      const page = await model.findOneAndUpdate(
        { shareId, isPublished: true, userId: { $in: owners.map((o) => o._id) } },
        { $inc: { viewCount: 1 } },
        { new: true }
      );
      if (page) {
        // flattenMaps: rewind stores `answers` and searched stores
        // `alternateResults` as Maps, and `JSON.stringify` of a Map is `{}`.
        // A no-op for every other model — none store a Map.
        const pageObj = (
          page as { toObject: (o: { flattenMaps: boolean }) => Record<string, unknown> }
        ).toObject({ flattenMaps: true });
        // `contribToken` is the friends' WRITE link and must never ride along on
        // the recipient's READ response. This resolver is the one place every
        // template's document passes through generically, so stripping it here
        // also covers templates that do not exist yet — the alternative is
        // trusting each of them to remember, and share links get forwarded.
        const { password: _pw, passwordRaw: _pr, contribToken: _ct, ...stripped } = pageObj;
        const safeData = projectShared ? await projectShared(stripped, req) : stripped;
        const hasPassword = !!pageObj.password;
        res.json({
          success: true,
          templateType,
          editorRoute,
          hasPassword,
          installCount: (pageObj.installCount as number) || 0,
          viewCount: (pageObj.viewCount as number) || 0,
          senderUserId: String(pageObj.userId),
          ownerSubdomain: owners.find((o) => String(o._id) === String(pageObj.userId))?.subdomain,
          data: safeData,
        });
        return;
      }
    }
    res.status(404).json({ success: false, code: "PAGE_NOT_ON_SUBDOMAIN", error: "Page not found" });
  } catch (error) {
    console.error("Get shared page by username error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const getInstallStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [bdayResult, valResult] = await Promise.all([
      BirthdayPage.aggregate([
        { $match: { isPublished: true } },
        { $group: { _id: null, total: { $sum: "$installCount" } } },
      ]),
      ValentinePage.aggregate([
        { $match: { isPublished: true } },
        { $group: { _id: null, total: { $sum: "$installCount" } } },
      ]),
    ]);
    const total = (bdayResult[0]?.total || 0) + (valResult[0]?.total || 0);
    res.json({ success: true, totalInstalls: total });
  } catch (error) {
    console.error("Get install stats error:", error);
    res.status(500).json({ success: false, error: "Failed to get stats" });
  }
};
