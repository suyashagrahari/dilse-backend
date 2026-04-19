import { Request, Response } from "express";
import OpenAI from "openai";
import ChristianWeddingPage from "../models/ChristianWeddingPage";
import { env } from "../config/env";
import { transformMediaPayload, uploadAudioDataUrl } from "../services/mediaProcessor.service";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const DEFAULT_EVENTS = [
  { name: "Rehearsal Dinner", hindi: "", icon: "🍽️", date: "", time: "6 PM", venue: "", details: "", accent: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30", disabled: false },
  { name: "Ceremony", hindi: "", icon: "⛪", date: "", time: "4 PM", venue: "", details: "", accent: "from-amber-500/20 to-amber-500/5 border-amber-500/30", disabled: false },
  { name: "Reception", hindi: "", icon: "🥂", date: "", time: "7 PM", venue: "", details: "", accent: "from-blue-500/20 to-blue-500/5 border-blue-500/30", disabled: false },
  { name: "Brunch", hindi: "", icon: "☕", date: "", time: "10 AM", venue: "", details: "", accent: "from-violet-500/20 to-violet-600/5 border-violet-500/30", disabled: true },
  { name: "Reserved", hindi: "", icon: "📌", date: "", time: "", venue: "", details: "", accent: "from-slate-500/15 to-slate-600/5 border-slate-500/20", disabled: true },
  { name: "Reserved", hindi: "", icon: "📌", date: "", time: "", venue: "", details: "", accent: "from-slate-500/15 to-slate-600/5 border-slate-500/20", disabled: true },
];

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const parseTimeToMinutes = (time: string): number => {
  const cleaned = time.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hourRaw = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const ampm = match[3];
  let hour = hourRaw % 12;
  if (ampm === "PM") hour += 12;
  return hour * 60 + minutes;
};

const parseDateAndTimeToEpoch = (date: string, time: string): number => {
  const trimmedDate = date.trim();
  if (!trimmedDate) return Number.MAX_SAFE_INTEGER;

  const parts = trimmedDate.split(/\s+/);
  if (parts.length < 2) return Number.MAX_SAFE_INTEGER;
  const day = Number(parts[0]);
  const monthKey = parts[1].toLowerCase();
  const monthIdx = MONTH_MAP[monthKey];
  if (!Number.isFinite(day) || monthIdx === undefined) return Number.MAX_SAFE_INTEGER;

  const now = new Date();
  const year = now.getFullYear();
  const eventDate = new Date(year, monthIdx, day);
  eventDate.setHours(0, 0, 0, 0);
  eventDate.setMinutes(parseTimeToMinutes(time));
  return eventDate.getTime();
};

const normalizeAndSortEvents = (eventsInput: unknown) => {
  const incoming = Array.isArray(eventsInput) ? eventsInput : DEFAULT_EVENTS;
  const normalized = incoming.map((event, idx) => {
    const fallback = DEFAULT_EVENTS[idx] || DEFAULT_EVENTS[Math.min(idx, DEFAULT_EVENTS.length - 1)];
    const src = (event || {}) as Record<string, unknown>;
    return {
      name: String(src.name || fallback.name),
      hindi: String(src.hindi || fallback.hindi),
      icon: String(src.icon || fallback.icon),
      date: String(src.date || ""),
      time: String(src.time || fallback.time),
      venue: String(src.venue || ""),
      details: String(src.details || ""),
      accent: String(src.accent || fallback.accent),
      disabled: Boolean(src.disabled),
    };
  });

  return normalized.sort((a, b) => {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    const aEpoch = parseDateAndTimeToEpoch(a.date, a.time);
    const bEpoch = parseDateAndTimeToEpoch(b.date, b.time);
    if (aEpoch === bEpoch) return a.name.localeCompare(b.name);
    return aEpoch - bEpoch;
  });
};

export const createChristianWeddingPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      brideName, groomName, weddingDate, venue, blessing,
      bridePhoto, brideDescription, brideTags, brideFamilyParents, brideFamilyGrandparents,
      groomPhoto, groomDescription, groomTags, groomFamilyParents, groomFamilyGrandparents,
      events, galleryImages, password, templateVariant,
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
        events: normalizeAndSortEvents(events),
        galleryImages: galleryImages || [],
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
      "events", "galleryImages", "password", "templateVariant",
    ];

    const page = await ChristianWeddingPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    const updates = await transformMediaPayload(req.body as Record<string, unknown>, {
      template: "christian-wedding",
      userId: req.userId,
    });

    for (const field of fields) {
      if (updates[field] !== undefined) {
        if (field === "events") {
          (page as unknown as Record<string, unknown>)[field] = normalizeAndSortEvents(updates[field]);
          continue;
        }
        (page as unknown as Record<string, unknown>)[field] = updates[field];
      }
    }

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
