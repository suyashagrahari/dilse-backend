import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/** One polaroid on the memory lane wall. */
export interface IMemory {
  /**
   * Either a bundled asset path (`/assets/proposal/…`) or a base64 data URL the
   * sender uploaded in the EditSheet. Deliberately unbounded — an uploaded photo
   * arrives inline and a maxlength would silently truncate it into a broken image.
   */
  imageUrl: string;
  /** The line written under the polaroid. Kept short — it sits on one or two lines. */
  caption: string;
}

/** Which bundled animation headlines the proposal moment. */
export type HeroArt = "ring" | "rose" | "bouquet";

export interface IProposalPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** Who is asking. Signs the secret note. */
  senderName: string;
  /** Who is being asked. Drives every second-person line in the template. */
  recipientName: string;
  /** Section 1 — the audio gate. */
  gateTitle: string;
  gateButtonLabel: string;
  /** Section 2 — the scrapbook. */
  memoryLaneTitle: string;
  memories: IMemory[];
  /** Section 3 — the ask. */
  askHeadline: string;
  heroArt: HeroArt;
  yesLabel: string;
  /** Section 4 — the payoff. */
  celebrationTitle: string;
  secretNote: string;
  /**
   * ISO `YYYY-MM-DD` of the day they met. Stored as a string rather than a Date
   * so it round-trips through JSON untouched and never shifts across timezones.
   * Empty string hides the day counter.
   */
  metDate: string;
  /**
   * Optional URL of a track to loop behind the page. Also carries a YouTube
   * link, which the template plays through the official IFrame player rather
   * than fetching. Empty string means the built-in melody named by
   * `musicTrack` plays instead.
   */
  musicUrl: string;
  /**
   * Which built-in melody plays when `musicUrl` is empty. "auto" picks one at
   * random per visit, which is what an unconfigured preview does.
   */
  musicTrack: string;
  /**
   * Who is being asked, and therefore which set of words the template speaks:
   * "marriage" proposes, "relationship" asks someone to be theirs. Every
   * default string in the template has two versions; this chooses between them.
   */
  perspective: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const memorySchema = new Schema<IMemory>(
  {
    imageUrl: { type: String, default: "" },
    caption: { type: String, default: "", maxlength: 140 },
  },
  { _id: false }
);

const proposalPageSchema = new Schema<IProposalPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", maxlength: 80 },
    recipientName: { type: String, default: "", maxlength: 80 },
    gateTitle: { type: String, default: "", maxlength: 160 },
    gateButtonLabel: { type: String, default: "", maxlength: 60 },
    memoryLaneTitle: { type: String, default: "", maxlength: 160 },
    memories: { type: [memorySchema], default: [] },
    askHeadline: { type: String, default: "", maxlength: 200 },
    heroArt: { type: String, enum: ["ring", "rose", "bouquet"], default: "ring" },
    yesLabel: { type: String, default: "", maxlength: 60 },
    celebrationTitle: { type: String, default: "", maxlength: 200 },
    secretNote: { type: String, default: "", maxlength: 3000 },
    metDate: { type: String, default: "", maxlength: 24 },
    musicUrl: { type: String, default: "", maxlength: 2000 },
    musicTrack: { type: String, default: "auto", maxlength: 40 },
    perspective: { type: String, enum: ["marriage", "relationship"], default: "marriage" },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

proposalPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
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

proposalPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  // Trimmed on both sides. One viewer sends untrimmed input, and the stored
  // value is trimmed at save time — so comparing raw would reintroduce the bug.
  return bcrypt.compare((candidate || "").trim(), this.password);
};

export default mongoose.model<IProposalPage>("ProposalPage", proposalPageSchema);
