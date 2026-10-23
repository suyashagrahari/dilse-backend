import { Request, Response } from "express";
import OpenAI from "openai";
import ChristianWeddingPage from "../models/ChristianWeddingPage";
import { env } from "../config/env";
import { transformMediaPayload, uploadAudioDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";
import { CW_EXTRA_KEYS, cleanChristianExtras, cleanGallery, normalizeChristianEvents } from "../config/christianWedding";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/**
 * The rebuild's fields, cleaned (config/christianWedding.ts). Only the keys the
 * body actually carries: christian-wedding-2's older editor never sends them,
 * so its saves leave them exactly as they were.
 */
const extrasFrom = (body: Record<string, unknown>) => cleanChristianExtras(body);

export const createChristianWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      brideName, groomName, weddingDate, venue, blessing,
      bridePhoto, brideDescription, brideTags, brideFamilyParents, brideFamilyGrandparents,
      groomPhoto, groomDescription, groomTags, groomFamilyParents, groomFamilyGrandparents,
      events, galleryImages, sharePhoto, password, templateVariant,
    } = req.body;

    const payload = await transformMediaPayload(
      {
        brideName: brideName || "",
        groomName: groomName || "",
        weddingDate: weddingDate || "2026-07-22T19:00:00+00:00",
        venue: venue || "",
        blessing: blessing || "God bless this union",
        bridePhoto: bridePhoto || "",
        brideDescription: brideDescription || "",
        brideTags: brideTags || [],
        brideFamilyParents: brideFamilyParents || "",
        brideFamilyGrandparents: brideFamilyGrandparents || "",
        groomPhoto: groomPhoto || "",
        groomDescription: groomDescription || "",
        groomTags: groomTags || [],
        groomFamilyParents: groomFamilyParents || "",
        groomFamilyGrandparents: groomFamilyGrandparents || "",
        events: normalizeChristianEvents(events),
        galleryImages: cleanGallery(galleryImages),
        ...extrasFrom(req.body as Record<string, unknown>),
        sharePhoto: sharePhoto || "",
        password: password || "",
      },
      { template: "christian-wedding", userId: req.userId }
    );

    const page = await ChristianWeddingPage.create({
      userId: req.userId,
      ...payload,
      templateVariant: templateVariant === "scroll" ? "scroll" : "tabs",
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create Christian wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to create wedding page" });
  }
};

export const getMyChristianWeddingPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await ChristianWeddingPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my Christian wedding pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getChristianWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ChristianWeddingPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Get Christian wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateChristianWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const fields = [
      "brideName", "groomName", "weddingDate", "venue", "blessing",
      "bridePhoto", "brideDescription", "brideTags", "brideFamilyParents", "brideFamilyGrandparents",
      "groomPhoto", "groomDescription", "groomTags", "groomFamilyParents", "groomFamilyGrandparents",
      "events", "galleryImages", "sharePhoto",  "templateVariant",
      ...CW_EXTRA_KEYS,
    ];

    const page = await ChristianWeddingPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    // The rebuild's extras are cleaned BEFORE the media pass (a data: photo
    // survives cleaning and is then uploaded); the old fields go through as before.
    const updates = await transformMediaPayload({ ...body, ...extrasFrom(body) } as Record<string, unknown>, {
      template: "christian-wedding",
      userId: req.userId,
    });

    for (const field of fields) {
      if (updates[field] !== undefined) {
        if (field === "events") {
          (page as unknown as Record<string, unknown>)[field] = normalizeChristianEvents(updates[field]);
          continue;
        }
        if (field === "galleryImages") {
          (page as unknown as Record<string, unknown>)[field] = cleanGallery(updates[field]);
          continue;
        }
        if (field === "templateVariant") {
          if (updates[field] === "tabs" || updates[field] === "scroll") page.templateVariant = updates[field] as "tabs" | "scroll";
          continue;
        }
        (page as unknown as Record<string, unknown>)[field] = updates[field];
      }
    }

    // Never through the loop: an empty value there would silently remove
    // the gate on an ordinary edit. See services/pagePassword.
    applyPagePassword(page, updates.password);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update Christian wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishChristianWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ChristianWeddingPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    // ── Payment gate ─────────────────────────────────────────────────────────
    const gate = await checkPublishAccess({ req,
      userId:             String(req.userId),
      templateType:       "christian-wedding",
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
    console.error("Publish Christian wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const deleteChristianWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ChristianWeddingPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, message: "Christian wedding page deleted successfully" });
  } catch (error) {
    console.error("Delete Christian wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};

// ── Wedding invitation OCR + AI extraction via OpenAI Vision ─────────────────
export const extractFromWeddingInvitationCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { images } = req.body as { images: string[] }; // array of base64 data URLs

    if (!images || images.length === 0) {
      res.status(400).json({ success: false, error: "At least one image is required" });
      return;
    }

    if (!env.OPENAI_API_KEY) {
      res.status(500).json({ success: false, error: "OpenAI not configured" });
      return;
    }

    // Build vision message content
    const imageContents: OpenAI.Chat.ChatCompletionContentPart[] = images.slice(0, 3).map((img) => ({
      type: "image_url" as const,
      image_url: { url: img, detail: "high" as const },
    }));

    const systemPrompt = `You are an expert at reading Western and Christian wedding invitations.
Extract all information from the provided wedding invitation image(s) and return ONLY valid JSON.
Look for: bride name, groom name, wedding date, venue/location, event dates and times, family names, and any short blessing or verse.

RESPONSE FORMAT (return only this JSON, no extra text):
{
  "brideName": "bride first name only",
  "groomName": "groom first name only",
  "weddingDate": "ISO date string like 2026-07-22T19:00:00+00:00 or empty string if not found",
  "venue": "main venue or city",
  "blessing": "short blessing or verse in English if found, else God bless this union",
  "brideDescription": "a beautiful 1-2 sentence description for the bride based on any information",
  "groomDescription": "a beautiful 1-2 sentence description for the groom based on any information",
  "brideFamilyParents": "bride's parents' names if found, else empty string",
  "brideFamilyGrandparents": "bride's grandparents' names if found, else empty string",
  "groomFamilyParents": "groom's parents' names if found, else empty string",
  "groomFamilyGrandparents": "groom's grandparents' names if found, else empty string",
  "events": [
    { "name": "event name", "hindi": "optional secondary label or empty", "date": "date string", "time": "time", "venue": "venue", "details": "optional longer notes for guests if on card, else empty string" }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Please extract all wedding information from this invitation:" },
            ...imageContents,
          ],
        },
      ],
      max_tokens: 1000,
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
    console.error("Extract from wedding invitation error:", error);
    res.status(500).json({ success: false, error: "Failed to extract from card. Please try again." });
  }
};

// ── Public: shared page ────────────────────────────────────────────────────────
export const getSharedChristianWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ChristianWeddingPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({
      success: true,
      data: safeData,
      hasPassword: !!page.password,
      templateType: "christian-wedding",
      templateVariant: (page as unknown as { templateVariant?: string }).templateVariant || "tabs",
    });
  } catch (error) {
    console.error("Get shared Christian wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyChristianWeddingPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await ChristianWeddingPage.findOne({ shareId: req.params.shareId, isPublished: true });
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
    console.error("Verify Christian wedding page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

// ── Public: Blessings wall ─────────────────────────────────────────────────────
export const addChristianWeddingBlessing = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, message, voiceDataUrl } = req.body as {
      name?: string;
      message?: string;
      voiceDataUrl?: string;
    };

    if (!name?.trim()) {
      res.status(400).json({ success: false, error: "Name is required" });
      return;
    }

    const msg = typeof message === "string" ? message.trim() : "";
    let voiceUrl = "";

    const page = await ChristianWeddingPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    if (voiceDataUrl && typeof voiceDataUrl === "string" && voiceDataUrl.startsWith("data:audio/")) {
      try {
        const uploaded = await uploadAudioDataUrl(
          voiceDataUrl,
          `christian-wedding/blessings/${req.params.shareId}/${Date.now()}`
        );
        voiceUrl = uploaded.url;
      } catch (e) {
        console.error("Blessing voice upload:", e);
        res.status(400).json({ success: false, error: "Could not upload voice note. Try a smaller file or MP3." });
        return;
      }
    }

    if (!msg && !voiceUrl) {
      res.status(400).json({ success: false, error: "Add a written message or upload / record a voice note" });
      return;
    }

    page.blessings.push({
      name: name.trim(),
      message: msg,
      ...(voiceUrl ? { voiceUrl } : {}),
      createdAt: new Date(),
    });
    if (page.blessings.length > 100) page.blessings = page.blessings.slice(-100);
    await page.save();

    res.json({ success: true, data: page.blessings });
  } catch (error) {
    console.error("Add blessing error:", error);
    res.status(500).json({ success: false, error: "Failed to add blessing" });
  }
};
