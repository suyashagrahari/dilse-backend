import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env, isApexDeployment } from "./config/env";
import routes from "./routes";
import webhookRoutes from "./routes/webhooks.routes";
import { notFound, errorHandler } from "./middleware/errorHandler";

const app = express();

// ── Trust proxy (required for accurate IP behind Vercel/ngrok/Heroku) ─────
app.set("trust proxy", 1);

// ── Disable X-Powered-By (don't advertise the stack) ──────────────────────
app.disable("x-powered-by");

// ── Gzip/Brotli compression ────────────────────────────────────────────────
// Must be placed BEFORE routes so every response gets compressed.
// Skips already-compressed formats (images, video, zip, etc.)
app.use(
  compression({
    // Level 6: best balance of CPU cost vs compression ratio
    level: 6,
    // Only compress responses larger than 1 KB (pointless for tiny payloads)
    threshold: 1024,
    // Skip compression for responses that are already compressed by content-type
    filter: (req, res) => {
      const contentType = res.getHeader("Content-Type") as string | undefined;
      if (contentType) {
        // Don't re-compress already compressed formats
        if (
          /image\/(png|jpe?g|webp|avif|gif|svg)/i.test(contentType) ||
          /video\//i.test(contentType) ||
          /audio\//i.test(contentType) ||
          /(zip|gzip|br|brotli|compress)/i.test(contentType)
        ) {
          return false;
        }
      }
      // Use default filter for everything else (compresses JSON, HTML, text, etc.)
      return compression.filter(req, res);
    },
  })
);

// ── Security headers (helmet) ──────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // needed for Google OAuth to work
    contentSecurityPolicy: env.IS_PROD
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", ...env.CLIENT_URLS],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
          },
        }
      : false,
  })
);

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (!env.IS_PROD) return callback(null, true);
      // Exact match (e.g. https://subhsandesh.in or https://klyro.digital)
      if (env.CLIENT_URLS.includes(origin)) return callback(null, true);
      // Wildcard subdomain match: any *.subhsandesh.in or *.klyro.digital
      if (env.ROOT_DOMAIN && origin.endsWith(`.${env.ROOT_DOMAIN}`)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    // X-Debug-Country: honoured only for a super admin (pricingQuote.service),
    // so the USD checkout can be tested from India. Ignored for everyone else.
    allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning", "X-Debug-Country", "X-Page-Password", "X-Rsvp-Token"],
  })
);

// ── Body parsers ───────────────────────────────────────────────────────────
app.use(cookieParser());
// ── WHY 40MB ────────────────────────────────────────────────────────────────
// A page is saved as one JSON document with its media inline as base64, which
// costs a third more than the bytes themselves: the 20MB audio ceiling in
// mediaProcessor needs ~27MB of room, before a single photo is counted. At 15MB
// a long voice note was rejected as a bare 413 with no CORS headers, which the
// browser reports as a network failure — so the editor said "check your
// connection" for a file that was simply too big to describe.
//
// nginx caps the request first (`client_max_body_size` in nginx/backend.conf).
// Raising this alone changes nothing until the box is raised to match.
app.use(
  express.json({
    limit: "40mb",
    // The Razorpay webhook is signed over the exact bytes sent; re-serialising
    // the parsed JSON would change them. Keep the raw buffer for that one path
    // only, so 40 MB page saves are not held in memory twice.
    verify: (req, _res, buf) => {
      if ((req as { url?: string }).url?.toLowerCase().startsWith("/api/webhooks/razorpay")) {
        (req as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "40mb" }));

// ── HTTP request logging ───────────────────────────────────────────────────
if (!env.IS_PROD) {
  app.use(morgan("dev"));
} else {
  // Production: log only errors (4xx/5xx) to keep log volume low
  app.use(
    morgan("combined", {
      skip: (req, res) => res.statusCode < 400,
    })
  );
}

// ── Cache-Control middleware ───────────────────────────────────────────────
// Tells clients/CDNs how long to cache GET responses.
// Prevents stale data from sitting in caches for too long.
app.use((req, res, next) => {
  if (req.method === "GET") {
    // Public read-only data (template listings, share pages): cache 1 minute
    // Auth-required data: no cache (private)
    const isPublic =
      req.path.startsWith("/api/templates") ||
      req.path.startsWith("/api/pages/");

    if (isPublic) {
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
  } else {
    // Mutations must never be cached
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// ── Rate limiters ──────────────────────────────────────────────────────────
// The subdomain picker checks a name on every pause in typing, and many Indian
// users share one public IP (mobile CGNAT), so it has its own per-account
// limiter below instead of spending this shared per-IP budget.
const isSubdomainPicker = (path: string) => path.startsWith("/auth/subdomain");

// Only the public site gets the tight budget. Staging also runs with
// APP_ENV=production, but its traffic is a handful of reviewers — often behind
// one office IP, clicking through the admin panels — and 100 calls per 15
// minutes locked them out of the admin with "Too many requests".
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isApexDeployment() ? 100 : 3000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isSubdomainPicker(req.path),
  message: { success: false, error: "Too many requests, please try again later." },
});

// Brute-force protection for the endpoints that take a credential or send a
// code — and ONLY those. It used to cover all of /api/auth, so /auth/me and
// /auth/refresh on ordinary page loads spent the same 20-per-15-minutes budget,
// and the subdomain picker's availability checks then came back 429 — which
// the picker showed as "already taken" for every name anyone typed.
const CREDENTIAL_PATHS = new Set(["/register", "/login", "/google", "/verify-otp", "/resend-otp", "/password"]);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.IS_PROD ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !CREDENTIAL_PATHS.has(req.path),
  message: { success: false, error: "Too many login attempts. Please wait before trying again." },
});

const generateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many AI generation requests. Please wait a moment." },
});

app.use("/api/generate", generateLimiter);
// Court of Love writes a whole case file from the sender's story — same cost
// profile as /api/generate, so it gets the same per-minute cap.
app.use("/api/court-of-love-pages/generate", generateLimiter);
app.use("/api/auth", authLimiter);

// Per signed-in account (every picker route is behind `protect`, so an
// unauthenticated caller only ever gets a 401): generous enough for someone
// typing and retyping names, tight enough to stop anyone enumerating them.
const subdomainLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.headers.authorization || "anonymous"),
  message: { success: false, error: "You're checking names very fast — give it a few seconds." },
});
app.use("/api/auth/subdomain", subdomainLimiter);

// ── Public webhooks, ahead of the API rate limiter ─────────────────────────
//
// Mounted before `apiLimiter` on purpose. SNS retries anything it does not get
// a 200 for, backing off over hours, so a burst of arriving mail that tripped a
// 100-per-15-minutes cap would be redelivered indefinitely rather than dropped.
//
// It is not unprotected by being outside the limiter: the route authenticates
// with a path secret, an Amazon SNS signature and a topic-ARN check, and with
// no SES_INBOUND_TOKEN set it answers 404 to everything.
app.use("/api/webhooks", webhookRoutes);

app.use("/api", apiLimiter, routes);

// ── 404 + global error handler ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
