import PaymentOrder from "../models/PaymentOrder";
import { getPricing } from "../config/templatePricing";
import { hasGrant } from "../config/templateAccess";
import { slugForTemplateType } from "../config/templateSlugs";
import type { ResolvedPricing } from "../config/pricingMath";

/**
 * Why the gate said yes. Carried so `GET /payment/access` can explain itself and
 * so a support question — "why wasn't this person charged?" — has an answer that
 * does not require re-deriving the rules by hand.
 */
export type AllowReason = "free" | "already_published" | "already_paid" | "early_access";

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
 *  5. Otherwise                 → 402 with the pricing the client renders
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

  // Rule 5: the paywall.
  return {
    allowed: false,
    error: "PAYMENT_REQUIRED",
    httpStatus: 402,
    pricing,
  };
}
