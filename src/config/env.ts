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

  // Helpers
  IS_PROD: APP_ENV === "production",
  IS_NGROK: APP_ENV === "ngrok",
} as const;
