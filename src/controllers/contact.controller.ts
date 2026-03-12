import { Request, Response } from "express";
import ContactInquiry from "../models/ContactInquiry";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const createContactInquiry = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const phone = String(req.body?.phone ?? "").trim();
    const message = String(req.body?.message ?? "").trim();

    if (!name || !email || !message) {
      res.status(400).json({
        success: false,
        error: "Name, email, and message are required",
      });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({
        success: false,
        error: "Please enter a valid email address",
      });
      return;
    }

    if (name.length < 2 || message.length < 10) {
      res.status(400).json({
        success: false,
        error: "Please provide a complete name and meaningful message",
      });
      return;
    }

    const inquiry = await ContactInquiry.create({
      name,
      email,
      phone,
      message,
      ipAddress: req.ip || "",
      userAgent: String(req.headers["user-agent"] || ""),
    });

    res.status(201).json({
      success: true,
      message: "Thanks for contacting us. We will get back to you soon.",
      data: { id: inquiry._id },
    });
  } catch (error) {
    console.error("Create contact inquiry error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to submit contact request",
    });
  }
};
