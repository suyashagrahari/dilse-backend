import { Request, Response, NextFunction } from "express";

export const notFound = (req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Error:", err.message);

  if (err.name === "ValidationError") {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  if (err.name === "CastError") {
    res.status(400).json({
      success: false,
      error: "Invalid ID format",
    });
    return;
  }

  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
};
