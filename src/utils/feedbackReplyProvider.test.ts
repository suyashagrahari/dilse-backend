// ─── Which provider sends a feedback reply, and why the order is inverted ────
//
// `sendOtpEmail` tries Resend first and SES second. `sendFeedbackReplyEmail`
// does the opposite, and that is the point of this file: the inversion looks
// like an inconsistency, so the reason is asserted rather than left to a
// comment somebody will "tidy up".
//
// A feedback reply is one half of a conversation whose other half arrives as
// email. Matching an inbound reply to the right conversation works best off
// `In-Reply-To`, which requires knowing the Message-ID of what we sent. SES
// returns an id from which the real header reconstructs exactly. Resend
// reports no Message-ID and documents no pattern to build one from.
//
// Sending via Resend therefore cost the top rung of the inbound matching
// ladder for every feedback reply, and every remaining rung needed the creator
// to reply FROM their account address — so a reply from any other address
// landed in "Unmatched", indistinguishable from a stranger writing in.
//
// ── WHY THIS READS THE SOURCE ───────────────────────────────────────────────
//
// `config/env` is computed once at first import, so a module that reads it
// cannot be re-imported under different configuration — the same constraint
// that produced `formatReplyToAddress` and `otpFallback.test.ts`. Testing the
// ORDER of two provider calls needs the module loaded twice with each one
// failing, which is exactly what cannot be arranged here. So the ordering and
// the honesty rules are asserted against the text, like the OTP chain's.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MAILER = readFileSync(join(__dirname, "mailer.ts"), "utf8");

function feedbackFunction(): string {
  const start = MAILER.indexOf("export async function sendFeedbackReplyEmail(");
  assert.ok(start > 0, "sendFeedbackReplyEmail must exist");
  const end = MAILER.indexOf("\n}\n", start);
  assert.ok(end > start, "could not find the end of the function");
  return MAILER.slice(start, end);
}

describe("the feedback reply provider chain", () => {
  const fn = feedbackFunction();

  it("tries SES before Resend — the opposite of the OTP chain", () => {
    const sesAt = fn.indexOf("sendSesEmail");
    const resendAt = fn.indexOf("resend.emails.send");
    assert.ok(sesAt > 0, "SES must be attempted");
    assert.ok(resendAt > 0, "Resend must remain as the fallback");
    assert.ok(
      sesAt < resendAt,
      "SES goes first: it is the only provider that yields a Message-ID we can match replies against"
    );
  });

  it("keeps Resend rather than removing it", () => {
    // A support reply that fails to send is worse than one whose id we cannot
    // record, so the working path stays as a fallback.
    assert.match(fn, /if \(!resend\)/);
  });

  it("records an id ONLY on the SES path", () => {
    // The Resend branch must report "" rather than inventing something. A
    // stored id that never existed is worse than a missing one: an inbound
    // reply could match a header we never actually sent.
    assert.match(fn, /rfcMessageId: rfcMessageIdFor\(/);
    const resendAt = fn.indexOf("resend.emails.send");
    const after = fn.slice(resendAt);
    assert.match(after, /rfcMessageId: ""/, "the Resend path must return an empty id");
    assert.ok(
      !/rfcMessageIdFor\(/.test(after),
      "nothing after the Resend send may reconstruct an id — Resend gives us nothing to reconstruct from"
    );
  });

  it("sends as support@, not the follow-up address", () => {
    // feedback@ sends unsolicited draft follow-ups and carries that engagement
    // profile. A personal answer to someone who wrote in comes from support@.
    assert.match(fn, /const fromAddress = "support@subhsandesh\.in"/);
  });

  it("never uses an apex address as Reply-To", () => {
    // Apex mail is GoDaddy's and this application cannot read it, so a reply
    // sent back to support@ or feedback@ is lost. Only the SES receiving
    // subdomain reaches the panel.
    assert.match(fn, /threadReplyToAddress\(\)/);
    assert.ok(
      !/replyTo:\s*"(support|feedback)@subhsandesh\.in"/.test(fn),
      "Reply-To must be the SES receiving address, never an apex mailbox"
    );
  });

  it("answers with the address it used instead of leaving the caller to repeat it", () => {
    // Two copies of the From literal drift the first time one changes, and the
    // conversation record would then name an address the mail did not use.
    assert.match(fn, /fromAddress,/);
  });

  it("passes threading headers through when it is given them", () => {
    assert.match(fn, /In-Reply-To/);
    assert.match(fn, /References/);
  });
});
