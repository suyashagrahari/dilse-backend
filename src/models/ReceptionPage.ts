import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

export interface IReceptionBlessing {
  name: string;
  message: string;
  createdAt: Date;
}

// ── Added 2026-10 (light ballroom rebuild). Every one is optional with a default,
// so a page saved before it still loads, renders and re-saves unchanged. ──────

/** One part of the evening (reception, cocktail, after-party). `id` is stable: RSVPs refer to it. */
export interface IReceptionEvent {
  id: string;
  title: string;
  /** "2026-03-15" (local date at the venue). */
  date: string;
  /** "19:00" 24h; "" = to be announced. */
  time: string;
  endTime: string;
  venue: string;
  address: string;
  mapUrl: string;
  dressCode: string;
  dressColor: string;
  note: string;
}

export interface IReceptionChapter {
  when: string;
  title: string;
  line: string;
  photo: string;
}

export interface IReceptionContact {
  name: string;
  relation: string;
  phone: string;
}

export interface IReceptionMusic {
  /** "" = a page from before this field: the template's own reception track. */
  mode: string;
  youtubeId: string;
  start: number;
}

export interface IReceptionPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  brideName: string;
  groomName: string;
  receptionDate: string;
  venue: string;
  venueAddress: string;
  venueMapQuery: string;
  venueTimings: string;
  tagline: string;
  heroImage: string;
  bride: {
    name: string;
    role: string;
    description: string;
    photo: string;
      tags: { emoji: string; label: string }[];
    cropX?: number;
    cropY?: number;
    scale?: number;
  };
  groom: {
    name: string;
    role: string;
    description: string;
    photo: string;
    tags: { emoji: string; label: string }[];
    cropX?: number;
    cropY?: number;
    scale?: number;
  };
  families: { bride: string; groom: string };
  galleryImages: {
    src: string;
    alt: string;
    span: string;
    category: string;
    caption?: string;
    cropX?: number;
    cropY?: number;
    scale?: number;
    w?: number;
    h?: number;
  }[];
  events: IReceptionEvent[];
  story: IReceptionChapter[];
  contacts: IReceptionContact[];
  things: { head: string; text: string }[];
  music: IReceptionMusic;
  theme: string;
  lang: string;
  invitation: string;
  hindiMessage: string;
  blessingsOf: string;
  hashtag: string;
  closingLine: string;
  gettingThere: string;
  videoUrl: string;
  liveUrl: string;
  upiId: string;
  upiName: string;
  rsvpBy: string;
  maxGuests: number;
  rsvpMeal: boolean;
  blessings: IReceptionBlessing[];
  sharePhoto: string;
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const personInfoSchema = new Schema(
  {
    name: { type: String, default: "", trim: true },
    role: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    photo: { type: String, default: "" },
    tags: { type: [{ emoji: String, label: String }], default: [] },
    // Portrait framing (focal point % + zoom 100–300). Absent on older pages = centred.
    cropX: { type: Number },
    cropY: { type: Number },
    scale: { type: Number },
  },
  { _id: false }
);

const s = (max: number, def = "") => ({ type: String, default: def, trim: true, maxlength: max });

const receptionEventSchema = new Schema<IReceptionEvent>(
  {
    id: s(40),
    title: s(60),
    date: s(10),
    time: s(5),
    endTime: s(5),
    venue: s(120),
    address: s(200),
    mapUrl: s(500),
    dressCode: s(80),
    dressColor: s(7),
    note: s(300),
  },
  { _id: false }
);

const receptionChapterSchema = new Schema<IReceptionChapter>(
  { when: s(40), title: s(80), line: s(400), photo: { type: String, default: "" } },
  { _id: false }
);

const receptionContactSchema = new Schema<IReceptionContact>(
  { name: s(60), relation: s(60), phone: s(24) },
  { _id: false }
);

const receptionBlessingSchema = new Schema<IReceptionBlessing>(
  {
    name: { type: String, default: "Guest", trim: true },
    message: { type: String, default: "", trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const receptionPageSchema = new Schema<IReceptionPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    brideName: { type: String, default: "", trim: true },
    groomName: { type: String, default: "", trim: true },
    receptionDate: { type: String, default: "2026-03-15T19:00:00+05:30" },
    venue: { type: String, default: "", trim: true },
    venueAddress: { type: String, default: "", trim: true },
    venueMapQuery: { type: String, default: "", trim: true },
    venueTimings: { type: String, default: "7:00 PM — 11:30 PM", trim: true },
    tagline: { type: String, default: "Request the pleasure of your company", trim: true },
    heroImage: { type: String, default: "/assets/Reception/reception.png" },
    bride: {
      type: personInfoSchema,
      default: () => ({ name: "", role: "The Bride", description: "", photo: "", tags: [] }),
    },
    groom: {
      type: personInfoSchema,
      default: () => ({ name: "", role: "The Groom", description: "", photo: "", tags: [] }),
    },
    families: {
      type: { bride: { type: String, default: "" }, groom: { type: String, default: "" } },
      default: { bride: "", groom: "" },
    },
    galleryImages: {
      type: [
        {
          src: String,
          alt: String,
          span: String,
          category: String,
          caption: String,
          cropX: Number,
          cropY: Number,
          scale: Number,
          w: Number,
          h: Number,
        },
      ],
      default: [],
    },
    events: { type: [receptionEventSchema], default: [] },
    story: { type: [receptionChapterSchema], default: [] },
    contacts: { type: [receptionContactSchema], default: [] },
    things: { type: [{ _id: false, head: s(60), text: s(300) }], default: [] },
    music: {
      type: new Schema<IReceptionMusic>(
        { mode: s(10), youtubeId: s(11), start: { type: Number, default: 0, min: 0, max: 600 } },
        { _id: false }
      ),
      default: () => ({ mode: "", youtubeId: "", start: 0 }),
    },
    theme: s(20),
    lang: s(2, "en"),
    invitation: s(1200),
    hindiMessage: s(700),
    blessingsOf: s(160),
    hashtag: s(40),
    closingLine: s(120),
    gettingThere: s(600),
    videoUrl: s(300),
    liveUrl: s(500),
    upiId: s(120),
    upiName: s(60),
    rsvpBy: s(10),
    maxGuests: { type: Number, default: 6, min: 1, max: 10 },
    rsvpMeal: { type: Boolean, default: false },
    blessings: {
      type: [receptionBlessingSchema],
      default: [],
    },
    sharePhoto: { type: String, default: "" },
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

receptionPageSchema.pre("save", async function (next) {
  if (!this.shareId) {
    this.shareId = randomUUID();
  }
  if (this.isModified("password") && this.password) {
    // ── Trim before hashing ──────────────────────────────────────────────────
    //
    // Senders type a trailing space constantly — a phone keyboard offers one
    // after every word, and a pasted password brings its own. Every
    // recipient-side viewer trims what it sends. So without this, a page stored
    // with "sunflower " can never be opened by anyone typing "sunflower": the
    // password is correct and the page still will not open, which is exactly
    // what it looked like from the outside.
    //
    // Trimming HERE and not in 43 controllers because this is the one point
    // where a password becomes a hash. Anything that assigns and saves is
    // covered, including paths nobody has written yet.
    const trimmed = this.password.trim();

    if (!trimmed) {
      // Whitespace only is not a password. Hashing "" would leave a page that
      // reports itself protected and opens for nobody.
      this.password = "";
      this.passwordRaw = "";
    } else {
      this.passwordRaw = trimmed;
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(trimmed, salt);
    }
  }
  next();
});

receptionPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;

  const raw = candidate || "";
  const trimmed = raw.trim();

  // Trimmed first: that is what every page saved since passwords began being
  // trimmed at hash time actually stores.
  if (await bcrypt.compare(trimmed, this.password)) {
    await rememberPagePassword(this, trimmed);
    return true;
  }

  // ── THEN EXACTLY AS TYPED, FOR PAGES OLDER THAN THAT FIX ──────────────────
  //
  // A page published before passwords were trimmed hashed the string WITH its
  // whitespace — "sunflower " — because no builder trimmed and every phone
  // keyboard offers a space after a word. Trimming the candidate here is what
  // then took away the only key that opened it: the sender's own password
  // stopped working on their own page, and so did the trimmed version. There
  // was no string the recipient could type.
  //
  // scripts/repair-page-passwords.js re-hashes those rows from `passwordRaw`,
  // but it needs someone to run it against production, and a row whose
  // passwordRaw is missing cannot be repaired at all. This costs one extra
  // comparison and needs nobody to remember anything.
  //
  // Skipped when the two strings are equal, so an ordinary wrong password is
  // still exactly one bcrypt comparison.
  if (raw === trimmed) return false;
  if (await bcrypt.compare(raw, this.password)) {
    await rememberPagePassword(this, raw);
    return true;
  }
  return false;
};

export default mongoose.model<IReceptionPage>("ReceptionPage", receptionPageSchema);
