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
/**
 * Who prospect outreach comes from when the box sets nothing: the team, not a
 * person. Exported so the tests pin the defaults.
 */
export const PROSPECT_TEAM_DEFAULTS = {
  fromAddress: "team@subhsandesh.in",
  fromName: "SubhSandesh Team",
  signature: "Team SubhSandesh",
} as const;

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

  // ── Sign-in codes over SES ───────────────────────────────────────────────
  //
  // A sign-in code must not go out as feedback@. That address sends
  // unsolicited follow-ups, and the two kinds of mail have opposite engagement
  // profiles — mixing them means a bad run of follow-ups drags down the
  // deliverability of the one email a user is actively waiting for.
  //
  // Its own configuration set for the same reason: bounce and complaint
  // metrics for sign-in codes have to be readable on their own.
  SES_OTP_FROM_EMAIL: process.env.SES_OTP_FROM_EMAIL || "verify@subhsandesh.in",
  SES_OTP_CONFIGURATION_SET: process.env.SES_OTP_CONFIGURATION_SET || process.env.SES_CONFIGURATION_SET || "",

  // ── Billing statements (super admin → one customer, manual only) ─────────
  //
  // Sent as billing@ so a payment statement never arrives from the address
  // that sends follow-ups. billing@ has no mailbox (apex mail is GoDaddy), so
  // replies go to support@ via Reply-To. Covered by the subhsandesh.in SES
  // domain identity — no per-address verification needed.
  BILLING_FROM_EMAIL: process.env.BILLING_FROM_EMAIL || "billing@subhsandesh.in",
  BILLING_REPLY_TO_EMAIL: process.env.BILLING_REPLY_TO_EMAIL || "support@subhsandesh.in",

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
  // ── Where a creator's REPLY has to be sent ───────────────────────────────
  //
  // This is the one address in the whole pipeline that decides whether a real
  // reply is ever seen, and it is NOT the From address.
  //
  // Mail we send goes out as `feedback@subhsandesh.in`, which lives on the
  // apex domain — and the apex MX belongs to GoDaddy, because it carries all
  // company mail. So a reply addressed to feedback@ is delivered into the
  // GoDaddy `support@` mailbox and SES never sees it. The conversation view
  // then shows only our own side, exactly as if the creator had never
  // answered. That was the bug: sending worked, receiving looked wired up,
  // and the two were pointed at different mail systems.
  //
  // Reply-To is therefore the SES RECEIVING address, on the subdomain whose MX
  // is SES itself (`reply.subhsandesh.in`). A reply then goes straight to SES
  // with no GoDaddy hop, so nothing depends on a mail-forwarding rule nobody
  // can see from here — and because each deployment names its own inbox, a
  // real reply lands in the environment that sent the mail:
  //
  //   production  -> inbox@reply.subhsandesh.in    -> prod SNS topic
  //   staging     -> staging@reply.subhsandesh.in  -> dev SNS topic
  //
  // Defaults to SES_FROM_EMAIL, which is the pre-fix behaviour: wrong, but no
  // worse than it already was. An unset value must not stop mail going out.
  SES_REPLY_TO_EMAIL:
    process.env.SES_REPLY_TO_EMAIL || process.env.SES_FROM_EMAIL || "feedback@subhsandesh.in",

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

  // ── Influencer conversations (admin → one influencer, AI-drafted) ────────
  //
  // Mail to influencers goes out as its own address so a creator-programme
  // conversation never arrives from the address that sends draft nudges, and
  // so replies can land in a mailbox that only holds influencer mail. Covered
  // by the subhsandesh.in SES domain identity — no per-address verification.
  //
  // Where a REPLY goes is a separate decision, exactly as for feedback mail:
  //
  //   · INFLUENCER_REPLY_TO_EMAIL unset → replies go to INFLUENCER_FROM_EMAIL,
  //     an apex address whose MX is GoDaddy. The app sees them only if that
  //     mailbox is polled (INFLUENCER_IMAP_*) or forwards a copy to an address
  //     on the SES receiving subdomain (listed in INFLUENCER_INBOUND_ADDRESSES).
  //   · INFLUENCER_REPLY_TO_EMAIL=influencer@reply.subhsandesh.in → replies go
  //     straight to SES and the webhook, with no GoDaddy hop at all.
  //
  // See docs/influencer-mail-setup.md. Nothing here touches the apex MX.
  INFLUENCER_FROM_EMAIL: process.env.INFLUENCER_FROM_EMAIL || "influencer-support@subhsandesh.in",
  INFLUENCER_FROM_NAME: process.env.INFLUENCER_FROM_NAME || "SubhSandesh Creators",
  INFLUENCER_REPLY_TO_EMAIL: process.env.INFLUENCER_REPLY_TO_EMAIL || "",
  /**
   * Extra addresses that mean "this is influencer mail" when they appear as a
   * recipient, comma-separated — typically the SES receiving alias a GoDaddy
   * forwarding rule points at (`influencer@reply.subhsandesh.in`). The From
   * and Reply-To addresses above are always included.
   */
  INFLUENCER_INBOUND_ADDRESSES: process.env.INFLUENCER_INBOUND_ADDRESSES || "",
  /** Optional IMAP login for the influencer-support@ mailbox itself. */
  INFLUENCER_IMAP_HOST: process.env.INFLUENCER_IMAP_HOST || process.env.IMAP_HOST || "",
  INFLUENCER_IMAP_PORT: parseInt(process.env.INFLUENCER_IMAP_PORT || process.env.IMAP_PORT || "993", 10),
  INFLUENCER_IMAP_USER: process.env.INFLUENCER_IMAP_USER || "",
  INFLUENCER_IMAP_PASSWORD: process.env.INFLUENCER_IMAP_PASSWORD || "",
  INFLUENCER_IMAP_MAILBOX: process.env.INFLUENCER_IMAP_MAILBOX || "INBOX",
  /**
   * Local development only: record influencer sends as if SES accepted them,
   * without contacting any provider. Ignored whenever APP_ENV=production
   * (which includes staging), so it can never swallow a real send.
   */
  INFLUENCER_MAIL_STUB: process.env.INFLUENCER_MAIL_STUB === "1" && APP_ENV !== "production",

  // ── Prospect outreach: first emails to creators who have not joined ────────
  //
  // Classic style is sent as INFLUENCER_FROM_EMAIL under the team's name.
  // See docs/influencer-prospects.md.
  /** From display name on classic prospect mail. */
  PROSPECT_FROM_NAME: process.env.PROSPECT_FROM_NAME || PROSPECT_TEAM_DEFAULTS.fromName,
  /** Sign-off under classic prospect mail. `\n` becomes a line break. */
  PROSPECT_SIGNATURE: (process.env.PROSPECT_SIGNATURE || PROSPECT_TEAM_DEFAULTS.signature).replace(/\\n/g, "\n"),
  /** The only link a prospect email may carry. */
  PROSPECT_JOIN_URL: process.env.PROSPECT_JOIN_URL || "https://subhsandesh.in/influencer",
  /** At most this many prospect emails in any rolling 24 hours (warm-up). */
  PROSPECT_DAILY_CAP: Math.max(0, parseInt(process.env.PROSPECT_DAILY_CAP || "200", 10) || 0),
  /**
   * Instant send (the owner's choice, on by default): an email goes out the
   * moment Send is pressed, at any hour, with no gap between sends. The daily
   * cap still applies. PROSPECT_INSTANT=0 brings back the paced queue (the
   * send window and 2–6 min jitter below).
   */
  PROSPECT_INSTANT: !/^(0|false|no|off)$/i.test(process.env.PROSPECT_INSTANT || "1"),
  /**
   * Gap between two prospect sends: a random number of seconds in
   * [MIN, MAX], drawn once per send. A fixed 90 s cadence is itself a
   * machine fingerprint; 2–6 minutes of jitter reads like a person.
   */
  PROSPECT_MIN_GAP_SECONDS: Math.max(5, parseInt(process.env.PROSPECT_MIN_GAP_SECONDS || "120", 10) || 120),
  PROSPECT_MAX_GAP_SECONDS: Math.max(5, parseInt(process.env.PROSPECT_MAX_GAP_SECONDS || "360", 10) || 360),
  /**
   * Prospect mail only goes out between these hours (24h clock) in the
   * timezone below — 09:00–21:00 IST by default. Outside it, jobs wait in
   * the queue. START = END switches the window off.
   */
  PROSPECT_SEND_START_HOUR: Math.min(23, Math.max(0, Number.parseInt(process.env.PROSPECT_SEND_START_HOUR ?? "9", 10) || 0)),
  PROSPECT_SEND_END_HOUR: Math.min(24, Math.max(0, Number.parseInt(process.env.PROSPECT_SEND_END_HOUR ?? "21", 10) || 0)),
  PROSPECT_SEND_TZ_OFFSET_MINUTES: Number.parseInt(process.env.PROSPECT_SEND_TZ_OFFSET_MINUTES ?? "330", 10) || 0,

  // ── Personal / team invite mode (the default style) ──────────────────────
  //
  // A plain-text note from the team's own address, with no List-Unsubscribe
  // header and no footer — what lands in Gmail's Primary tab. The address
  // must be allowed by the SES IAM policy (ses:FromAddress); until it is, SES
  // refuses and the panel says so. It NEVER silently falls back to another
  // sender. Reply-To stays INFLUENCER_REPLY_TO_EMAIL so replies reach the app.
  // (The env names keep "PERSONAL" — the style is still the personal one;
  // only the voice is the team's.)
  PROSPECT_PERSONAL_FROM_EMAIL: (process.env.PROSPECT_PERSONAL_FROM_EMAIL || PROSPECT_TEAM_DEFAULTS.fromAddress).trim().toLowerCase(),
  PROSPECT_PERSONAL_FROM_NAME: process.env.PROSPECT_PERSONAL_FROM_NAME || PROSPECT_TEAM_DEFAULTS.fromName,
  /** Signature under personal/team mail. `\n` becomes a line break. Plain text. */
  PROSPECT_PERSONAL_SIGNATURE: (process.env.PROSPECT_PERSONAL_SIGNATURE || PROSPECT_TEAM_DEFAULTS.signature).replace(/\\n/g, "\n"),
  /**
   * "1" adds a second plain line "subhsandesh.in" under the signature. Off by
   * default: mail clients turn it into a link, and a first email carries none.
   */
  PROSPECT_SIGNATURE_SITE_LINE: ["1", "true"].includes(String(process.env.PROSPECT_SIGNATURE_SITE_LINE || "").toLowerCase()),
  /**
   * CAN-SPAM wants a postal address on commercial mail to US recipients.
   * "1" appends one plain line — "SubhSandesh, <postal address>" — to the
   * personal signature. Off by default (Primary-tab first).
   */
  PROSPECT_PERSONAL_INCLUDE_ADDRESS: ["1", "true"].includes(String(process.env.PROSPECT_PERSONAL_INCLUDE_ADDRESS || "").toLowerCase()),
  /**
   * After this many days without a reply a contacted prospect shows
   * "Follow-up due". Advice only — a follow-up can be sent any time.
   */
  PROSPECT_FOLLOWUP_DAYS: Math.max(1, parseInt(process.env.PROSPECT_FOLLOWUP_DAYS || "4", 10) || 4),
  /**
   * Public base of THIS API, for the unsubscribe link and List-Unsubscribe.
   * Unset → derived from SHARE_BASE_URL (subhsandesh.in → api.subhsandesh.in,
   * stag.subhsandesh.in → stag-api.subhsandesh.in, else localhost:PORT).
   */
  PUBLIC_API_URL: (process.env.PUBLIC_API_URL || "").replace(/\/+$/, ""),

  // Razorpay (payment gateway)
  // RAZORPAY_KEY_ID   — public key, safe to expose to client
  // RAZORPAY_KEY_SECRET — private key, NEVER send to client
  RAZORPAY_KEY_ID:     process.env.RAZORPAY_KEY_ID     || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",
  // Set in Razorpay Dashboard → Webhooks. Different from the key secret. Unset
  // = the webhook endpoint refuses everything (503) rather than trusting it.
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "",

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
