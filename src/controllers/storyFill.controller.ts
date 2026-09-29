import { Request, Response } from "express";
import OpenAI from "openai";
import { getSchema as lookupSchema } from "../config/aiFill";
import { FILL_LIMITS, type WireSchema } from "../config/aiFill/types";
import StoryProfile from "../models/StoryProfile";
import type { IStoryContext, IStoryPeople } from "../models/StoryProfile";
import {
  AiRefusedError,
  AiTruncatedError,
  AiUnavailableError,
  fillFromStory,
  sanitizeStory,
  type FillHints,
  type FillPeople,
} from "../services/storyFill.service";
import type { ApiResponse } from "../types";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * The schema for one template, as the client renders it.
 *
 * Public on purpose. It is a list of field labels and writing guides for a
 * template anyone can already open in the editor — there is nothing in it that
 * is not visible from the form itself, and requiring auth here would mean a
 * logged-out sender could not even see which fields the AI is going to fill.
 */
export const getSchema = async (
  req: Request,
  res: Response<ApiResponse<WireSchema>>
): Promise<void> => {
  try {
    const slug = str(req.params.slug, 80);
    const schema = lookupSchema(slug);

    if (!schema) {
      res.status(404).json({
        success: false,
        error: `No AI fill schema is registered for the template "${slug}".`,
      });
      return;
    }

    res.json({
      success: true,
      data: { slug: schema.slug, audience: schema.audience, fields: schema.fields },
    });
  } catch (error) {
    console.error("Get fill schema error:", error);
    res.status(500).json({ success: false, error: "Failed to load the fill schema" });
  }
};

/**
 * Fill a template's form from the sender's story and/or their stored context.
 *
 * ── WHY THIS ROUTE ALLOWS ANONYMOUS CALLERS ─────────────────────────────────
 *
 * Publishing is auth-deferred in these editors: a sender builds the whole page
 * first and only logs in when they hit Publish. Filling the form is part of
 * building, so it happens before the login almost every time. Demanding a token
 * here would put a login wall in front of the feature's first impression and
 * would gate the anonymous path — the main path — behind the rarest one.
 *
 * `useContext` is therefore best-effort: honoured when there is a session to
 * read a context from, silently ignored otherwise. Never a 401.
 */
export const postFill = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const slug = str(body.slug, 80);

    const schema = lookupSchema(slug);
    if (!schema) {
      res.status(404).json({
        success: false,
        error: `No AI fill schema is registered for the template "${slug}".`,
      });
      return;
    }

    const story = sanitizeStory(body.story);

    let context: IStoryContext | null = null;
    let profilePeople: IStoryPeople | undefined;

    if (req.userId) {
      // Loaded whenever there is a session, not only when `useContext` is set:
      // the names are needed by the exclusion sweep either way, and a sender
      // who typed a story into the box still deserves their own names honoured.
      const profile = await StoryProfile.findOne({ userId: req.userId }).select("+context");
      profilePeople = profile?.people;

      // autoFillEnabled is the sender's own switch: off means nothing of theirs
      // is ever reused, so it beats whatever the client happened to ask for.
      if (body.useContext === true && profile?.autoFillEnabled && profile.context) {
        context = profile.context;
      }
    }

    // A context counts as material. This is the "their second template fills
    // itself" case: they typed their story once, weeks ago, and this time they
    // press the button without writing anything at all.
    if (!context && story.length < FILL_LIMITS.minStory) {
      res.status(400).json({
        success: false,
        error: `Tell us a little about them first — at least ${FILL_LIMITS.minStory} characters. How you met, what you call each other, anything.`,
      });
      return;
    }

    const rawPeople = (body.people ?? {}) as Record<string, unknown>;

    // Fall back to the names already on the profile.
    //
    // These are not only used to address the reader — they are the list the
    // exclusion sweep must never ban. An `avoid` entry a sender writes reads
    // like "Meera's exam results", and the sweep splits that into words, so
    // without knowing that "Meera" is the recipient it would ban her name and
    // silently drop every field that mentions her. Requiring the CLIENT to send
    // the names for that to work makes a safety property depend on a request
    // body: the auto-fill path sends whatever the sender happened to type into
    // their profile, which is often nothing at all.
    //
    // The profile is already loaded here whenever a context is in play, which
    // is exactly the case that matters, so the fallback costs nothing.
    const fallback: Partial<IStoryPeople> = profilePeople ?? {};
    const pick = (fromBody: unknown, fromProfile: string | undefined): string =>
      str(fromBody, FILL_LIMITS.name) || str(fromProfile, FILL_LIMITS.name);

    const people: FillPeople = {
      userName: pick(rawPeople.userName, fallback.userName),
      partnerName: pick(rawPeople.partnerName, fallback.partnerName),
      bestFriendName: pick(rawPeople.bestFriendName, fallback.bestFriendName),
      partnerPronouns: str(rawPeople.partnerPronouns, 32) || str(fallback.partnerPronouns, 32),
    };

    // Guided-flow answers. Optional and free text; clamped here like every
    // other string off the wire, and only the known language tags survive.
    const rawHints = (body.hints && typeof body.hints === "object" ? body.hints : {}) as Record<
      string,
      unknown
    >;
    const language = str(rawHints.language, 12);
    const hints: FillHints = {
      relation: str(rawHints.relation, 40),
      tone: str(rawHints.tone, 24),
      language: ["en", "hi-Latn", "hi"].includes(language) ? language : "",
      occasion: str(rawHints.occasion, 60),
    };

    const result = await fillFromStory({ schema, story, people, context, hints });

    res.json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof AiUnavailableError) {
      // The key is missing or misconfigured. 503, and phrased as our problem —
      // the sender can still fill the form in by hand.
      console.error("Story fill AI not configured:", error.message);
      res.status(503).json({
        success: false,
        error: "AI is not configured right now. You can still fill the form in yourself.",
      });
      return;
    }

    if (error instanceof AiRefusedError) {
      res.status(422).json({
        success: false,
        error: "The AI couldn't work with that story. Try rephrasing it, or fill the form yourself.",
      });
      return;
    }

    // The model ran long and got cut off, twice. Nothing the sender did caused
    // it and nothing they can change will fix it, so the copy says "try again"
    // rather than blaming their story — and 503 marks it retryable instead of
    // the flat 500 this used to surface as.
    if (error instanceof AiTruncatedError) {
      res.status(503).json({
        success: false,
        error: "That took longer than expected to write. Try again, or fill the form yourself.",
      });
      return;
    }

    if (error instanceof OpenAI.APIError) {
      // Note what is NOT sent back: error.message. OpenAI's auth errors quote
      // the key prefix and its 4xx bodies echo request content, and neither
      // belongs in a response to an anonymous caller.
      if (error.status === 401) {
        console.error("Story fill AI auth error — check OPENAI_API_KEY");
        res.status(503).json({
          success: false,
          error: "AI is not configured right now. You can still fill the form in yourself.",
        });
        return;
      }
      if (error.status === 429) {
        res.status(429).json({
          success: false,
          error: "The AI is busy right now. Please wait a moment and try again.",
        });
        return;
      }
    }

    console.error("Story fill error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fill the form. Please try again.",
    });
  }
};
