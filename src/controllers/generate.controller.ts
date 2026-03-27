import { Request, Response } from "express";
import OpenAI from "openai";
import { env } from "../config/env";
import GeneratedContent from "../models/GeneratedContent";
import type { GenerateRequest, ApiResponse, GenerateResponse } from "../types";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const TEMPLATE_PROMPTS: Record<string, string> = {
  birthday: `You are a heartfelt greeting card writer. Create a warm, emotional birthday wish.
    The tone should be loving, personal, and celebratory. Use poetic language with a touch of warmth.`,
  valentine: `You are a romantic greeting card writer. Create a deeply romantic Valentine's Day message.
    The tone should be passionate, intimate, and full of love. Use beautiful, romantic language.`,
  anniversary: `You are a sentimental greeting card writer. Create a meaningful anniversary message.
    The tone should be reflective, grateful, and deeply loving. Celebrate the journey together.`,
  sorry: `You are a compassionate greeting card writer. Create a sincere, heartfelt apology message.
    The tone should be genuine, humble, and hopeful for forgiveness. Show true remorse and care.`,
  missyou: `You are an emotional greeting card writer. Create a touching "I miss you" message.
    The tone should be tender, longing, and warm. Express how much they mean and how much they're missed.`,
  festival: `You are a vibrant Holi festival greeting card writer. Create joyful, colorful Holi wish messages in both Hindi and English.
    The tone should be warm, celebratory, and festive. Holi is the festival of colors celebrated in India.`,
  eid: `You are a heartfelt Eid Mubarak greeting card writer. Create beautiful, blessed Eid al-Fitr wish messages in both Urdu and English.
    The tone should be warm, spiritual, and celebratory. Eid al-Fitr is the Islamic festival marking the end of Ramadan.`,
  wedding: `You are a poetic Indian wedding invitation writer. Create beautiful, heartfelt wedding invitation content in Hindi and English.
    The tone should be warm, celebratory, traditional yet modern. Include Sanskrit blessings and family values.`,
  shaadi: `You are a poetic Indian wedding invitation writer. Create beautiful, heartfelt wedding invitation content in Hindi and English.
    The tone should be warm, celebratory, traditional yet modern. Include Sanskrit blessings and family values.`,
  reception: `You are an elegant Indian wedding reception invitation writer. Create beautiful, sophisticated reception invitation content.
    The tone should be warm, celebratory, and gracious. Focus on the joy of welcoming guests to celebrate the couple.`,
};

function getSystemPrompt(templateType: string): string {
  const base = TEMPLATE_PROMPTS[templateType] ||
    "You are a heartfelt greeting card writer. Create a warm, emotional message.";

  if (templateType === "festival") {
    return `${base}

IMPORTANT RESPONSE FORMAT - You MUST respond with ONLY valid JSON, no extra text:
{
  "hindiTitle": "A short festive Holi title in Hindi Devanagari script (e.g. होली है! or होली मुबारक!)",
  "englishSubtitle": "A beautiful one-line Holi blessing in English (10-15 words)",
  "homeWishMessage": "A short personal Holi wish for the home page (1-2 sentences, warm and festive)",
  "congratsMessage": "A warm family Holi greeting for the wish card (2-4 sentences, celebratory and heartfelt)",
  "heading": "Happy Holi 🎨",
  "body": "A festive Holi message (2-3 sentences)",
  "senderName": "With colorful wishes ❤️"
}`;
  }

  if (templateType === "eid") {
    return `${base}

IMPORTANT RESPONSE FORMAT - You MUST respond with ONLY valid JSON, no extra text:
{
  "urduTitle": "A short Eid greeting in Urdu Nastaliq script (e.g. عید مبارک or عید الفطر مبارک)",
  "englishSubtitle": "A beautiful one-line Eid blessing in English (10-15 words)",
  "homeWishMessage": "A short personal Eid wish for the home page (1-2 sentences, warm and heartfelt)",
  "congratsMessage": "A warm family Eid greeting for the wish card (2-4 sentences, celebratory and blessed)",
  "heading": "Eid Mubarak 🌙",
  "body": "A blessed Eid message (2-3 sentences)",
  "senderName": "With Eid blessings ❤️"
}`;
  }

  if (templateType === "wedding" || templateType === "shaadi") {
    return `${base}

IMPORTANT RESPONSE FORMAT - You MUST respond with ONLY valid JSON, no extra text:
{
  "blessing": "A Sanskrit or Hindi wedding blessing (e.g. ॐ शुभ विवाह or आशीर्वाद)",
  "brideDescription": "A poetic 1-2 sentence description of the bride (warm, beautiful, traditional)",
  "groomDescription": "A poetic 1-2 sentence description of the groom (warm, dignified, traditional)",
  "heading": "A beautiful wedding invitation heading (5-8 words with one relevant emoji)",
  "body": "A heartfelt wedding invitation message (2-3 sentences, warm and celebratory)",
  "senderName": "With love and blessings ❤️"
}`;
  }

  if (templateType === "reception") {
    return `${base}

IMPORTANT RESPONSE FORMAT - You MUST respond with ONLY valid JSON, no extra text:
{
  "tagline": "An elegant reception tagline (e.g. 'Request the pleasure of your company' or similar 5-10 words)",
  "brideDescription": "A poetic 1-2 sentence description of the bride (graceful, beautiful, warm)",
  "groomDescription": "A poetic 1-2 sentence description of the groom (charming, dignified, warm)",
  "venueTimings": "Suggested reception timing like '7:00 PM — 11:30 PM'",
  "heading": "A beautiful reception invitation heading (5-8 words with one relevant emoji)",
  "body": "A heartfelt reception invitation message (2-3 sentences, warm and celebratory)",
  "senderName": "With love and joy ❤️"
}`;
  }

  if (templateType === "love" || templateType === "love-gf" || templateType === "darling") {
    return `${base}

IMPORTANT RESPONSE FORMAT - You MUST respond with ONLY valid JSON, no extra text:
{
  "personalMessage": "A deeply heartfelt love letter (4-6 sentences, poetic, personal, NO emojis in body text)",
  "wishMessage": "A tender wish card message (2-3 sentences, warm and intimate, NO emojis in body)",
  "photoLetters": [
    "A romantic 1-2 sentence caption for their first photo together (intimate, present-tense)",
    "A romantic 1-2 sentence caption for their second photo (nostalgic, tender)",
    "A romantic 1-2 sentence caption for their third photo (playful yet loving)",
    "A romantic 1-2 sentence caption for their fourth photo (dreamy, forward-looking)"
  ],
  "quizQuestions": [
    { "question": "A fun couple-specific trivia question about them", "options": ["opt1", "opt2", "opt3", "opt4"], "correct": 0 },
    { "question": "A sweet question about their relationship moments", "options": ["opt1", "opt2", "opt3", "opt4"], "correct": 1 },
    { "question": "A romantic question about their preferences", "options": ["opt1", "opt2", "opt3", "opt4"], "correct": 2 },
    { "question": "A playful question about their inside jokes or habits", "options": ["opt1", "opt2", "opt3", "opt4"], "correct": 0 },
    { "question": "A dreamy question about their future together", "options": ["opt1", "opt2", "opt3", "opt4"], "correct": 1 }
  ],
  "truthQuestions": ["A personal truth question based on their story", "Another truth question", "A third truth question"],
  "dareQuestions": ["A fun dare based on their relationship", "Another romantic dare", "A third dare"],
  "heading": "A romantic heading (5-8 words with one heart emoji)",
  "body": "The main love message (3-5 sentences, heartfelt)",
  "senderName": "A warm sign-off (2-4 words with one heart emoji)"
}`;
  }

  return `${base}

IMPORTANT RESPONSE FORMAT - You MUST respond with ONLY valid JSON, no extra text:
{
  "heading": "A short, catchy heading (5-10 words max, include one relevant emoji at the end)",
  "body": "The main message body (3-5 sentences, heartfelt and personal, NO emojis in body)",
  "senderName": "A warm sign-off (2-4 words with one heart emoji)"
}`;
}

export const generateContent = async (
  req: Request<{}, {}, GenerateRequest>,
  res: Response<ApiResponse<GenerateResponse>>
): Promise<void> => {
  try {
    const { prompt, templateId, templateType } = req.body;

    if (!prompt || !templateType) {
      res.status(400).json({
        success: false,
        error: "prompt and templateType are required",
      });
      return;
    }

    if (!env.OPENAI_API_KEY) {
      res.status(500).json({
        success: false,
        error: "OpenAI API key is not configured",
      });
      return;
    }

    const systemPrompt = getSystemPrompt(templateType);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Create a ${templateType} greeting based on this description from the user: "${prompt}"`,
        },
      ],
      temperature: 0.8,
      max_tokens: (templateType === "love" || templateType === "love-gf" || templateType === "darling") ? 2000 : 500,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      res.status(500).json({
        success: false,
        error: "No response from AI. Please try again.",
      });
      return;
    }

    let parsed: GenerateResponse;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(500).json({
        success: false,
        error: "Failed to parse AI response. Please try again.",
      });
      return;
    }

    const result: GenerateResponse = {
      heading: parsed.heading || "A Special Wish For You ✨",
      body: parsed.body || prompt,
      senderName: parsed.senderName || "With Love ❤️",
      // Pass through template-specific fields if present
      ...(parsed.hindiTitle && { hindiTitle: parsed.hindiTitle }),
      ...(parsed.urduTitle && { urduTitle: parsed.urduTitle }),
      ...(parsed.englishSubtitle && { englishSubtitle: parsed.englishSubtitle }),
      ...(parsed.homeWishMessage && { homeWishMessage: parsed.homeWishMessage }),
      ...(parsed.congratsMessage && { congratsMessage: parsed.congratsMessage }),
      // Wedding-specific
      ...(parsed.blessing && { blessing: parsed.blessing }),
      ...(parsed.brideDescription && { brideDescription: parsed.brideDescription }),
      ...(parsed.groomDescription && { groomDescription: parsed.groomDescription }),
      // Reception-specific
      ...(parsed.tagline && { tagline: parsed.tagline }),
      ...(parsed.venueTimings && { venueTimings: parsed.venueTimings }),
      // Love-GF specific
      ...(parsed.personalMessage && { personalMessage: parsed.personalMessage }),
      ...(parsed.wishMessage && { wishMessage: parsed.wishMessage }),
      ...(parsed.photoLetters && { photoLetters: parsed.photoLetters }),
      ...(parsed.quizQuestions && { quizQuestions: parsed.quizQuestions }),
      ...(parsed.truthQuestions && { truthQuestions: parsed.truthQuestions }),
      ...(parsed.dareQuestions && { dareQuestions: parsed.dareQuestions }),
    };

    await GeneratedContent.create({
      templateSlug: templateId,
      prompt,
      heading: result.heading,
      body: result.body,
      senderName: result.senderName,
      templateType,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    console.error("Generate content error:", error);

    const isRateLimit =
      error instanceof OpenAI.APIError && error.status === 429;
    const isAuthError =
      error instanceof OpenAI.APIError && error.status === 401;

    if (isAuthError) {
      res.status(401).json({
        success: false,
        error: "Invalid OpenAI API key. Please check server configuration.",
      });
      return;
    }

    if (isRateLimit) {
      res.status(429).json({
        success: false,
        error: "AI rate limit reached. Please wait a moment and try again.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Failed to generate content. Please try again.",
    });
  }
};

export const getGeneratedHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;

    const history = await GeneratedContent.find({ templateSlug: slug })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("-__v");

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("Get history error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch history",
    });
  }
};
