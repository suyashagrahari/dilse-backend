// ─── The addresses a conversation reply may be sent from ─────────────────────
//
// Replying from the panel used to be hardcoded to `SES_FROM_EMAIL`. That is the
// right default and the wrong only-option: "thanks for the kind words" and
// "about the payment that failed" do not want the same return address, and a
// super admin could not tell from the composer which address either would leave
// from.
//
// ── WHY A CLOSED LIST OF IDS, NOT A FREE-TEXT FIELD ─────────────────────────
//
// Two hard constraints, both discovered by asking SES rather than guessing:
//
//   1. SES sends only from a verified identity. `subhsandesh.in` is verified as
//      a DOMAIN with DKIM SUCCESS, so any address on that domain works and
//      nothing off it does. A free-text field lets someone pick an address that
//      is rejected at send time — after they have written the reply.
//
//   2. The value is interpolated into a mail header, so a newline in it is
//      header injection. Ids cannot carry one.
//
// So the panel sends an ID and the server owns the address. "It looks like an
// email" is a different question from "SES will send from it", and only the
// second one matters.
//
// ── WHAT IS DELIBERATELY NOT SELECTABLE ─────────────────────────────────────
//
// Reply-To. It stays `threadReplyToAddress()` on every reply, whichever From is
// chosen, because the apex domain's MX belongs to GoDaddy and carries all
// company mail — a reply sent back to `feedback@subhsandesh.in` lands in a
// mailbox this application cannot read. Only `reply.subhsandesh.in` reaches
// SES. Making From selectable while Reply-To is fixed is not an inconsistency;
// it is the whole reason the split exists, and the composer shows both so it
// reads as deliberate rather than broken.

import { env } from "../config/env";

export interface SenderOption {
  /** What the client sends back. Never an address. */
  id: string;
  /** The verified address this id resolves to. */
  address: string;
  /** Shown in the picker. */
  label: string;
  /** One line on when to choose it. */
  description: string;
  isDefault?: boolean;
}

export const DEFAULT_SENDER_ID = "feedback";

/**
 * Strip anything that could break a header, and keep only the address.
 *
 * Applied to the configured value too, not just to input: `SES_FROM_EMAIL`
 * comes from the environment, and an environment variable is not a promise.
 */
function safeAddress(value: string | undefined, fallback: string): string {
  const cleaned = String(value || "").replace(/[\r\n\t<>,;"]+/g, "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : fallback;
}

/**
 * The addresses on offer.
 *
 * Built at call time rather than frozen at import so a deployment that changes
 * `SES_FROM_EMAIL` is reflected without a rebuild — and so this module stays
 * testable, which a module-level constant reading frozen env would not be.
 */
export function listSenderOptions(): SenderOption[] {
  const from = safeAddress(env.SES_FROM_EMAIL, "feedback@subhsandesh.in");

  // ── WHY ONLY THESE TWO ────────────────────────────────────────────────────
  //
  // Both are addresses this project already sends as: `feedback@` is
  // SES_FROM_EMAIL, and `support@` is the Reply-To on OTP and contact mail.
  //
  // A third was drafted here — `hello@` — and removed. The verified DOMAIN
  // identity means SES would happily send from it, which is exactly the trap:
  // a recipient can reply straight to the From address instead of using the
  // Reply-To, and mail to an address with no mailbox behind it is lost with
  // nothing to show for it. Offering an address is a promise to read it.
  //
  // `verify@` is deliberately absent too. It exists, but it is the OTP sender,
  // and a personal reply arriving from "verify" reads like a security notice.
  //
  // Adding one is a two-line change here once its mailbox exists.

  return [
    {
      id: DEFAULT_SENDER_ID,
      address: from,
      label: "Feedback",
      description: "The usual address. Use it for anything about a page someone made.",
      isDefault: true,
    },
    {
      id: "support",
      address: "support@subhsandesh.in",
      label: "Support",
      description: "For payments, refunds, access problems — anything that needs a paper trail.",
    },
  ];
}

/**
 * The address for a requested id, or the default address for anything else.
 *
 * Falls back rather than throwing on purpose. The alternative is a reply that
 * refuses to send because a dropdown carried an unexpected value, which is a
 * worse outcome than one sent from the address it would have used anyway.
 */
export function resolveSenderAddress(id: unknown): string {
  const options = listSenderOptions();
  const fallback = options.find((o) => o.isDefault) ?? options[0];
  if (typeof id !== "string") return fallback.address;

  const wanted = id.trim();
  const hit = options.find((o) => o.id === wanted);
  return (hit ?? fallback).address;
}

/** The id matching an address, for showing what a past message was sent from. */
export function senderIdForAddress(address: string): string {
  const wanted = String(address || "").toLowerCase().trim();
  const hit = listSenderOptions().find((o) => o.address.toLowerCase() === wanted);
  return hit ? hit.id : "";
}
