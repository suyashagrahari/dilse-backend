import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export const notFound = (req: Request, res: Response, _next: NextFunction) => {
  // Don't expose route paths in production (information disclosure)
  const message = env.IS_PROD
    ? "Resource not found"
    : `Route not found: ${req.method} ${req.originalUrl}`;

  res.status(404).json({ success: false, error: message });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Always log server-side for debugging
  console.error("[ErrorHandler]", err.name, err.message);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    res.status(400).json({ success: false, error: "Invalid ID format" });
    return;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    res.status(401).json({ success: false, error: "Invalid token" });
    return;
  }

  if (err.name === "TokenExpiredError") {
    res.status(401).json({ success: false, error: "Token expired" });
    return;
  }

  // Generic — hide details in production
  res.status(500).json({
    success: false,
    error: env.IS_PROD ? "Internal server error" : err.message,
  });
};
