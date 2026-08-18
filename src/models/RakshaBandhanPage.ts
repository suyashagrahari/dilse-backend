import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

// ─── Raksha Bandhan ──────────────────────────────────────────────────────────
//
// A sister builds the page; her brother opens it and performs the ritual.
//
// ── THE ONE STRUCTURAL RULE ─────────────────────────────────────────────────
//
// `shagun` holds her UPI details so he can send the customary money after the
// rakhi is tied. There is deliberately NO field recording whether he paid — no
// `shagunSent`, no `paidAt`, no `reminderCount`. The absence is the point: a
// page that cannot store the answer cannot nag him for it, cannot ask him to
// confirm, and cannot show her a number that turns a gift into an invoice.
//
// If someone later adds such a field, every guilt-trip this template was built
// to avoid becomes one `if` away. It is easier to defend a column that does not
// exist than a feature nobody is allowed to build on top of it.

export type RakhiCharm = "om" | "swastik" | "evil-eye" | "heart" | "star";

export interface IMemory {
  imageUrl: string;
  caption: string;
  year: string;
}

export interface ILedgerRow {
  label: string;
  value: string;
}

export interface IRakhiDesign {
  threadColorA: string;
  threadColorB: string;
  beadColor: string;
  charm: RakhiCharm;
  pendantText: string;
}

export interface IShagun {
  upiId: string;
  qrImageUrl: string;
  note: string;
}

export interface IRakshaBandhanPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;

  brotherName: string;
  sisterName: string;

  /**
   * Mirrors of `brotherName` / `sisterName` under the generic names the shared
   * readers look for. Maintained by the `pre("save")` hook below; never set by
   * hand.
   *
   * Two places consume them, and both were reading nothing before these existed:
   *
   *  • `share.controller` builds the forwarded link preview from
   *    `recipientName` / `senderName` — one generic pair for all fifty-odd
   *    templates — so the WhatsApp card read "Raksha Bandhan for You from
   *    Someone Special" no matter whose page it was.
   *  • `/share/me/creations` selects the same two fields, which is what the
   *    profile's My Creations card prints. A page with neither is a card with
   *    no names on it, and a sender scrolling for the rakhi she just sent has
   *    nothing to recognise it by.
   *
   * The alternative — teaching those shared readers this template's field names
   * — means editing a file every template depends on in order to fix one. This
   * stays local, and the hook makes it impossible to forget on a later write
   * path. The sister template carries the same pair for the same reason.
   */
  recipientName: string;
  senderName: string;

  city: string;
  /** The two of them together — the hero of the shareable card. */
  photoUrl: string;

  greeting: string[];
  rakhi: IRakhiDesign;
  memories: IMemory[];
  ledger: ILedgerRow[];
  shagun: IShagun;

  /**
   * What he typed back. Written by the PUBLIC vachan route — he is not logged
   * in and never will be, so this is the one field a non-owner may set, and it
   * is write-once (see the controller).
   */
  vachan: string;
  vachanAt: Date | null;

  distanceKm: number;
  festivalDate: string;

  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const rakshaBandhanPageSchema = new Schema<IRakshaBandhanPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },

    brotherName: { type: String, default: "" },
    sisterName: { type: String, default: "" },
    // Denormalised for the share preview and the profile card — see the
    // interface above. Written by the pre-save hook, not by the controller.
    recipientName: { type: String, default: "" },
    senderName: { type: String, default: "" },
    city: { type: String, default: "" },
    photoUrl: { type: String, default: "" },

    greeting: { type: [String], default: [] },

    rakhi: {
      threadColorA: { type: String, default: "#9B2226" },
      threadColorB: { type: String, default: "#E8913A" },
      beadColor: { type: String, default: "#B08D57" },
      charm: {
        type: String,
        enum: ["om", "swastik", "evil-eye", "heart", "star"],
        default: "om",
      },
      pendantText: { type: String, default: "" },
    },

    memories: {
      type: [
        {
          imageUrl: { type: String, default: "" },
          caption: { type: String, default: "" },
          year: { type: String, default: "" },
        },
      ],
      default: [],
    },

    ledger: {
      type: [
        {
          label: { type: String, default: "" },
          value: { type: String, default: "" },
        },
      ],
      default: [],
    },

    shagun: {
      upiId: { type: String, default: "" },
      qrImageUrl: { type: String, default: "" },
      note: { type: String, default: "" },
    },

    vachan: { type: String, default: "" },
    vachanAt: { type: Date, default: null },

    distanceKm: { type: Number, default: 0 },
    // Raksha Bandhan 2026. Stored per-page rather than hardcoded so a page made
    // this year still says the right thing when it is reopened next year.
    festivalDate: { type: String, default: "2026-08-28" },

    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rakshaBandhanPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();

  // Keep the share-preview mirrors in step with the real fields on EVERY write.
  // In the hook rather than in the controller because there are four `.save()`
  // call sites already and the next one added would be the one that forgot.
  // This also repairs documents written before the fields existed: the next
  // save of an old page — an edit, or pressing Send again — fills them in.
  this.recipientName = this.brotherName;
  this.senderName = this.sisterName;

  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

rakshaBandhanPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IRakshaBandhanPage>(
  "RakshaBandhanPage",
  rakshaBandhanPageSchema
);
