import { Request, Response } from "express";
import OpenAI from "openai";
import WeddingPage from "../models/WeddingPage";
import { env } from "../config/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const DEFAULT_EVENTS = [
  { name: "Haldi", hindi: "हल्दी", icon: "🌿", date: "", time: "10 AM", venue: "", accent: "from-yellow-500/20 to-yellow-600/5 border-yellow-500/30" },
  { name: "Mehendi", hindi: "मेहंदी", icon: "🌸", date: "", time: "6 PM", venue: "", accent: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30" },
  { name: "Sangeet", hindi: "संगीत", icon: "🎶", date: "", time: "7 PM", venue: "", accent: "from-violet-500/20 to-violet-600/5 border-violet-500/30" },
  { name: "Baraat", hindi: "बारात", icon: "🐴", date: "", time: "9 AM", venue: "", accent: "from-rose-500/20 to-rose-500/5 border-rose-500/30" },
  { name: "Wedding", hindi: "विवाह", icon: "🔥", date: "", time: "11 AM", venue: "", accent: "from-amber-500/20 to-amber-500/5 border-amber-500/30" },
  { name: "Reception", hindi: "स्वागत", icon: "💃", date: "", time: "7 PM", venue: "", accent: "from-blue-500/20 to-blue-500/5 border-blue-500/30" },
];

export const createWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      brideName, groomName, weddingDate, venue, blessing,
      bridePhoto, brideDescription, brideTags, brideFamilyParents, brideFamilyGrandparents,
      groomPhoto, groomDescription, groomTags, groomFamilyParents, groomFamilyGrandparents,
      events, galleryImages, password,
    } = req.body;

    const page = await WeddingPage.create({
      userId: req.userId,
      brideName: brideName || "",
      groomName: groomName || "",
      weddingDate: weddingDate || "2026-03-15T11:00:00+05:30",
      venue: venue || "India",
      blessing: blessing || "ॐ शुभ विवाह",
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
      events: events || DEFAULT_EVENTS,
      galleryImages: galleryImages || [],
      password: password || "",
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to create wedding page" });
  }
};

export const getMyWeddingPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await WeddingPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my wedding pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await WeddingPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Get wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const fields = [
      "brideName", "groomName", "weddingDate", "venue", "blessing",
      "bridePhoto", "brideDescription", "brideTags", "brideFamilyParents", "brideFamilyGrandparents",
      "groomPhoto", "groomDescription", "groomTags", "groomFamilyParents", "groomFamilyGrandparents",
      "events", "galleryImages", "password",
    ];

    const page = await WeddingPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        (page as unknown as Record<string, unknown>)[field] = req.body[field];
      }
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await WeddingPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    page.isPublished = true;
    await page.save();

    const shareUrl = `${env.APP_URL}/${page.shareId}`;
    res.json({ success: true, data: { shareId: page.shareId, shareUrl } });
  } catch (error) {
    console.error("Publish wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const deleteWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await WeddingPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, message: "Wedding page deleted successfully" });
  } catch (error) {
    console.error("Delete wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};

// ── Shaadi card OCR + AI extraction via OpenAI Vision ─────────────────────────
export const extractFromShadiCard = async (req: Request, res: Response): Promise<void> => {
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

    const systemPrompt = `You are an expert at reading Indian wedding invitation cards (Shaadi cards).
Extract all information from the provided wedding invitation image(s) and return ONLY valid JSON.
Look for: bride name, groom name, wedding date, venue/location, event dates and times, family names, and any blessings or shlokas.

RESPONSE FORMAT (return only this JSON, no extra text):
{
  "brideName": "bride first name only",
  "groomName": "groom first name only",
  "weddingDate": "ISO date string like 2026-03-15T11:00:00+05:30 or empty string if not found",
  "venue": "main venue or city",
  "blessing": "Sanskrit/Hindi blessing found on card, or ॐ शुभ विवाह if not found",
  "brideDescription": "a beautiful 1-2 sentence description for the bride based on any information",
  "groomDescription": "a beautiful 1-2 sentence description for the groom based on any information",
  "brideFamilyParents": "bride's parents' names if found, else empty string",
  "brideFamilyGrandparents": "bride's grandparents' names if found, else empty string",
  "groomFamilyParents": "groom's parents' names if found, else empty string",
  "groomFamilyGrandparents": "groom's grandparents' names if found, else empty string",
  "events": [
    { "name": "event name", "hindi": "Hindi name", "date": "date string", "time": "time", "venue": "venue" }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Please extract all wedding information from this shaadi card invitation:" },
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
    console.error("Extract from shadi card error:", error);
    res.status(500).json({ success: false, error: "Failed to extract from card. Please try again." });
  }
};

// ── Public: shared page ────────────────────────────────────────────────────────
export const getSharedWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await WeddingPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "wedding" });
  } catch (error) {
    console.error("Get shared wedding page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyWeddingPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await WeddingPage.findOne({ shareId: req.params.shareId, isPublished: true });
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
    console.error("Verify wedding page password error:", error);
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

    const page = await WeddingPage.findOne({ shareId: req.params.shareId, isPublished: true });
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
