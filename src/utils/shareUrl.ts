import { env } from "../config/env";
import User from "../models/User";

/**
 * Build a share URL for a published page.
 *
 * - If ROOT_DOMAIN is configured AND the page owner has a subdomain:
 *     https://{subdomain}.{ROOT_DOMAIN}/{shareId}
 * - Otherwise fall back to the plain SHARE_BASE_URL:
 *     https://{SHARE_BASE_URL}/{shareId}
 */
export async function buildShareUrl(shareId: string, userId: string): Promise<string> {
  if (env.ROOT_DOMAIN) {
    const user = await User.findById(userId).select("subdomain");
    if (user?.subdomain) {
      return `https://${user.subdomain}.${env.ROOT_DOMAIN}/${shareId}`;
    }
  }
  return `${env.SHARE_BASE_URL}/${shareId}`;
}
