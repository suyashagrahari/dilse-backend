import { Router } from "express";
import { getTemplateMeta } from "../controllers/templateMeta.controller";
import authRoutes from "./auth.routes";
import templateRoutes from "./template.routes";
import generateRoutes from "./generate.routes";
import favoriteRoutes from "./favorite.routes";
import wishlistRoutes from "./wishlist.routes";
import { getActivePromo } from "../controllers/promo.controller";
import { getPublicSeason } from "../controllers/season.controller";
import userContentRoutes from "./userContent.routes";
import birthdayPageRoutes from "./birthdayPage.routes";
import valentinePageRoutes from "./valentinePage.routes";
import holiPageRoutes from "./holiPage.routes";
import eidPageRoutes from "./eidPage.routes";
import weddingPageRoutes from "./weddingPage.routes";
import receptionPageRoutes from "./receptionPage.routes";
import shaadiCardPageRoutes from "./shaadiCardPage.routes";
import christianWeddingPageRoutes from "./christianWeddingPage.routes";
import loveGfPageRoutes from "./loveGfPage.routes";
import birthdayGfPageRoutes from "./birthdayGfPage.routes";
import darlingPageRoutes from "./darlingPage.routes";
import apologyDashboardPageRoutes from "./apologyDashboardPage.routes";
import missyouGfPageRoutes from "./missyouGfPage.routes";
import bouquetGfPageRoutes from "./bouquetGfPage.routes";
import courtOfLovePageRoutes from "./courtOfLovePage.routes";
import proposalPageRoutes from "./proposalPage.routes";
import courtMarriagePageRoutes from "./courtMarriagePage.routes";
import holdMyHandPageRoutes from "./holdMyHandPage.routes";
import trainTicketPageRoutes from "./trainTicketPage.routes";
import legalNoticePageRoutes from "./legalNoticePage.routes";
import kundliMilanPageRoutes from "./kundliMilanPage.routes";
import vendingMachinePageRoutes from "./vendingMachinePage.routes";
import catchGamePageRoutes from "./catchGamePage.routes";
import { makeValentineDayRouter } from "./valentineDayPage.routes";
import flagsPageRoutes from "./flagsPage.routes";
import dateInvitationPageRoutes from "./dateInvitationPage.routes";
import photoPuzzlePageRoutes from "./photoPuzzlePage.routes";
import loveflixPageRoutes from "./loveflixPage.routes";
import rewindPageRoutes from "./rewindPage.routes";
import streakPageRoutes from "./streakPage.routes";
import dedicationPageRoutes from "./dedicationPage.routes";
import searchedPageRoutes from "./searchedPage.routes";
import capsulePageRoutes from "./capsulePage.routes";
import usPageRoutes from "./usPage.routes";
import storyRoutes from "./story.routes";
import shareRoutes from "./share.routes";
import myPageRoutes from "./myPage.routes";
import feedbackRoutes from "./feedback.routes";
import publicFeedbackRoutes from "./publicFeedback.routes";
import mediaRoutes from "./media.routes";
import analyticsRoutes from "./analytics.routes";
import contactRoutes from "./contact.routes";
import referralRoutes from "./referral.routes";
import influencerRoutes from "./influencer.routes";
import prospectPublicRoutes from "./prospectPublic.routes";
import paymentRoutes from "./payment.routes";
import adminRoutes from "./admin.routes";
import superAdminRoutes from "./superAdmin.routes";
import productPageRoutes from "./productPage.routes";
import watchPageRoutes from "./watchPage.routes";
import callPageRoutes from "./callPage.routes";
import rechargePageRoutes from "./rechargePage.routes";
import challanPageRoutes from "./challanPage.routes";
import nutritionPageRoutes from "./nutritionPage.routes";
import appPageRoutes from "./appPage.routes";
import profileProPageRoutes from "./profileProPage.routes";
import contributionRoutes from "./contribution.routes";
import activityRoutes from "./activity.routes";
import rakshaBandhanPageRoutes from "./rakshaBandhanPage.routes";
import rakshaBandhanSisterPageRoutes from "./rakshaBandhanSisterPage.routes";
import ganeshChaturthiPageRoutes from "./ganeshChaturthiPage.routes";
import { protect } from "../middleware/auth";
import { scrubPrivate } from "../middleware/scrubPrivate";
import { guardBannedContent } from "../services/bannedContent";
import { requireAdmin, requireSuperAdmin } from "../middleware/adminAuth";
import { endImpersonation } from "../controllers/superAdmin.controller";
import { getPublicTemplateVisibility } from "../controllers/templateVisibility.controller";

const router = Router();

// ── Nothing private leaves, whatever a controller forgets ──────────────────
//
// FIRST, above every route, so it covers the ones added after it too. A short
// list of keys that are never legitimate in any response — the bcrypt hash, the
// OTP, the IP and user-agent kept for abuse investigations, private support
// notes — is deleted on the way out.
//
// It is a second line, not the first: 45 of the 48 public read handlers already
// strip the page password by hand. That hand-written repetition is exactly what
// this guards, because forgetting one copy is silent and what leaks is a secret
// rather than a layout. See middleware/scrubPrivate for why `email` is
// deliberately NOT on the list and is policed at build time instead.
router.use(scrubPrivate);

// Pages belonging to banned accounts answer 404 everywhere they are served —
// the central share resolver and all 43 per-template share endpoints alike.
// Costs nothing while no account is banned; see services/bannedContent.
router.use(guardBannedContent);

router.use("/auth", authRoutes);
router.use("/templates", templateRoutes);
// Which templates this deployment shows. Anonymous and cached — the gallery is
// the first thing a stranger loads and must not need a session to know what to
// render. The admin write side lives under /admin/template-visibility.
router.get("/template-visibility", getPublicTemplateVisibility);
// Tier overrides + "most created" ranking for the gallery. Anonymous, cached.
router.get("/template-meta", getTemplateMeta);
router.use("/generate", protect, generateRoutes);
router.use("/favorites", protect, favoriteRoutes);
router.use("/wishlist", wishlistRoutes);
// The wishlist sale countdown the blog and template banners render. Anonymous, cached.
router.get("/promo/active", getActivePromo);
// Which seasonal campaign THIS visitor sees (India or abroad) and its sale. Anonymous, privately cached 15 s.
router.get("/season", getPublicSeason);
router.use("/content", protect, userContentRoutes);
router.use("/birthday-pages", birthdayPageRoutes);
router.use("/valentine-pages", valentinePageRoutes);
router.use("/holi-pages", holiPageRoutes);
router.use("/eid-pages", eidPageRoutes);
router.use("/wedding-pages", weddingPageRoutes);
router.use("/reception-pages", receptionPageRoutes);
router.use("/shaadi-card-pages", shaadiCardPageRoutes);
router.use("/christian-wedding-pages", christianWeddingPageRoutes);
router.use("/love-gf-pages", loveGfPageRoutes);
router.use("/birthday-gf-pages", birthdayGfPageRoutes);
router.use("/darling-pages", darlingPageRoutes);
router.use("/apology-dashboard-pages", apologyDashboardPageRoutes);
router.use("/missyou-gf-pages", missyouGfPageRoutes);
router.use("/bouquet-gf-pages", bouquetGfPageRoutes);
router.use("/court-of-love-pages", courtOfLovePageRoutes);
router.use("/proposal-pages", proposalPageRoutes);
router.use("/court-marriage-pages", courtMarriagePageRoutes);
router.use("/hold-my-hand-pages", holdMyHandPageRoutes);
router.use("/train-ticket-pages", trainTicketPageRoutes);
router.use("/legal-notice-pages", legalNoticePageRoutes);
router.use("/kundli-milan-pages", kundliMilanPageRoutes);
router.use("/vending-machine-pages", vendingMachinePageRoutes);
router.use("/catch-pages", catchGamePageRoutes);
// Valentine's week — eight days, one engine: /happy-rose-day-pages … /happy-valentines-day-pages.
router.use("/happy-rose-day-pages", makeValentineDayRouter("happy-rose-day"));
router.use("/happy-propose-day-pages", makeValentineDayRouter("happy-propose-day"));
router.use("/happy-chocolate-day-pages", makeValentineDayRouter("happy-chocolate-day"));
router.use("/happy-teddy-day-pages", makeValentineDayRouter("happy-teddy-day"));
router.use("/happy-promise-day-pages", makeValentineDayRouter("happy-promise-day"));
router.use("/happy-hug-day-pages", makeValentineDayRouter("happy-hug-day"));
router.use("/happy-kiss-day-pages", makeValentineDayRouter("happy-kiss-day"));
router.use("/happy-valentines-day-pages", makeValentineDayRouter("happy-valentines-day"));
// Happy Halloween — the same engine, a ninth entry.
router.use("/happy-halloween-pages", makeValentineDayRouter("happy-halloween"));
// Be My Dandiya Partner (Navratri) — the same engine.
router.use("/dandiya-partner-pages", makeValentineDayRouter("dandiya-partner"));
router.use("/sorry-pages", makeValentineDayRouter("sorry"));
// Happy Birthday — the same engine.
router.use("/happy-birthday-pages", makeValentineDayRouter("happy-birthday"));
// Birthday Surprise ✦ Premium — the pop-up birthday storybook, same engine.
router.use("/birthday-premium-pages", makeValentineDayRouter("birthday-premium"));
// Miss You — the same engine.
router.use("/miss-you-pages", makeValentineDayRouter("miss-you"));
// Miss You ✦ Premium — the same engine.
router.use("/miss-you-premium-pages", makeValentineDayRouter("miss-you-premium"));
// Will You Be Mine? (a proposal page) — the same engine.
router.use("/will-you-be-mine-pages", makeValentineDayRouter("will-you-be-mine"));
router.use("/sorry-premium-pages", makeValentineDayRouter("sorry-premium"));
// Digital Bouquet ✦ Premium — arrange a bouquet, it blooms for them. Same engine.
router.use("/digital-bouquet-pages", makeValentineDayRouter("digital-bouquet"));
// Royal Wedding Invitation 👑 ($20 wedding tier) — same engine; guest RSVP + blessings routes mount with it.
router.use("/royal-wedding-invitation-pages", makeValentineDayRouter("royal-wedding-invitation"));
// The Proposal ✦ Premium (the proposal's premium edition) — the same engine.
router.use("/proposal-premium-pages", makeValentineDayRouter("proposal-premium"));
// Happy Anniversary ("Our Little Love Museum") — the same engine.
router.use("/happy-anniversary-pages", makeValentineDayRouter("happy-anniversary"));
// Anniversary ✦ Premium ("The Book of Us") — the same engine.
router.use("/anniversary-premium-pages", makeValentineDayRouter("anniversary-premium"));
// Happy Diwali — the same engine.
router.use("/happy-diwali-pages", makeValentineDayRouter("happy-diwali"));
// The ultra-premium tier: a twin of each day on the same engine (+ voice note, unlock, reply).
router.use("/happy-rose-day-premium-pages", makeValentineDayRouter("happy-rose-day-premium"));
router.use("/happy-propose-day-premium-pages", makeValentineDayRouter("happy-propose-day-premium"));
router.use("/happy-chocolate-day-premium-pages", makeValentineDayRouter("happy-chocolate-day-premium"));
router.use("/happy-teddy-day-premium-pages", makeValentineDayRouter("happy-teddy-day-premium"));
router.use("/happy-promise-day-premium-pages", makeValentineDayRouter("happy-promise-day-premium"));
router.use("/happy-hug-day-premium-pages", makeValentineDayRouter("happy-hug-day-premium"));
router.use("/happy-kiss-day-premium-pages", makeValentineDayRouter("happy-kiss-day-premium"));
router.use("/happy-valentines-day-premium-pages", makeValentineDayRouter("happy-valentines-day-premium"));
router.use("/happy-halloween-premium-pages", makeValentineDayRouter("happy-halloween-premium"));
router.use("/flags-pages", flagsPageRoutes);
router.use("/date-invitation-pages", dateInvitationPageRoutes);
router.use("/photo-puzzle-pages", photoPuzzlePageRoutes);
router.use("/loveflix-pages", loveflixPageRoutes);
router.use("/rewind-pages", rewindPageRoutes);
router.use("/streak-pages", streakPageRoutes);
router.use("/dedication-pages", dedicationPageRoutes);
router.use("/searched-pages", searchedPageRoutes);
router.use("/capsule-pages", capsulePageRoutes);
router.use("/us-pages", usPageRoutes);
router.use("/product-pages", productPageRoutes);
router.use("/watch-pages", watchPageRoutes);
router.use("/call-pages", callPageRoutes);
router.use("/recharge-pages", rechargePageRoutes);
router.use("/challan-pages", challanPageRoutes);
router.use("/nutrition-pages", nutritionPageRoutes);
router.use("/app-pages", appPageRoutes);
router.use("/profile-pro-pages", profileProPageRoutes);
router.use("/raksha-bandhan-pages", rakshaBandhanPageRoutes);
// The same festival read from the other side: a brother's page for his sister.
// A separate mount and a separate collection, not a flag on the one above —
// the two pages store different halves of the ritual and neither can render the
// other's fields.
router.use("/raksha-bandhan-sister-pages", rakshaBandhanSisterPageRoutes);
router.use("/ganesh-chaturthi-pages", ganeshChaturthiPageRoutes);
// Anonymous friends post here, addressed only by shareId. Everything it can
// reach is gated by config/contributionTemplates.ts.
router.use("/contributions", contributionRoutes);
// Real, aggregate creation counts for the homepage ticker.
router.use("/activity", activityRoutes);
router.use("/story", storyRoutes);
router.use("/share", shareRoutes);

// A page's owner managing their own share password. Deliberately NOT behind
// `requireTemplateAccess`: switching a template off must not take away an
// owner's control of pages they have already published from it — the same line
// `middleware/templateGate` draws for reads and recipient routes.
router.use("/my-pages", protect, myPageRoutes);
router.use("/media", mediaRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/contact", contactRoutes);
// The public wall of what creators said. Mounted BEFORE the protected
// `/feedback` below, because Express matches in order and the broader prefix
// would otherwise run `protect` on a page that must work signed out. It is
// read-only and its projection is a whitelist — see the controller for what is
// deliberately withheld, `pageUrl` above all.
router.use("/feedback/public", publicFeedbackRoutes);
// Post-publish feedback from the creator. `protect` because a reply is an
// email, so a rating with no account behind it is a dead end — and because the
// address replied to must come from the session rather than the payload.
router.use("/feedback", protect, feedbackRoutes);
router.use("/referral", referralRoutes);
router.use("/influencer", influencerRoutes);
// Unsubscribe link in prospect outreach emails. Public; token-gated.
router.use("/public/prospects", prospectPublicRoutes);
router.use("/payment", paymentRoutes);
// Super-admin surfaces sit ABOVE the /admin mount so the more specific prefix
// matches first, and behind their own gate rather than widening `requireAdmin`.
router.use("/admin/super", protect, requireSuperAdmin, superAdminRoutes);

// Ending an impersonation session happens while holding an impersonation token,
// which `requireSuperAdmin` deliberately rejects — so this one route is mounted
// on `protect` alone and reads both identities from the token itself.
router.post("/admin/impersonate/end", protect, endImpersonation);

router.use("/admin", protect, requireAdmin, adminRoutes);

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Gifts API is running",
    timestamp: new Date().toISOString(),
  });
});

export default router;
