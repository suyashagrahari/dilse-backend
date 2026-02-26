import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import routes from "./routes";
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
      if (env.CLIENT_URLS.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
  })
);

// ── Body parsers ───────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

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
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.IS_PROD ? 100 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.IS_PROD ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
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
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter, routes);

// ── 404 + global error handler ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
