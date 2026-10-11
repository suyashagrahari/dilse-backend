import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import PointTransaction from "../models/PointTransaction";
import PaymentOrder from "../models/PaymentOrder";
import { getPricingFresh, allPricing } from "../config/templatePricing";
import { templateLabel } from "../config/templateCatalog";
import { TEMPLATE_LOOKUPS } from "./share.controller";
import { checkPublishAccess } from "../services/publishGate.service";
import { createRazorpayOrder, verifyRazorpaySignature } from "../services/razorpay.service";
import { env } from "../config/env";
import { recordEarningForOrder } from "../services/influencer.service";
import { audienceFor, quoteFor, viewerFreeReason, type ViewerFreeReason } from "../services/pricingQuote.service";

/** What the refusal says when nothing is owed, by reason. */
function noPaymentMessage(reason: ViewerFreeReason, what: "payment" | "points"): string {
  const lead = what === "points" ? "No points needed" : "No payment needed";
  switch (reason) {
    case "super_admin": return `${lead} — you publish free as a super admin.`;
    case "free_access": return `${lead} — all templates are free for you.`;
    default: return `${lead} — this template is free for you in India.`;
  }
}
import { localizePricing, toInrPaise } from "../config/currency";

// ── Page ownership ──────────────────────────────────────────────────────────
//
// This used to be a hand-written map of six templateTypes — holi, eid, wedding,
// reception, birthday, valentine — which meant `create-order` answered 403 for
// the other thirty-seven: a paywall that opens and then cannot take money.
// Nothing failed while `holi` was the only paid template, and nothing would have
// failed until a super admin priced the seventh.
//
// `TEMPLATE_LOOKUPS` is already the single list of which templates exist and
// which model each one stores its pages in. Deriving from it means a new
// template is chargeable the moment it is shareable, with no second place to
// remember. `payment.ownership.test.ts` asserts the two lists cannot diverge.
const MODEL_BY_TYPE = new Map<string, mongoose.Model<unknown>>(
  TEMPLATE_LOOKUPS.map(({ templateType, model }) => [templateType, model])
);

export function modelForTemplateType(templateType: string): mongoose.Model<unknown> | null {
  return MODEL_BY_TYPE.get(String(templateType || "").trim().toLowerCase()) ?? null;
}

/** A page the requesting user owns, or null. */
interface OwnedPage {
  _id: mongoose.Types.ObjectId;
  isPublished?: boolean;
}

/**
 * The page, if it exists and belongs to this user.
 *
 * Returns the document rather than a boolean because both callers need to know
 * whether it is already published, and a second query for one field would be
 * wasteful. See `createOrder` for why that matters.
 */
async function findOwnedPage(
  templateType: string,
  pageId: string,
  userId: string
): Promise<OwnedPage | null> {
  const Model = modelForTemplateType(templateType);
  if (!Model) return null;
  try {
    const page = await Model.findOne({
      _id: new mongoose.Types.ObjectId(pageId),
      userId: new mongoose.Types.ObjectId(userId),
    })
      .select("_id isPublished")
      .lean();
    return (page as OwnedPage | null) ?? null;
  } catch {
    return null;
  }
}

// ── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /payment/pricing  — PUBLIC
 *
 * Every priced template, keyed by slug. The client reads this instead of
 * carrying a hardcoded mirror of the server's prices, which is what it used to
 * do and what made a price change a two-repo deploy.
 */
export const getPricingConfig = async (req: Request, res: Response): Promise<void> => {
  // PRIVATE: the season sale differs for visitors in India and abroad, so this
  // answer is per visitor and a shared cache (CDN, proxy) must never hand one
  // country's prices to the next. The browser may still keep it for a minute.
  res.set("Cache-Control", "private, max-age=60");
  try {
    const pricing = await allPricing({ audience: await audienceFor(req) });
    res.json({ success: true, data: pricing });
  } catch (error) {
    console.error("Pricing config error:", error);
    // An empty map, not a 500. Empty means "everything is free", and neither the
    // gallery nor an editor may break because this read did. The gate is what
    // actually decides whether money is owed, so a client that wrongly believes
    // a template is free still gets a 402 when it tries to publish.
    res.json({ success: true, data: {} });
  }
};

/**
 * GET /payment/access?templateType=&pageId=  — PROTECTED
 *
 * "If I press Publish now, will I be asked to pay?"
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Without it the client can only find out by ATTEMPTING a publish and reading
 * the 402. That works, and it is still the backstop, but it means the publish
 * button spins while the answer comes back — and then keeps spinning behind the
 * paywall, because the publish never completed. The user sees a loading state
 * before, and during, being asked for money.
 *
 * Asking first costs one fast request and lets the client put the paywall up with
 * nothing spinning at all. The publish request is then only ever made when it is
 * going to succeed.
 *
 * ── IT IS NOT A SECOND SET OF RULES ─────────────────────────────────────────
 *
 * It calls `checkPublishAccess` — the same function the publish endpoints call.
 * A separate "will this be allowed" implementation would be two rule sets to keep
 * in step, and the failure mode is the worst one available: the client believes
 * publishing is free, does not show a paywall, and the publish is refused.
 */
export const getPublishAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const templateType = String(req.query.templateType || "").trim();
    const pageId = String(req.query.pageId || "").trim();

    if (!templateType || !pageId) {
      res.status(400).json({ success: false, error: "templateType and pageId are required" });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      res.status(400).json({ success: false, error: "Invalid pageId" });
      return;
    }

    // Ownership, and `isAlreadyPublished` in the same query — the gate needs the
    // second and we must not answer questions about somebody else's page.
    const page = await findOwnedPage(templateType, pageId, String(req.userId));
    if (!page) {
      res.status(403).json({ success: false, error: "Page not found or access denied" });
      return;
    }

    const gate = await checkPublishAccess({ req,
      userId: String(req.userId),
      templateType,
      pageId,
      isAlreadyPublished: !!page.isPublished,
    });

    res.set("Cache-Control", "private, no-store");
    res.json({
      success: true,
      data: gate.allowed
        ? { needsPayment: false, reason: gate.reason, pricing: gate.pricing }
        : { needsPayment: true, reason: "payment_required", pricing: gate.pricing },
    });
  } catch (error) {
    console.error("Publish access error:", error);
    // A 500 here must not become a dead Publish button. The client treats an
    // unusable answer as "do not know", attempts the publish, and falls back to
    // the 402 path — which is exactly the behaviour that existed before this
    // endpoint. Degrading to the old flow beats blocking.
    res.status(500).json({ success: false, error: "Could not check publish access" });
  }
};

/**
 * GET /payment/quote?templateType=  — PROTECTED
 *
 * The price THIS buyer will be charged, in their currency. The paywall shows
 * this, and sends back `currency` + `finalAmount` to create-order, which
 * re-derives both and refuses (409) if they no longer match.
 *
 * Private and never cached: two visitors in two countries must never be handed
 * each other's quote by a browser cache or a proxy.
 */
export const getQuote = async (req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Authorization");
  try {
    const templateType = String(req.query.templateType || "").trim();
    if (!templateType || templateType.length > 80) {
      res.status(400).json({ success: false, error: "templateType is required" });
      return;
    }
    const quote = await quoteFor(req, templateType);
    res.json({
      success: true,
      data: {
        pricing: quote.pricing,
        currency: quote.currency,
        country: quote.country,
        // Lets the paywall say "International checkout via PayPal" for USD.
        international: quote.currency !== "INR",
        // Nothing is owed by this viewer (super admin, "All templates free", or
        // free in India): the paywall closes and the publish goes through
        // instead of showing a price. `freeReason` says which, for the copy.
        freeForViewer: quote.freeForViewer,
        freeReason: quote.freeReason,
      },
    });
  } catch (error) {
    console.error("Quote error:", error);
    res.status(500).json({ success: false, error: "Could not load the price" });
  }
};

/**
 * POST /payment/create-order  — PROTECTED
 * Creates a Razorpay order for a given template page.
 * Returns the orderId and public key so the client can open the Razorpay checkout.
 */
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateType, pageId } = req.body as { templateType?: string; pageId?: string };

    if (!templateType || !pageId) {
      res.status(400).json({ success: false, error: "templateType and pageId are required" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      res.status(400).json({ success: false, error: "Invalid pageId" });
      return;
    }

    // Read uncached: this decides what comes off a card. The country is
    // re-resolved here, never taken from the client — see pricingQuote.service.
    const quote = await quoteFor(req, templateType, { fresh: true });

    if (quote.base.isFree) {
      res.status(400).json({ success: false, error: "This template is free — no payment required" });
      return;
    }

    // Nothing is owed by this viewer: a super admin not paying like a customer,
    // an "All templates free" grant, or free in India. A paywall left open across
    // one of those switching on lands here, and must not take money — the client
    // closes it and publishes (gate rules 4b and 5 agree).
    if (quote.freeReason) {
      res.status(400).json({
        success: false,
        error: noPaymentMessage(quote.freeReason, "payment"),
        code: "NO_PAYMENT_NEEDED",
        reason: quote.freeReason,
      });
      return;
    }

    // Verify the requesting user actually owns the page
    const page = await findOwnedPage(templateType, pageId, String(req.userId));
    if (!page) {
      res.status(403).json({ success: false, error: "Page not found or access denied" });
      return;
    }

    // ── Never charge for a page that is already live ─────────────────────────
    //
    // Gate rule 2 lets an already-published page re-publish for free. Taking
    // money for one would be charging for something the user already has and can
    // do again for nothing. Reachable in practice: publish while the template is
    // free, a super admin prices it, then the editor's Publish is pressed again
    // and a stale client opens checkout instead of just re-publishing.
    if (page.isPublished) {
      res.status(400).json({
        success: false,
        error: "This page is already published — re-publishing is free.",
        code: "ALREADY_PUBLISHED",
      });
      return;
    }

    // Idempotency: don't create a duplicate order if already unlocked
    const existing = await PaymentOrder.findOne({
      userId: req.userId,
      pageId: new mongoose.Types.ObjectId(pageId),
      status: { $in: ["paid", "points_used"] },
    });
    if (existing) {
      res.status(400).json({ success: false, error: "Page is already unlocked for publishing" });
      return;
    }

    // ── Never charge an amount, or a currency, the user was not shown ────────
    //
    // A current client sends the quote it displayed: `expectedCurrency` and
    // `expectedAmount`. If either differs from what the server resolves NOW —
    // the price changed, or the buyer's network moved them across a border (VPN
    // toggled between seeing the price and pressing Pay) — refuse with 409 and
    // the fresh quote, so they agree to the new number before paying it.
    //
    // An OLDER client (cached JS from before multi-currency) sends only
    // `expectedFinalPricePaise` and renders ₹. It is always charged INR, so it is
    // never surprised by a dollar amount it cannot display. Those buyers can
    // only complete an INR checkout with an Indian instrument anyway.
    const body = req.body as { expectedFinalPricePaise?: unknown; expectedCurrency?: unknown; expectedAmount?: unknown };
    const legacy = body.expectedCurrency === undefined;
    const charge = legacy
      ? localizePricing(quote.base, "INR", quote.inrPerUsd)
      : quote.pricing;

    // The legacy (INR-only) contract is honoured ONLY when this buyer would be
    // charged INR anyway. Otherwise leaving out `expectedCurrency` would be a
    // way for anyone abroad to opt out of the USD price. They get a 409 with
    // the real quote instead — which a current client renders and an old one
    // reports as "price changed", prompting a reload into the new client.
    if (legacy && quote.currency !== "INR") {
      res.status(409).json({
        success: false,
        error: `This checkout is in ${quote.currency} for your location. Please review the price and try again.`,
        code: "PRICE_CHANGED",
        pricing: quote.base,
        quote: { pricing: quote.pricing, currency: quote.currency, country: quote.country },
      });
      return;
    }

    if (legacy) {
      if (Number.isInteger(body.expectedFinalPricePaise) && body.expectedFinalPricePaise !== quote.base.finalPricePaise) {
        res.status(409).json({
          success: false,
          error: "The price of this template changed. Please review it and try again.",
          code: "PRICE_CHANGED",
          pricing: quote.base,
        });
        return;
      }
    } else if (body.expectedCurrency !== charge.currency || body.expectedAmount !== charge.finalAmount) {
      res.status(409).json({
        success: false,
        error:
          body.expectedCurrency !== charge.currency
            ? `Your location changed, so this checkout is now in ${charge.currency}. Please review the price and try again.`
            : "The price of this template changed. Please review it and try again.",
        code: "PRICE_CHANGED",
        pricing: quote.base,
        quote: { pricing: charge, currency: charge.currency, country: quote.country },
      });
      return;
    }

    const label = templateLabel(templateType);
    const fxRateToINR = charge.currency === "INR" ? 1 : quote.inrPerUsd;

    // Razorpay receipt: max 40 chars, must be unique
    const receipt = `pay_${pageId}_${Date.now()}`.slice(0, 40);

    const razorpayOrder = await createRazorpayOrder({
      amount: charge.finalAmount,
      currency: charge.currency,
      receipt,
      notes: {
        templateType: String(templateType).slice(0, 60),
        pageId: String(pageId),
        userId: String(req.userId),
        country: quote.country || "unknown",
      },
    });

    // Persist the order so we can verify it later. The exchange rate is frozen
    // here: revenue and influencer commission are computed from it, never from
    // whatever the rate is on the day somebody reads a report.
    const paymentOrder = await PaymentOrder.create({
      userId:          req.userId,
      templateType,
      pageId:          new mongoose.Types.ObjectId(pageId),
      amount:          charge.finalAmount,
      currency:        charge.currency,
      country:         quote.country,
      fxRateToINR,
      amountInrPaise:  toInrPaise(charge.finalAmount, charge.currency, fxRateToINR),
      status:          "created",
      razorpayOrderId: razorpayOrder.id,
    });

    res.status(201).json({
      success: true,
      data: {
        orderId:        razorpayOrder.id,
        paymentOrderId: String(paymentOrder._id),
        amount:         charge.finalAmount,
        currency:       charge.currency,
        keyId:          env.RAZORPAY_KEY_ID,
        name:           label,
        // `ResolvedPricing` carries no name — pricing rows store a price, not
        // copy. The human label comes from the catalogue, which is where every
        // other surface already gets it.
        description:
          charge.discountPercent > 0
            ? `Unlock ${label} — ${charge.discountPercent}% off`
            : `Unlock ${label}`,
      },
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ success: false, error: "Failed to create payment order" });
  }
};

/**
 * POST /payment/verify  — PROTECTED
 * Verifies the Razorpay payment signature server-side (HMAC-SHA256).
 * Marks the PaymentOrder as "paid" on success so the publish gate clears.
 */
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body as {
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpaySignature?: string;
    };

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({
        success: false,
        error: "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required",
      });
      return;
    }

    // Find the order — MUST belong to the requesting user (prevents cross-user verification)
    const paymentOrder = await PaymentOrder.findOne({
      razorpayOrderId,
      userId: req.userId,
    });

    if (!paymentOrder) {
      res.status(404).json({ success: false, error: "Payment order not found" });
      return;
    }

    // Idempotency: already verified successfully
    if (paymentOrder.status === "paid") {
      res.json({ success: true, message: "Payment already verified" });
      return;
    }

    if (paymentOrder.status !== "created") {
      res.status(400).json({ success: false, error: "Payment order is in an invalid state" });
      return;
    }

    // Cryptographic signature verification (constant-time)
    const isValid = verifyRazorpaySignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isValid) {
      // Conditional: if the webhook has already marked this order paid, a bad
      // signature arriving afterwards must not overwrite that with "failed".
      await PaymentOrder.updateOne({ _id: paymentOrder._id, status: "created" }, { $set: { status: "failed" } });
      res.status(400).json({ success: false, error: "Payment verification failed: invalid signature" });
      return;
    }

    // Mark as paid — atomically, conditioned on still being "created". The
    // Razorpay webhook may confirm the same payment at the same moment; whichever
    // write lands first wins and the other becomes a no-op, so the order is
    // marked once and commission is recorded once.
    const updated = await PaymentOrder.findOneAndUpdate(
      { _id: paymentOrder._id, status: "created" },
      { $set: { status: "paid", razorpayPaymentId, razorpaySignature } },
      { new: true }
    );
    if (updated) {
      // Commission for the influencer who referred this user, if any. Never
      // throws: bookkeeping must not fail the customer's verification.
      await recordEarningForOrder(updated);
    }

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    console.error("Verify payment error:", error);
    res.status(500).json({ success: false, error: "Payment verification failed" });
  }
};

/**
 * POST /payment/spend-points  — PROTECTED
 * Atomically deducts points from the user as an alternative to paying.
 * Uses MongoDB findOneAndUpdate with a balance guard to prevent race conditions.
 */
export const spendPoints = async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateType, pageId } = req.body as { templateType?: string; pageId?: string };

    if (!templateType || !pageId) {
      res.status(400).json({ success: false, error: "templateType and pageId are required" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      res.status(400).json({ success: false, error: "Invalid pageId" });
      return;
    }

    // Read uncached: points are a currency too, and the same "charged what the
    // user was not shown" problem applies.
    const pricing = await getPricingFresh(templateType, await audienceFor(req));

    if (pricing.isFree || pricing.pointsCost === 0) {
      res.status(400).json({ success: false, error: "This template does not support points payment" });
      return;
    }

    // Free for this viewer right now: never take a points balance for it either.
    const freeReason = await viewerFreeReason(req, { fresh: true });
    if (freeReason) {
      res.status(400).json({
        success: false,
        error: noPaymentMessage(freeReason, "points"),
        code: "NO_PAYMENT_NEEDED",
        reason: freeReason,
      });
      return;
    }

    // Verify the requesting user actually owns the page
    const page = await findOwnedPage(templateType, pageId, String(req.userId));
    if (!page) {
      res.status(403).json({ success: false, error: "Page not found or access denied" });
      return;
    }

    // Already live means re-publishing is free — see the same guard in
    // `createOrder`. Spending points here would take a real balance for nothing.
    if (page.isPublished) {
      res.status(400).json({
        success: false,
        error: "This page is already published — re-publishing is free.",
        code: "ALREADY_PUBLISHED",
      });
      return;
    }

    // Idempotency: already unlocked
    const existing = await PaymentOrder.findOne({
      userId: req.userId,
      pageId: new mongoose.Types.ObjectId(pageId),
      status: { $in: ["paid", "points_used"] },
    });
    if (existing) {
      res.status(400).json({ success: false, error: "Page is already unlocked for publishing" });
      return;
    }

    // Atomic deduction — only succeeds if user.points >= pointsCost
    // This prevents over-spending in concurrent requests (no race condition)
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.userId, points: { $gte: pricing.pointsCost } },
      { $inc: { points: -pricing.pointsCost } },
      { new: true, select: "points" }
    );

    if (!updatedUser) {
      res.status(400).json({ success: false, error: "Insufficient points" });
      return;
    }

    // ── From here the balance is already gone ────────────────────────────────
    //
    // The deduction above is atomic and has committed. If writing the unlock now
    // fails, the user has paid and has nothing: the gate still refuses, and the
    // points are not coming back on their own. There is no transaction spanning
    // these writes (this deployment is not guaranteed to be a replica set, and
    // `findOneAndUpdate` with a balance guard was chosen precisely to avoid
    // needing one), so the compensation is explicit.
    //
    // Put the balance back and report failure. The user retries and is charged
    // once, which is the only acceptable outcome of a half-finished payment.
    try {
      // Create the payment record (so publish gate clears)
      await PaymentOrder.create({
        userId:     req.userId,
        templateType,
        pageId:     new mongoose.Types.ObjectId(pageId),
        amount:     0,             // no money charged
        currency:   "INR",
        status:     "points_used",
        pointsUsed: pricing.pointsCost,
      });
    } catch (err) {
      console.error("[points] unlock write failed after deducting, refunding:", err);
      const refunded = await User.findOneAndUpdate(
        { _id: req.userId },
        { $inc: { points: pricing.pointsCost } },
        { new: true, select: "points" }
      );
      // Recorded even on the failure path: a balance that moved twice with no
      // trail is the thing that makes a support ticket unanswerable.
      await PointTransaction.create({
        user:    req.userId,
        type:    "template_publish",
        delta:   pricing.pointsCost,
        balance: refunded?.points ?? updatedUser.points + pricing.pointsCost,
        meta:    { templateType, pageId, reason: "refund: unlock write failed" },
      }).catch(() => { /* already in a failure path; do not mask the 500 */ });

      res.status(500).json({
        success: false,
        error: "Could not unlock the page. Your points have not been spent — please try again.",
      });
      return;
    }

    // Audit log for the point deduction. Deliberately AFTER the unlock: if this
    // write is the one that fails, the user has what they paid for and we have
    // lost a log line, which is the right way round for the two to fail.
    await PointTransaction.create({
      user:    req.userId,
      type:    "template_publish",
      delta:   -pricing.pointsCost,
      balance: updatedUser.points,
      meta:    { templateType, pageId },
    }).catch((err) => {
      console.error("[points] transaction log failed after a successful unlock:", err);
    });

    res.json({
      success: true,
      message: "Points spent successfully",
      data: { remainingPoints: updatedUser.points },
    });
  } catch (error) {
    console.error("Spend points error:", error);
    res.status(500).json({ success: false, error: "Failed to spend points" });
  }
};
