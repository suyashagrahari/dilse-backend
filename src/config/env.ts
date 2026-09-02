import dotenv from "dotenv";
dotenv.config();

// ═══════════════════════════════════════════════════════════════════
//  ENVIRONMENT SWITCH
//  Set APP_ENV in your .env file to one of: local | ngrok | production
//  Everything else auto-configures based on this single value.
// ═══════════════════════════════════════════════════════════════════
type AppEnv = "local" | "ngrok" | "production";

const APP_ENV = (process.env.APP_ENV || "local") as AppEnv;

if (!["local", "ngrok", "production"].includes(APP_ENV)) {
  console.error(`❌ Invalid APP_ENV="${APP_ENV}". Must be: local | ngrok | production`);
  process.exit(1);
}

// ── Per-environment resolved values ────────────────────────────────
const resolved = (() => {
  switch (APP_ENV) {
    case "local":
      return {
        port: parseInt(process.env.LOCAL_PORT || "5000", 10),
        mongodbUri: process.env.LOCAL_MONGODB_URI || "mongodb://localhost:27017/gifts",
        clientUrl: process.env.LOCAL_CLIENT_URL || "http://localhost:3000",
        appUrl: (process.env.LOCAL_CLIENT_URL || "http://localhost:3000").split(",")[0].trim(),
        nodeEnv: "development" as const,
      };

    case "ngrok":
      return {
        port: parseInt(process.env.LOCAL_PORT || "5000", 10),
        // Ngrok still uses local MongoDB — only the public URL changes
        mongodbUri: process.env.LOCAL_MONGODB_URI || "mongodb://localhost:27017/gifts",
        clientUrl: process.env.NGROK_CLIENT_URL || "http://localhost:3000",
        appUrl: process.env.NGROK_URL || "http://localhost:3000",
        nodeEnv: "development" as const,
      };

    case "production":
      return {
        port: parseInt(process.env.PROD_PORT || "5000", 10),
        mongodbUri: process.env.PROD_MONGODB_URI || "",
        clientUrl: process.env.PROD_CLIENT_URL || "",
        appUrl: process.env.PROD_APP_URL || process.env.PROD_CLIENT_URL || "",
        nodeEnv: "production" as const,
      };
  }
})();

// ── Production safety validation ───────────────────────────────────
if (APP_ENV === "production") {
  const missing: string[] = [];

  if (!resolved.mongodbUri)
    missing.push("PROD_MONGODB_URI");
  if (!resolved.clientUrl)
    missing.push("PROD_CLIENT_URL");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    missing.push("JWT_SECRET (min 32 characters)");
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32)
    missing.push("JWT_REFRESH_SECRET (min 32 characters)");
  if (!process.env.GOOGLE_CLIENT_ID)
    missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.S3_REGION)
    missing.push("S3_REGION");
  if (!process.env.S3_BUCKET_NAME)
    missing.push("S3_BUCKET_NAME");
  if (!process.env.S3_ACCESS_KEY_ID)
    missing.push("S3_ACCESS_KEY_ID");
  if (!process.env.S3_SECRET_ACCESS_KEY)
    missing.push("S3_SECRET_ACCESS_KEY");

  if (missing.length > 0) {
    console.error("❌ Missing/invalid required production environment variables:");
    missing.forEach((v) => console.error(`   • ${v}`));
    console.error("Server will not start until these are set correctly.");
    process.exit(1);
  }
}

// ── Exported config (use this everywhere, never read process.env directly) ──
export const env = {
  APP_ENV,
  PORT: resolved.port,
  MONGODB_URI: resolved.mongodbUri,
  NODE_ENV: resolved.nodeEnv,
  CLIENT_URL: resolved.clientUrl,
  CLIENT_URLS: resolved.clientUrl.split(",").map((u) => u.trim()),
  APP_URL: resolved.appUrl,
  SHARE_BASE_URL: (process.env.SHARE_BASE_URL || resolved.appUrl).replace(/\/+$/, ""),

  // Secrets — shared across environments (but MUST be strong in production)
  JWT_SECRET: process.env.JWT_SECRET || "default_jwt_secret_change_me_in_production",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "default_refresh_secret_change_me_in_production",

  // External APIs
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  S3_REGION: process.env.S3_REGION || "",
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || "",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || "",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || "",
  S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL || "",
  S3_UPLOAD_PREFIX: process.env.S3_UPLOAD_PREFIX || "gifts-media",

  // Root domain for wildcard subdomain routing
  // Dev: klyro.digital  |  Prod: subhsandesh.in
  ROOT_DOMAIN: process.env.ROOT_DOMAIN || "",

  // Resend (for OTP emails)
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",

  // ── Amazon SES ────────────────────────────────────────────────────────────
  //
  // Used for the draft follow-up emails only; OTP, contact replies and feedback
  // replies still go through Resend. Two providers is deliberate rather than
  // accidental: these follow-ups are the one thing here that goes out
  // UNSOLICITED, so keeping them on their own domain identity, their own
  // reputation and their own sending quota means a run of complaints cannot take
  // the OTP mail down with it. Sign-in email failing is an outage; a nudge email
  // failing is nothing.
  //
  // Deliberately NOT falling back to the S3_* credentials. That key has no SES
  // permission, so a fallback would turn "SES is not configured" — which the
  // sender reports clearly — into an AccessDenied at send time.
  SES_REGION: process.env.SES_REGION || "us-east-1",
  SES_ACCESS_KEY_ID: process.env.SES_ACCESS_KEY_ID || "",
  SES_SECRET_ACCESS_KEY: process.env.SES_SECRET_ACCESS_KEY || "",
  /** Must be a verified SES identity, or an address on a verified domain. */
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL || "feedback@subhsandesh.in",
  SES_FROM_NAME: process.env.SES_FROM_NAME || "SubhSandesh",
  /** Optional. Attaches bounce/complaint event tracking to every send. */
  SES_CONFIGURATION_SET: process.env.SES_CONFIGURATION_SET || "",

  // ── Inbound: replies coming BACK to feedback@subhsandesh.in ──────────────
  //
  // Outbound threading needs none of this. These two only matter for putting
  // the creator's REPLY into the panel, which requires SES Email Receiving to
  // POST it here. Unset means the webhook refuses everything, which is the
  // right default for a publicly reachable endpoint.
  //
  // SES_INBOUND_TOKEN is a shared secret that forms part of the webhook path,
  // so an unauthenticated scan cannot even reach the parser. It is checked in
  // ADDITION to the SNS signature, not instead of it.
  SES_INBOUND_TOKEN: process.env.SES_INBOUND_TOKEN || "",
  // When set, only this SNS topic is accepted. A signature proves a message
  // came from SNS; it does not prove it came from OUR topic, and anybody can
  // create a topic and sign a message with Amazon's key.
  SES_INBOUND_TOPIC_ARN: process.env.SES_INBOUND_TOPIC_ARN || "",

  // ── Inbound by IMAP ──────────────────────────────────────────────────────
  //
  // The other way replies get in, and the one that needs no DNS at all.
  //
  // `feedback@subhsandesh.in` is an ALIAS at GoDaddy that redirects into the
  // `support@subhsandesh.in` mailbox — it has no mailbox of its own. So the
  // login here is support@, and IMAP_FILTER_TO is what separates the draft
  // replies from ordinary support mail sitting in the same inbox.
  //
  // Unset means the poller never starts. That is the default.
  IMAP_HOST: process.env.IMAP_HOST || "",
  IMAP_PORT: parseInt(process.env.IMAP_PORT || "993", 10),
  IMAP_USER: process.env.IMAP_USER || "",
  IMAP_PASSWORD: process.env.IMAP_PASSWORD || "",
  IMAP_MAILBOX: process.env.IMAP_MAILBOX || "INBOX",
  /**
   * Only mail addressed to one of these is ingested, comma-separated.
   *
   * Load-bearing. Without it every support email in that shared inbox would
   * become an unmatched "conversation" in the admin panel.
   */
  IMAP_FILTER_TO: process.env.IMAP_FILTER_TO || process.env.SES_FROM_EMAIL || "feedback@subhsandesh.in",
  IMAP_POLL_SECONDS: parseInt(process.env.IMAP_POLL_SECONDS || "120", 10),

  // Razorpay (payment gateway)
  // RAZORPAY_KEY_ID   — public key, safe to expose to client
  // RAZORPAY_KEY_SECRET — private key, NEVER send to client
  RAZORPAY_KEY_ID:     process.env.RAZORPAY_KEY_ID     || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",

  // Helpers
  IS_PROD: APP_ENV === "production",
  IS_NGROK: APP_ENV === "ngrok",
} as const;

/**
 * Is this deployment the real, public site — the apex domain — as opposed to
 * staging, ngrok or a laptop?
 *
 * `IS_PROD` cannot answer that. Staging runs with `APP_ENV=production` and
 * inherits `ROOT_DOMAIN` from the same secrets, so it reports itself as
 * production too; the only thing that separates them is that production is
 * SERVED FROM the root domain and staging from a subdomain of it.
 *
 * `utils/shareUrl.ts` has needed this distinction for a while — a
 * `{user}.{ROOT_DOMAIN}` share link built on staging points at production's
 * database and 404s — and now `config/templateVisibility.ts` needs it too, to
 * hold a new template back on the public site without hiding it from the people
 * testing it on staging. One copy, here, rather than two that can disagree.
 */
export function isApexDeployment(): boolean {
  if (!env.ROOT_DOMAIN) return false;
  try {
    const host = new URL(env.SHARE_BASE_URL).hostname.toLowerCase();
    return host === env.ROOT_DOMAIN || host === `www.${env.ROOT_DOMAIN}`;
  } catch {
    return false;
  }
}
