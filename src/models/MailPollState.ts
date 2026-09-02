// ─── Where the IMAP poller left off ─────────────────────────────────────────
//
// One document. It exists so a restart does not re-read the whole mailbox, and
// so the poller never has to WRITE to the mailbox to remember its place.
//
// ── WHY NOT JUST MARK MESSAGES READ ────────────────────────────────────────
//
// The obvious approach — fetch unseen, mark seen — is wrong here, because that
// mailbox belongs to a person. `support@subhsandesh.in` is read by a human, and
// a poller that marks mail read would silently hide a customer's reply from
// them. The IMAP connection is opened READ-ONLY for the same reason.
//
// So the watermark lives here instead: the highest IMAP UID already processed.
//
// ── UIDVALIDITY ────────────────────────────────────────────────────────────
//
// IMAP UIDs are only meaningful within a `uidValidity` generation. If the
// mailbox is recreated the server issues a new one and old UIDs may be reused
// for different messages — so a watermark from a previous generation would skip
// real mail. It is stored alongside and the watermark is reset when it changes.

import mongoose, { Schema, Document } from "mongoose";

export interface IMailPollState extends Document {
  /** Unique. `${host}:${user}:${mailbox}` — one watermark per mailbox polled. */
  key: string;
  lastUid: number;
  uidValidity: string;

  lastRunAt?: Date;
  lastOkAt?: Date;
  lastError: string;
  /** Cumulative, for the admin panel. Not load-bearing. */
  totalStored: number;
  totalSkipped: number;

  createdAt: Date;
  updatedAt: Date;
}

const mailPollStateSchema = new Schema<IMailPollState>(
  {
    key: { type: String, required: true, unique: true, maxlength: 300 },
    lastUid: { type: Number, default: 0, min: 0 },
    // A string: IMAP uidValidity is a 32-bit unsigned int and arrives as a
    // BigInt from imapflow, which does not survive a Number round-trip safely.
    uidValidity: { type: String, default: "" },

    lastRunAt: { type: Date },
    lastOkAt: { type: Date },
    lastError: { type: String, default: "", maxlength: 1000 },
    totalStored: { type: Number, default: 0 },
    totalSkipped: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IMailPollState>("MailPollState", mailPollStateSchema);
