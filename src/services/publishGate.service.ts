import PaymentOrder from "../models/PaymentOrder";
import { getPricing } from "../config/templatePricing";
import type { ResolvedPricing } from "../config/pricingMath";

interface GateAllowed {
  allowed: true;
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
 *  4. Otherwise                 → 402 with the pricing the client renders
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
  if (pricing.isFree) return { allowed: true };

  // Rule 2: it is already live. Never take that away.
  if (params.isAlreadyPublished) return { allowed: true };

  // Rule 3: paid, by card or by points.
  const payment = await PaymentOrder.findOne({
    userId: params.userId,
    pageId: params.pageId,
    status: { $in: ["paid", "points_used"] },
  }).select("_id");

  if (payment) return { allowed: true };

  // Rule 4: the paywall.
  return {
    allowed: false,
    error: "PAYMENT_REQUIRED",
    httpStatus: 402,
    pricing,
  };
}
