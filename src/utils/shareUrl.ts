import { env, isApexDeployment } from "../config/env";
import User from "../models/User";

/**
 * Is this deployment actually served from the domain that owns the wildcard
 * subdomain routing? Only production is: its SHARE_BASE_URL host is the root
 * domain itself (or its www). Staging (e.g. stag.subhsandesh.in) also runs with
 * APP_ENV=production and inherits ROOT_DOMAIN, but its host is NOT the apex — so
 * a `{user}.{ROOT_DOMAIN}` link would point at production (a different DB) and
 * 404. In that case we must fall back to the path-based SHARE_BASE_URL so the
 * link resolves within the same environment the page was created in.
 *
 * The test itself now lives in `config/env.ts` as `isApexDeployment`, because
 * template visibility needs the same question answered and two copies of it
 * would eventually disagree.
 */
const servesWildcardSubdomains = isApexDeployment;

/**
 * Build a share URL for a published page.
 *
 * - When served from the wildcard-owning root domain AND the owner has a
 *   subdomain:  https://{subdomain}.{ROOT_DOMAIN}/{shareId}
 * - Otherwise (staging, local, or owner without a subdomain) fall back to the
 *   path-based SHARE_BASE_URL:  {SHARE_BASE_URL}/{shareId}
 */
export async function buildShareUrl(shareId: string, userId: string): Promise<string> {
  if (servesWildcardSubdomains()) {
    const user = await User.findById(userId).select("subdomain");
    if (user?.subdomain) {
      return `https://${user.subdomain}.${env.ROOT_DOMAIN}/${shareId}`;
    }
  }
  return `${env.SHARE_BASE_URL}/${shareId}`;
}
