import PaymentOrder from "../models/PaymentOrder";
import { getPricing, type TemplatePricingConfig } from "../config/templatePricing";

interface GateAllowed {
  allowed: true;
}

interface GateDenied {
  allowed: false;
  error: string;
  httpStatus: number;
  pricing: TemplatePricingConfig;
}

type GateResult = GateAllowed | GateDenied;

/**
 * Central publish gate — call this before every publish endpoint.
 *
 * Rules (in priority order):
 *  1. Free template                     → allowed
 *  2. Already published + re-publish OK → allowed (user paid once, re-publish is free)
 *  3. Valid PaymentOrder exists          → allowed
 *  4. Otherwise                         → 402 with pricing payload for client modal
 */
export async function checkPublishAccess(params: {
  userId: string;
  templateType: string;
  pageId: string;
  isAlreadyPublished: boolean;
}): Promise<GateResult> {
  const pricing = getPricing(params.templateType);

  // Rule 1: free template
  if (pricing.isFree) return { allowed: true };

  // Rule 2: re-publishing an already-live page is free
  if (params.isAlreadyPublished && pricing.allowRePublishFree) {
    return { allowed: true };
  }

  // Rule 3: check for a successful payment record
  const payment = await PaymentOrder.findOne({
    userId: params.userId,
    pageId: params.pageId,
    status: { $in: ["paid", "points_used"] },
  });

  if (payment) return { allowed: true };

  // Rule 4: payment required
  return {
    allowed: false,
    error: "PAYMENT_REQUIRED",
    httpStatus: 402,
    pricing,
  };
}
