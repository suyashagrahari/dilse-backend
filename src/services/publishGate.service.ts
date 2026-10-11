import type { Request } from "express";
import PaymentOrder from "../models/PaymentOrder";
import { getPricing } from "../config/templatePricing";
import { hasGrant } from "../config/templateAccess";
import { slugForTemplateType } from "../config/templateSlugs";
import type { ResolvedPricing } from "../config/pricingMath";
import { viewerPublishesFree } from "./pricingQuote.service";
import { freeEntitlementFor } from "../config/freeAccess";

/**
 * Why the gate said yes. Carried so `GET /payment/access` can explain itself and
 * so a support question — "why wasn't this person charged?" — has an answer that
 * does not require re-deriving the rules by hand.
 */
export type AllowReason =
  | "free"
  | "already_published"
  | "already_paid"
  | "early_access"
  /** A super admin who has not switched on "Pay like a customer". */
  | "super_admin"
  /** A super admin granted this account "All templates free". */
  | "free_access"
  | "free_in_india";

interface GateAllowed {
  allowed: true;
  reason: AllowReason;
  /** The template's price, whether or not it was owed. */
  pricing: ResolvedPricing;
}

interface GateDenied {
  allowed: false;
  error: string;
  httpStatus: number;
  pricing: ResolvedPricing;
}

type GateResult = GateAllowed | GateDenied;

/**
 * Central publish gate — call this before every publish endpoint.
 *
 * Rules, in priority order:
 *  1. Free template             → allowed
 *  2. Page is already published → allowed
 *  3. A successful PaymentOrder → allowed
 *  4. An early-access grant     → allowed
 *  4b. Super admin (not paying like a customer), or "All templates free" → allowed
 *  5. "Only visitors outside India pay" is on and this visitor is in India → allowed
 *  6. Otherwise                 → 402 with the pricing the client renders
 *
 * ── WHY RULE 2 IS UNCONDITIONAL ────────────────────────────────────────────
 *
 * It used to depend on an `allowRePublishFree` config flag. The flag is gone.
 * It did two jobs and both want the same answer: it made "paid once, edit and
 * re-publish freely" work, and it is what stops a super admin pricing a template
 * from breaking pages people have already shared. Its only other setting silently
 * paywalls a live page whose owner published it for free last week, and there is
 * no situation where we want that — so it is behaviour now, not configuration.
 *
 * A consequence worth stating: publishing is charged per PAGE, once. That is the
 * intent. The thing being sold is a page going live, not a subscription.
 *
 * ── WHY THE PAYMENT LOOKUP IS SCOPED TO THE USER ───────────────────────────
 *
 * `userId` is in the query, not just `pageId`. Without it, one person's payment
 * would unlock a page owned by somebody else if they ever learned its id. The
 * caller has already confirmed the page belongs to this user before reaching
 * here, so this is defence in depth rather than the only check — but it is the
 * cheap half of the pair and it goes in the index that exists for it.
 */
export async function checkPublishAccess(params: {
  /**
   * The publishing request — required, so every template's publish passes it
   * and rule 5 can see where the visitor is. A new controller that forgets it
   * does not compile, rather than silently charging (or freeing) someone.
   */
  req: Request;
  userId: string;
  templateType: string;
  pageId: string;
  isAlreadyPublished: boolean;
}): Promise<GateResult> {
  const pricing = await getPricing(params.templateType);

  // Rule 1: nobody has priced this template.
  if (pricing.isFree) return { allowed: true, reason: "free", pricing };

  // Rule 2: it is already live. Never take that away.
  if (params.isAlreadyPublished) return { allowed: true, reason: "already_published", pricing };

  // Rule 3: paid, by card or by points.
  const payment = await PaymentOrder.findOne({
    userId: params.userId,
    pageId: params.pageId,
    status: { $in: ["paid", "points_used"] },
  }).select("_id");

  if (payment) return { allowed: true, reason: "already_paid", pricing };

  // ── Rule 4: early access ────────────────────────────────────────────────
  //
  // A super admin invited this person to try a template before it is released.
  // Charging them for the privilege of testing it is not the deal, so a grant
  // waives the payment as well as the visibility.
  //
  // Checked AFTER the payment lookup on purpose: somebody who has already paid
  // is allowed by rule 3 and never reaches this, so a grant added later cannot
  // retroactively make a completed payment look unnecessary in the logs. And
  // checked BEFORE the 402, so a granted tester is never asked for money.
  //
  // Grants are keyed by slug, the gate speaks templateType — one translation,
  // the same one the pricing lookup uses.
  if (await hasGrant(params.userId, slugForTemplateType(params.templateType))) {
    return { allowed: true, reason: "early_access", pricing };
  }

  // ── Rule 4b: free for this person ──────────────────────────────────────
  //
  // A super admin publishes free unless they switched on "Pay like a customer";
  // an account a super admin granted "All templates free" publishes free. Both
  // are facts about `params.userId` — under impersonation that is the
  // impersonated user, so viewing as somebody never makes them free.
  //
  // After rule 3 for the same reason as rule 4: a page somebody actually paid
  // for keeps reading "already_paid", even if they are granted free access later.
  const entitlement = await freeEntitlementFor(params.userId);
  if (entitlement) return { allowed: true, reason: entitlement, pricing };

  // ── Rule 5: free in India ───────────────────────────────────────────────
  //
  // A super admin switched "Who pays" to "Only visitors outside India". The
  // country comes from the server's own lookup of this request (never from the
  // client), and an unknown country pays — see config/whoPays.ts. Last of the
  // allow rules, so a page someone actually paid for still reads "already_paid".
  if (await viewerPublishesFree(params.req)) {
    return { allowed: true, reason: "free_in_india", pricing };
  }

  // Rule 6: the paywall.
  return {
    allowed: false,
    error: "PAYMENT_REQUIRED",
    httpStatus: 402,
    pricing,
  };
}
