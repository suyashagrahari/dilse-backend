import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import { FILL_LIMITS } from "../config/aiFill/types";

// ─── The story profile ───────────────────────────────────────────────────────
//
// LEAD-OWNED AND FROZEN.
//
// One document per user. It holds the stories they have written about their
// relationship and an AI-distilled `context` derived from all of them, so that
// the second template they make is already filled in before they type anything.
//
// ── THIS IS THE MOST SENSITIVE DOCUMENT IN THE DATABASE ──────────────────────
//
// Everything else we store is written to be shown to someone. This is not: it
// is the raw material — how they met, what they fight about, what they call
// each other in private — written once and reused silently. Three consequences,
// all enforced here rather than left to the controllers:
//
//   1. `userId` is required and unique. There is no anonymous story profile,
//      because there would be no way to say whose it is.
//   2. Nothing in here is ever projected onto a share route. There is no
//      `shareId`, no `isPublished`, no view counter — the fields that would let
//      this document leak do not exist on it, which is a stronger guarantee
//      than remembering to strip them.
//   3. `stories[].text` and the whole `context` sub-document are `select: false`.
//      A query that wants them has to ask by name. The listing endpoint shows
//      titles and dates and genuinely does not load the bodies.

export interface IStoryEntry {
  /** Stable id so the client can edit and delete a specific story. */
  storyId: string;
  title: string;
  text: string;
  /** Template the story was first written in, for "you wrote this while making X". */
  sourceSlug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoryContext {
  /** A few paragraphs, in the sender's own language, distilled from every story. */
  summary: string;
  /** BCP-47-ish tag the model reports writing in. Hinglish comes back as `hi-Latn`. */
  language: string;
  languageName: string;
  /** "warm and teasing", "quiet and sincere" — reused so templates sound alike. */
  tone: string;
  facts: string[];
  milestones: { label: string; when: string }[];
  insideJokes: string[];
  petNames: string[];
  /**
   * Things the sender asked never to bring up. Carried into every prompt as a
   * hard exclusion. Someone who says "don't mention the breakup" once should
   * not have to say it again on the next template, and a page that reopens it
   * is the single worst failure this feature can produce.
   */
  avoid: string[];
  /** Bumped whenever the context is regenerated, so a stale fill is detectable. */
  version: number;
  generatedAt: Date;
  /** Which stories this context was built from — a mismatch means it is stale. */
  sourceStoryIds: string[];
}

export interface IStoryPeople {
  userName: string;
  partnerName: string;
  bestFriendName: string;
  /** Free text, not an enum. "she/her", "he/him", "they/them", or whatever they type. */
  partnerPronouns: string;
}

export interface IStoryProfile extends Document {
  userId: mongoose.Types.ObjectId;
  people: IStoryPeople;
  stories: IStoryEntry[];
  context?: IStoryContext;
  /** The sender can switch this off; then nothing is ever auto-filled for them. */
  autoFillEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const storyEntrySchema = new Schema<IStoryEntry>(
  {
    storyId: { type: String, required: true, default: () => randomUUID() },
    title: { type: String, default: "", maxlength: 120 },
    // select:false — see note 3 at the top. The list view must not load bodies.
    text: { type: String, default: "", maxlength: FILL_LIMITS.story, select: false },
    sourceSlug: { type: String, default: "" },
  },
  { timestamps: true, _id: false }
);

const storyContextSchema = new Schema<IStoryContext>(
  {
    summary: { type: String, default: "", maxlength: FILL_LIMITS.context },
    language: { type: String, default: "en" },
    languageName: { type: String, default: "English" },
    tone: { type: String, default: "" },
    facts: { type: [String], default: [] },
    milestones: {
      type: [{ _id: false, label: String, when: String }],
      default: [],
    },
    insideJokes: { type: [String], default: [] },
    petNames: { type: [String], default: [] },
    avoid: { type: [String], default: [] },
    version: { type: Number, default: 1 },
    generatedAt: { type: Date, default: Date.now },
    sourceStoryIds: { type: [String], default: [] },
  },
  { _id: false }
);

const storyProfileSchema = new Schema<IStoryProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    people: {
      type: new Schema<IStoryPeople>(
        {
          userName: { type: String, default: "", maxlength: FILL_LIMITS.name },
          partnerName: { type: String, default: "", maxlength: FILL_LIMITS.name },
          bestFriendName: { type: String, default: "", maxlength: FILL_LIMITS.name },
          partnerPronouns: { type: String, default: "", maxlength: 32 },
        },
        { _id: false }
      ),
      default: () => ({
        userName: "",
        partnerName: "",
        bestFriendName: "",
        partnerPronouns: "",
      }),
    },
    stories: { type: [storyEntrySchema], default: [] },
    // select:false — the distilled context is as revealing as the stories it
    // came from, and most reads (does this user have a profile at all?) do not
    // need it.
    context: { type: storyContextSchema, default: undefined, select: false },
    autoFillEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/**
 * Cap the number of stories kept.
 *
 * Not a storage concern — the distilled context is regenerated from ALL of
 * them on every change, and past some number of stories that single model call
 * stops being able to hold them. Oldest-first is the right thing to drop: the
 * context already carries what mattered from the early ones forward, so the
 * information is not actually lost, only its verbatim text.
 */
export const MAX_STORIES = 12;

storyProfileSchema.pre("save", function (next) {
  if (this.stories.length > MAX_STORIES) {
    this.stories = this.stories.slice(-MAX_STORIES);
  }
  next();
});

export default mongoose.model<IStoryProfile>("StoryProfile", storyProfileSchema);
