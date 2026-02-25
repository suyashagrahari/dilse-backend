import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import routes from "./routes";
import { notFound, errorHandler } from "./middleware/errorHandler";

const app = express();

app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      // In development allow everything
      if (env.NODE_ENV === "development") return callback(null, true);

      // In production allow only listed origins
      if (env.CLIENT_URLS.includes(origin)) return callback(null, true);

      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

if (env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
});

const generateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: "Too many AI generation requests. Please wait a moment.",
  },
});

app.use("/api/generate", generateLimiter);
app.use("/api", apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
