import { Request, Response } from "express";
import OpenAI from "openai";
import ReceptionPage from "../models/ReceptionPage";
import { env } from "../config/env";
import { transformMediaPayload } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";
import {
  RECEPTION_EXTRA_FIELDS,
  sanitizeReceptionExtras,
  sanitizeReceptionGallery,
  sanitizeReceptionPerson,
} from "../config/receptionPage";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export const createReceptionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      brideName, groomName, receptionDate, venue, venueAddress, venueMapQuery, venueTimings,
      tagline, heroImage, bride, groom, families, galleryImages, sharePhoto, password,
    } = req.body;

    const payload = await transformMediaPayload(
      {
        brideName: brideName || "",
        groomName: groomName || "",
        receptionDate: receptionDate || "2026-03-15T19:00:00+05:30",
        venue: venue || "",
        venueAddress: venueAddress || "",
        venueMapQuery: venueMapQuery || "",
        venueTimings: venueTimings || "7:00 PM — 11:30 PM",
        tagline: tagline || "Request the pleasure of your company",
        heroImage: heroImage || "/assets/Reception/reception.png",
        bride: sanitizeReceptionPerson(bride) || { name: "", role: "The Bride", description: "", photo: "", tags: [] },
        groom: sanitizeReceptionPerson(groom) || { name: "", role: "The Groom", description: "", photo: "", tags: [] },
        families: families || { bride: "", groom: "" },
        galleryImages: sanitizeReceptionGallery(galleryImages) || [],
        sharePhoto: sharePhoto || "",
        password: password || "",
        // The light ballroom rebuild's fields (events, story, music…). Absent = the model's defaults.
        ...sanitizeReceptionExtras(req.body),
      },
      { template: "reception", userId: req.userId }
    );

    const page = await ReceptionPage.create({
      userId: req.userId,
      ...payload,
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create reception page error:", error);
    res.status(500).json({ success: false, error: "Failed to create reception page" });
  }
};

export const getMyReceptionPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await ReceptionPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my reception pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getReceptionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ReceptionPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Get reception page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateReceptionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const fields = [
      "brideName", "groomName", "receptionDate", "venue", "venueAddress", "venueMapQuery",
      "venueTimings", "tagline", "heroImage", "bride", "groom", "families", "galleryImages", "sharePhoto",
      ...RECEPTION_EXTRA_FIELDS,
    ];

    const page = await ReceptionPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    // Coerce + clamp first (only keys the body carries), then upload any inline photos.
    const raw: Record<string, unknown> = { ...(req.body as Record<string, unknown>) };
    for (const k of RECEPTION_EXTRA_FIELDS) delete raw[k];
    Object.assign(raw, sanitizeReceptionExtras(req.body));
    if (raw.bride !== undefined) raw.bride = sanitizeReceptionPerson(raw.bride);
    if (raw.groom !== undefined) raw.groom = sanitizeReceptionPerson(raw.groom);
    if (raw.galleryImages !== undefined) raw.galleryImages = sanitizeReceptionGallery(raw.galleryImages);
    const updates = await transformMediaPayload(raw, {
      template: "reception",
      userId: req.userId,
    });

    for (const field of fields) {
      if (updates[field] !== undefined) {
        (page as unknown as Record<string, unknown>)[field] = updates[field];
      }
    }

    // Never through the loop: an empty value there would silently remove
    // the gate on an ordinary edit. See services/pagePassword.
    applyPagePassword(page, updates.password);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update reception page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishReceptionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ReceptionPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    // ── Payment gate ─────────────────────────────────────────────────────────
    const gate = await checkPublishAccess({ req,
      userId:             String(req.userId),
      templateType:       "reception",
      pageId:             String(page._id),
      isAlreadyPublished: !!page.isPublished,
    });

    if (!gate.allowed) {
      res.status(gate.httpStatus).json({
        success:  false,
        error:    gate.error,
        pricing:  gate.pricing,
      });
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    page.isPublished = true;
    await page.save();

    const { buildShareUrl } = await import("../utils/shareUrl");
    const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    res.json({ success: true, data: { shareId: page.shareId, shareUrl } });
  } catch (error) {
    console.error("Publish reception page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const deleteReceptionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ReceptionPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, message: "Reception page deleted successfully" });
  } catch (error) {
    console.error("Delete reception page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};

// ── Reception card OCR + AI extraction via OpenAI Vision ──────────────────────
export const extractFromReceptionCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { images } = req.body as { images: string[] };

    if (!images || images.length === 0) {
      res.status(400).json({ success: false, error: "At least one image is required" });
      return;
    }

    if (!env.OPENAI_API_KEY) {
      res.status(500).json({ success: false, error: "OpenAI not configured" });
      return;
    }

    const imageContents: OpenAI.Chat.ChatCompletionContentPart[] = images.slice(0, 3).map((img) => ({
      type: "image_url" as const,
      image_url: { url: img, detail: "high" as const },
    }));

    const systemPrompt = `You are an expert at reading Indian wedding reception invitation cards.
Extract all information from the provided reception invitation image(s) and return ONLY valid JSON.
Look for: bride name, groom name, reception date & time, venue name, venue address, timings, tagline, and family names.

RESPONSE FORMAT (return only this JSON, no extra text):
{
  "brideName": "bride first name only",
  "groomName": "groom first name only",
  "receptionDate": "ISO date string like 2026-03-15T19:00:00+05:30 or empty string if not found",
  "venue": "venue/hall name",
  "venueAddress": "full venue address including city and state",
  "venueMapQuery": "venue name + city formatted for Google Maps, use + for spaces",
  "venueTimings": "timing like 7:00 PM — 11:30 PM or empty string",
  "tagline": "invitation tagline found on card, or 'Request the pleasure of your company'",
  "brideDescription": "a beautiful 1-2 sentence poetic description of the bride",
  "groomDescription": "a beautiful 1-2 sentence poetic description of the groom",
  "familyBride": "bride's parents' names if found, else empty string",
  "familyGroom": "groom's parents' names if found, else empty string"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Please extract all reception details from this invitation card:" },
            ...imageContents,
          ],
        },
      ],
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ success: false, error: "No response from AI" });
      return;
    }

    const extracted = JSON.parse(content);
    res.json({ success: true, data: extracted });
  } catch (error) {
    console.error("Extract from reception card error:", error);
    res.status(500).json({ success: false, error: "Failed to extract from card. Please try again." });
  }
};

// ── Public: shared page ────────────────────────────────────────────────────────
export const getSharedReceptionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ReceptionPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "reception" });
  } catch (error) {
    console.error("Get shared reception page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyReceptionPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await ReceptionPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    if (!page.password) {
      res.json({ success: true, verified: true });
      return;
    }
    const match = await page.comparePassword(password || "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify reception page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

// ── Public: Blessings wall ─────────────────────────────────────────────────────
export const addBlessing = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, message } = req.body;
    if (!name?.trim() || !message?.trim()) {
      res.status(400).json({ success: false, error: "Name and message are required" });
      return;
    }

    const page = await ReceptionPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    page.blessings.push({ name: name.trim(), message: message.trim(), createdAt: new Date() });
    if (page.blessings.length > 100) page.blessings = page.blessings.slice(-100);
    await page.save();

    res.json({ success: true, data: page.blessings });
  } catch (error) {
    console.error("Add blessing error:", error);
    res.status(500).json({ success: false, error: "Failed to add blessing" });
  }
};
