import { Request, Response } from "express";
import { randomUUID } from "crypto";
import StoryProfile, { type IStoryProfile } from "../models/StoryProfile";
import { FILL_LIMITS } from "../config/aiFill/types";
import { distilContextSafe, type StoryInput } from "../services/storyContext.service";
import { sanitizeStory } from "../services/courtOfLoveAi.service";
import type { ApiResponse } from "../types";

// ─── The story profile ───────────────────────────────────────────────────────
//
// Every query in this file is scoped by `userId`, without exception. There is no
// "find by id" here and no admin path — the document is a person's private
// notes about their relationship, and the only correct answer to "whose profile
// is this?" is "the caller's". A handler that took an id from the URL and
// looked it up would be one typo away from serving someone else's.

/** The story as it appears in a listing: no body text, ever. */
interface StoryListItem {
  storyId: string;
  title: string;
  sourceSlug: string;
  createdAt: Date;
  updatedAt: Date;
}

const listStories = (profile: IStoryProfile): StoryListItem[] =>
  profile.stories.map((s) => ({
    storyId: s.storyId,
    title: s.title,
    sourceSlug: s.sourceSlug,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));

/** The standard profile payload. `context` is only present if it was selected. */
const profilePayload = (profile: IStoryProfile) => ({
  people: profile.people,
  stories: listStories(profile),
  context: profile.context ?? null,
  autoFillEnabled: profile.autoFillEnabled,
});

/**
 * Load the caller's profile, creating an empty one if they have never had one.
 *
 * Create-on-read rather than 404: "you have no story profile" is not an error
 * condition, it is the state every user starts in, and the form on the other
 * end wants an empty profile to render, not an error to handle.
 */
async function loadOrCreate(userId: string, select: string): Promise<IStoryProfile> {
  const existing = await StoryProfile.findOne({ userId }).select(select);
  if (existing) return existing;

  try {
    await StoryProfile.create({ userId });
  } catch {
    // `userId` is unique, so two simultaneous first-loads race here and one of
    // them loses. Losing is fine — the document it wanted now exists.
  }

  const created = await StoryProfile.findOne({ userId }).select(select);
  if (!created) throw new Error("Failed to create story profile");
  return created;
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Rebuild the distilled context from whatever stories the profile now holds,
 * and save it.
 *
 * Called after every story mutation, and always AFTER the mutation itself has
 * been saved: the model caps `stories` at MAX_STORIES in a pre-save hook, so
 * distilling before the save would summarise stories that are about to be
 * dropped. Never throws — see distilContextSafe.
 */
async function refreshContext(profile: IStoryProfile): Promise<void> {
  // Deleting the last story must clear the context rather than leave a
  // description of stories that no longer exist sitting on the document.
  if (profile.stories.length === 0) {
    profile.context = undefined;
    await profile.save();
    return;
  }

  const inputs: StoryInput[] = profile.stories.map((s) => ({
    storyId: s.storyId,
    title: s.title,
    text: s.text,
  }));

  const context = await distilContextSafe(inputs, profile.people, profile.context?.version ?? 0);
  // null means the model was unavailable. Keep the previous context: a slightly
  // stale brief is far better than none, and the next edit regenerates it.
  if (!context) return;

  profile.context = context;
  await profile.save();
}

export const getProfile = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    // `+context` only. `stories.text` stays unselected — this is the listing,
    // and it genuinely does not load anybody's story bodies.
    const profile = await loadOrCreate(userId, "+context");

    res.json({ success: true, data: profilePayload(profile) });
  } catch (error) {
    console.error("Get story profile error:", error);
    res.status(500).json({ success: false, error: "Failed to load your story profile" });
  }
};

export const updatePeople = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const profile = await loadOrCreate(userId, "");

    const body = req.body as Record<string, unknown>;

    // Accept BOTH `{userName, …}` and `{people: {userName, …}}`.
    //
    // This shipped broken and failed silently, which is the worst way for it to
    // fail. The client posts the nested form; this handler read the flat one,
    // so every name came back as "" and the handler cheerfully answered 200
    // with an empty `people` object. Nobody saw an error — the names simply
    // never saved.
    //
    // And it was not only cosmetic. These names are the list the exclusion
    // sweep must never ban: an `avoid` entry reads "Meera ke exam results ke
    // baare me mat likhna", the sweep splits it into words, and with no stored
    // names to protect, "Meera" went on the ban list and every field mentioning
    // her was dropped from the page. A silently-empty save turned into a
    // silently-blanked gift.
    const src = (body.people && typeof body.people === "object" ? body.people : body) as Record<string, unknown>;

    profile.people = {
      userName: str(src.userName, FILL_LIMITS.name),
      partnerName: str(src.partnerName, FILL_LIMITS.name),
      bestFriendName: str(src.bestFriendName, FILL_LIMITS.name),
      partnerPronouns: str(src.partnerPronouns, 32),
    };

    await profile.save();

    res.json({ success: true, data: { people: profile.people } });
  } catch (error) {
    console.error("Update story people error:", error);
    res.status(500).json({ success: false, error: "Failed to save those names" });
  }
};

export const updateSettings = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const { autoFillEnabled } = req.body as { autoFillEnabled?: unknown };

    if (typeof autoFillEnabled !== "boolean") {
      res.status(400).json({ success: false, error: "autoFillEnabled must be true or false" });
      return;
    }

    const profile = await loadOrCreate(userId, "");
    profile.autoFillEnabled = autoFillEnabled;
    await profile.save();

    res.json({ success: true, data: { autoFillEnabled: profile.autoFillEnabled } });
  } catch (error) {
    console.error("Update story settings error:", error);
    res.status(500).json({ success: false, error: "Failed to save that setting" });
  }
};

export const getStory = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // The one endpoint that asks for bodies by name.
    const profile = await StoryProfile.findOne({ userId }).select("+stories.text");
    const story = profile?.stories.find((s) => s.storyId === id);

    if (!story) {
      res.status(404).json({ success: false, error: "Story not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        storyId: story.storyId,
        title: story.title,
        text: story.text,
        sourceSlug: story.sourceSlug,
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get story error:", error);
    res.status(500).json({ success: false, error: "Failed to load that story" });
  }
};

export const addStory = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const body = req.body as Record<string, unknown>;

    const text = sanitizeStory(body.text);
    if (!text) {
      res.status(400).json({ success: false, error: "A story needs some text" });
      return;
    }

    const profile = await loadOrCreate(userId, "+stories.text +context");
    const storyId = randomUUID();

    profile.stories.push({
      storyId,
      title: str(body.title, 120),
      text,
      sourceSlug: str(body.sourceSlug, 60),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await profile.save();
    await refreshContext(profile);

    res.status(201).json({
      success: true,
      data: { storyId, ...profilePayload(profile) },
    });
  } catch (error) {
    console.error("Add story error:", error);
    res.status(500).json({ success: false, error: "Failed to save that story" });
  }
};

export const updateStory = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const profile = await StoryProfile.findOne({ userId }).select("+stories.text +context");
    const story = profile?.stories.find((s) => s.storyId === id);

    if (!profile || !story) {
      res.status(404).json({ success: false, error: "Story not found" });
      return;
    }

    if (body.title !== undefined) story.title = str(body.title, 120);
    if (body.text !== undefined) {
      const text = sanitizeStory(body.text);
      if (!text) {
        res.status(400).json({ success: false, error: "A story needs some text" });
        return;
      }
      story.text = text;
    }
    story.updatedAt = new Date();

    await profile.save();
    await refreshContext(profile);

    res.json({ success: true, data: profilePayload(profile) });
  } catch (error) {
    console.error("Update story error:", error);
    res.status(500).json({ success: false, error: "Failed to save that story" });
  }
};

export const deleteStory = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const profile = await StoryProfile.findOne({ userId }).select("+stories.text +context");
    if (!profile) {
      res.status(404).json({ success: false, error: "Story not found" });
      return;
    }

    const before = profile.stories.length;
    profile.stories = profile.stories.filter((s) => s.storyId !== id);
    if (profile.stories.length === before) {
      res.status(404).json({ success: false, error: "Story not found" });
      return;
    }

    await profile.save();
    // The deleted story's material has to leave the context too, or it goes on
    // filling pages from something the sender explicitly removed.
    await refreshContext(profile);

    res.json({ success: true, data: profilePayload(profile) });
  } catch (error) {
    console.error("Delete story error:", error);
    res.status(500).json({ success: false, error: "Failed to delete that story" });
  }
};

export const rebuildContext = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const profile = await StoryProfile.findOne({ userId }).select("+stories.text +context");

    if (!profile || profile.stories.length === 0) {
      res.status(400).json({
        success: false,
        error: "Write at least one story first — there is nothing to build from yet.",
      });
      return;
    }

    const versionBefore = profile.context?.version ?? 0;
    await refreshContext(profile);

    // This endpoint is explicitly "try again", so unlike the story mutations a
    // failure here is worth telling the sender about rather than swallowing.
    if ((profile.context?.version ?? 0) === versionBefore) {
      res.status(503).json({
        success: false,
        error: "Couldn't rebuild your story context right now. Please try again in a moment.",
      });
      return;
    }

    res.json({ success: true, data: { context: profile.context ?? null } });
  } catch (error) {
    console.error("Rebuild story context error:", error);
    res.status(500).json({ success: false, error: "Failed to rebuild your story context" });
  }
};
