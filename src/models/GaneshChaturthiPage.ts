import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

// ─── Ganesh Chaturthi ────────────────────────────────────────────────────────
//
// A sender builds one page; whoever they send it to scrolls it and writes one
// line back.
//
// ── WHAT THIS SCHEMA DELIBERATELY DOES NOT HAVE ─────────────────────────────
//
// `mandap` — the first version stored a wall colour, a modak count and a
//   nameplate. All three were choices in service of a saturated orange panel
//   behind the murti, and that panel is gone (see the note at the top of
//   `components/theme.ts`). A stored enum for a surface that no longer exists is
//   the kind of field that gets read by accident five years later.
//
// `memories` — up to twelve photographs with captions and years. It was the
//   heaviest thing in the template for the least return, and the page it fed was
//   a scrolling polaroid grid inside a page whose subject is one greeting. There
//   is one `photoUrl` now.
//
// `offerings` progress — there is no `offeringsDone`, no `completedAt` and no
//   `aartiCount`, and the absence is the point. The offerings are five cards you
//   scroll past; nothing is gated and nothing is counted. A stored progress
//   array immediately invites the two features nobody should build on top of it:
//   telling the sender their cousin stopped at the fourth card, and reminding the
//   cousin to come back. Both turn an act of devotion into a completion metric.
//
// `reply` IS stored, because it is a message the reader chose to send back — see
// the note on the public route in the controller.

export interface IWishRow {
  label: string;
  value: string;
}

export interface IVargani {
  /**
   * Who is collecting — a mandal's name, a building, a flat number.
   *
   * ── WHY THIS EXISTS AS A FIELD AND NOT AS A FIXED HEADING ─────────────────
   *
   * The block was headed "For the pandal" for everybody, and that is wrong for
   * roughly half of the people who would use it. A sarvajanik mandal collecting
   * for a public pandal and one cousin sending another some money for the
   * sweets are both legitimate uses of the same three fields, and reading "For
   * the pandal" over a personal UPI ID makes the sender look like they are
   * fronting a collection they are not part of.
   *
   * With a name in here the heading becomes that name. Empty, the block heads
   * itself neutrally instead — see the client's `VarganiSection`.
   */
  title: string;
  upiId: string;
  qrImageUrl: string;
  note: string;
}

export interface IGaneshChaturthiPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;

  recipientName: string;
  senderName: string;
  city: string;
  /** The one photograph. Round-framed on the page and on the shareable card. */
  photoUrl: string;

  greeting: string[];
  /** One line shown alone while the aarti thali turns. */
  aartiLine: string;
  /** Printed beside the modak, near the end. */
  prasadNote: string;
  wishes: IWishRow[];
  vargani: IVargani;

  /**
   * What the reader wrote back. Written by the PUBLIC reply route — they are not
   * logged in and never will be — so this is the one field a non-owner may set,
   * and it is write-once (see the controller).
   */
  reply: string;
  replyAt: Date | null;

  festivalDate: string;
  visarjanDate: string;

  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const ganeshChaturthiPageSchema = new Schema<IGaneshChaturthiPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },

    // ── THE GENERIC NAME PAIR IS THE STORED PAIR ────────────────────────────
    //
    // The rakhi models carry `brotherName`/`sisterName` and mirror them into
    // `recipientName`/`senderName` in a pre-save hook, because two shared
    // readers — the forwarded-link preview in `share.controller` and the
    // My Creations projection — select only the generic pair and were reading
    // nothing before the mirrors existed.
    //
    // This template has no relationship-specific word for either person: the
    // same page goes to a cousin, a colleague, a building group or a parent, and
    // "recipient" is genuinely the most accurate name for the slot. So it stores
    // the generic pair directly and there is no mirror to maintain, no hook to
    // forget, and no second field that can disagree with the first.
    recipientName: { type: String, default: "" },
    senderName: { type: String, default: "" },

    city: { type: String, default: "" },
    photoUrl: { type: String, default: "" },

    greeting: { type: [String], default: [] },
    aartiLine: { type: String, default: "" },
    prasadNote: { type: String, default: "" },

    wishes: {
      type: [
        {
          label: { type: String, default: "" },
          value: { type: String, default: "" },
        },
      ],
      default: [],
    },

    vargani: {
      title: { type: String, default: "" },
      upiId: { type: String, default: "" },
      qrImageUrl: { type: String, default: "" },
      note: { type: String, default: "" },
    },

    reply: { type: String, default: "" },
    replyAt: { type: Date, default: null },

    // Ganesh Chaturthi 2026 and Anant Chaturdashi 2026. Stored per page rather
    // than hardcoded in the client so a page made this year still says the right
    // thing when somebody reopens the link next September.
    festivalDate: { type: String, default: "2026-09-14" },
    visarjanDate: { type: String, default: "2026-09-24" },

    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ganeshChaturthiPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();

  if (this.isModified("password") && this.password) {
    // ── Trim before hashing ──────────────────────────────────────────────────
    //
    // Senders type a trailing space constantly — a phone keyboard offers one
    // after every word, and a pasted password brings its own. Every
    // recipient-side viewer trims what it sends. So without this, a page stored
    // with "modak " can never be opened by anyone typing "modak": the password
    // is correct and the page still will not open, which is exactly what it
    // looks like from the outside.
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

ganeshChaturthiPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;

  const raw = candidate || "";
  const trimmed = raw.trim();

  // Trimmed first: that is what every page saved since passwords began being
  // trimmed at hash time actually stores.
  if (await bcrypt.compare(trimmed, this.password)) return true;

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
  return bcrypt.compare(raw, this.password);
};

export default mongoose.model<IGaneshChaturthiPage>(
  "GaneshChaturthiPage",
  ganeshChaturthiPageSchema
);
