import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

// ─── Raksha Bandhan, the other way round ─────────────────────────────────────
//
// `RakshaBandhanPage` is built by a SISTER and read by her brother, who performs
// the puja on his phone. This model is the mirror: a BROTHER builds the page and
// his sister reads it. That is not a relabelling, because on the day itself the
// two of them do different things — she ties the thread, he makes the vow and
// gives the shagun. So the fields split along the same line the ritual does:
//
//   his, authored in the builder:  greeting, vow, vowSince, lifafa, account,
//                                  memories, letter
//   hers, written once from the published page:  reply, rakhiPicked
//
// ── WHY `reply` AND `rakhiPicked` ARE NOT OWNER-WRITABLE ────────────────────
//
// They arrive through the public share route (no login — she is not a user of
// this site and should not have to become one to answer her brother), and the
// owner-side update deliberately leaves them alone. If a builder save could
// carry them, his editor — which never loaded her answer — would blank it on
// the next save. Worse, he could rewrite it. Both make the one thing that comes
// back to him worthless.
//
// ── THE ONE STRUCTURAL RULE, INHERITED ──────────────────────────────────────
//
// `lifafa` records the shagun he is giving — the figure and a line — and nothing
// else. There is deliberately NO field recording whether the money moved: no
// `shagunSent`, no `paidAt`, no `openedAt`, no `reminderCount`. The absence is the
// point: a page that cannot store the answer cannot nag, cannot ask her to
// confirm receipt, and cannot show him a number that turns a gift into an
// invoice. A column that does not exist is easier to defend than a feature
// nobody is allowed to build on top of it.
//
// It also holds no `upiId` and no `qrImageUrl`, which is where this model stops
// mirroring the brother one. There a SISTER asks and the payee is the builder, so
// a QR points the same way as the money. Here the brother GIVES, and a UPI QR or
// a `upi://pay` link encodes a PAYEE — his handle on her page would ask her to
// pay him, hers would publish her bank identifier on a document built to be
// forwarded, and on this festival a forwarded page carrying a payment code is the
// shape of the season's commonest fraud. See the `Lifafa` interface in the
// client's `components/types.ts` for the full argument. Do not add the columns
// back "for parity".

/** The five rakhis she may choose from. Mirrors `RakhiStyle` on the client. */
export type RakhiStyle = "phool" | "chandan" | "nazar" | "moti" | "kalava";

export interface IMemory {
  imageUrl: string;
  caption: string;
  year: string;
}

/** One line of the statement: a label and the figure it stands at. */
export interface IAccountRow {
  label: string;
  value: string;
}

/**
 * The statement of account — two columns, and the two-sidedness is the device.
 *
 * ── WHY THIS IS NOT ONE `complaints` ARRAY ───────────────────────────────────
 *
 * It was, for one revision: a single "complaint register" of grievances he
 * formally drops. That is a joke which resolves into nothing. A statement has a
 * left side and a right side — `sheOwes` is petty and itemised and true (the
 * hoodie, the tattling, the charger), `heOwes` is what she actually did for him
 * in the same flat register — and the second column does not fit on the same
 * scale as the first. The screen sets up its own reversal, and it is what earns
 * the shagun screen after it: the envelope reads as part payment against a
 * balance the page has just established cannot be cleared.
 *
 * Two arrays and not one array with a `side` discriminator, because the two
 * columns are written in different registers, are revealed in a fixed order, and
 * are deliberately different lengths (two rows hers, three his). A flat list
 * would make every one of those a filter at render time and would let a
 * malformed row land in neither column.
 *
 * The asymmetry is not enforced here — see the note in the controller.
 */
export interface IAccount {
  /** Petty, itemised, hers to answer for. Two lines on the screen. */
  sheOwes: IAccountRow[];
  /** What she actually did. Same deadpan register, no punchlines. Three lines. */
  heOwes: IAccountRow[];
}

/**
 * The shagun envelope.
 *
 * `amount` is a String and not a Number on purpose: what a brother types here is
 * "501", "1100", "5001" — the auspicious figures, which all end in 1 — and some
 * write "jitna chahiye". A Number would either reject that or silently drop the
 * trailing 1, which is the only digit that means anything.
 */
export interface ILifafa {
  amount: string;
  note: string;
}

export interface IRakshaBandhanSisterPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;

  sisterName: string;
  brotherName: string;

  /**
   * Mirrors of `sisterName` / `brotherName` under the generic names the SHARE
   * METADATA reader looks for. Maintained by a `pre("save")` hook below; never set
   * by hand.
   *
   * ── WHY DUPLICATE TWO STRINGS ───────────────────────────────────────────────
   *
   * `share.controller` builds the link preview from `pageObj.recipientName` and
   * `pageObj.senderName` — one generic pair for all fifty-odd templates. A model
   * that names its people anything else gets the fallbacks, and the forwarded
   * WhatsApp preview reads "Raksha Bandhan for You from Someone Special".
   *
   * That preview is not a detail. It is frequently the ONLY artefact that travels:
   * a forwarded link is a preview card long before anybody taps it, and WhatsApp's
   * stricter privacy settings disable previews entirely for some accounts, which
   * is why the page also generates a downloadable image. Naming her costs two
   * denormalised strings.
   *
   * The alternative — teaching the shared controller this template's field names —
   * means editing a file every template depends on in order to fix one. This stays
   * local, and the hook makes it impossible to forget on a later write path.
   */
  recipientName: string;
  senderName: string;

  /**
   * Is she the elder one? Decides whether the page calls her Didi or Behna, and
   * there is no neutral word in the languages this page is written in — an elder
   * sister called "behna" is a slight, a younger one called "didi" is a joke.
   *
   * Defaults to TRUE, and the default is load-bearing: a document written before
   * this field existed reads `undefined`, and the client resolves that with
   * `!== false` so a legacy page keeps saying Didi rather than silently demoting
   * every elder sister. The controller mirrors that rule.
   */
  sisterIsElder: boolean;
  /** The two of them, square-cropped. Cover screen and the shareable card. */
  photoUrl: string;

  greeting: string[];
  /**
   * The vow — what the "raksha" in Raksha Bandhan actually refers to, and his
   * whole half of the ritual. Rendered as a certificate she can download, which
   * is why it is a list of lines rather than a paragraph.
   */
  vow: string[];
  /** "since 1998", "since the day they brought you home". Printed on the seal. */
  vowSince: string;
  lifafa: ILifafa;
  /**
   * The statement of account — the teasing half, and load-bearing rather than
   * decorative. A sibling page that is only tender reads as somebody else's; the
   * fighting IS the relationship. See `IAccount` for why it has two sides.
   */
  account: IAccount;
  memories: IMemory[];
  /** His letter. The last thing she reads before she answers. */
  letter: string;

  /**
   * What she typed back. Written by the PUBLIC reply route — she is not logged
   * in and never will be, so this is one of the two fields a non-owner may set,
   * and it is write-once (see the controller).
   */
  reply: string;
  /** Which of the five rakhis she tied. Write-once, alongside the reply. */
  rakhiPicked: string;
  replyAt: Date | null;

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

const rakshaBandhanSisterPageSchema = new Schema<IRakshaBandhanSisterPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },

    sisterName: { type: String, default: "" },
    brotherName: { type: String, default: "" },
    // Denormalised for the share-link preview only — see the interface above.
    recipientName: { type: String, default: "" },
    senderName: { type: String, default: "" },
    sisterIsElder: { type: Boolean, default: true },
    photoUrl: { type: String, default: "" },

    greeting: { type: [String], default: [] },
    vow: { type: [String], default: [] },
    vowSince: { type: String, default: "" },

    // No `upiId` and no `qrImageUrl` — see the note at the top of this file.
    lifafa: {
      amount: { type: String, default: "" },
      note: { type: String, default: "" },
    },

    // Declared as a nested path with two arrays of sub-documents, the same way
    // `shagun` is declared on the brother model — an inline object rather than a
    // named sub-schema, so `account.sheOwes[0].label` addresses the same string
    // on the server, in the request body, and in the aiFill path grammar.
    account: {
      sheOwes: {
        type: [
          {
            label: { type: String, default: "" },
            value: { type: String, default: "" },
          },
        ],
        default: [],
      },
      heOwes: {
        type: [
          {
            label: { type: String, default: "" },
            value: { type: String, default: "" },
          },
        ],
        default: [],
      },
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

    letter: { type: String, default: "" },

    reply: { type: String, default: "" },
    // Deliberately NOT a mongoose `enum`, even though only five ids are legal.
    // The pre-tie state is the empty string, an enum would have to list "" as a
    // valid member to avoid throwing on every save before she answers, and at
    // that point the enum no longer says anything the controller's allow-list
    // does not say better. The single route that writes this field checks the id
    // against RAKHI_STYLE_IDS and drops anything else, so an illegal value never
    // reaches the schema in the first place.
    rakhiPicked: { type: String, default: "" },
    replyAt: { type: Date, default: null },

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

rakshaBandhanSisterPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();

  // Keep the share-preview mirrors in step with the real fields on EVERY write.
  // Doing this in the hook rather than in the controller is deliberate: there are
  // four `.save()` call sites already and the next one added would be the one that
  // forgot. See the note on `recipientName` in the interface.
  this.recipientName = this.sisterName;
  this.senderName = this.brotherName;

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

rakshaBandhanSisterPageSchema.methods.comparePassword = async function (
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

export default mongoose.model<IRakshaBandhanSisterPage>(
  "RakshaBandhanSisterPage",
  rakshaBandhanSisterPageSchema
);
