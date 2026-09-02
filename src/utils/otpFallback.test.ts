import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ─── The OTP fallback chain, asserted against the source ────────────────────
//
// `sendOtpEmail` builds its Resend and SES clients at module load from env, so
// exercising the branches in-process would mean either real credentials or a
// module-mocking layer this repo does not have. The properties that actually
// matter are structural, and they are checked here directly — the same
// approach `publishGate.coverage.test.ts` takes for per-template obligations.
//
// Every assertion below corresponds to a bug that was really present.

const MAILER = fs.readFileSync(
  path.join(process.cwd(), "src", "utils", "mailer.ts"),
  "utf8"
);
const AUTH = fs.readFileSync(
  path.join(process.cwd(), "src", "controllers", "auth.controller.ts"),
  "utf8"
);

function otpFunction(): string {
  const start = MAILER.indexOf("export async function sendOtpEmail(");
  assert.ok(start > 0, "sendOtpEmail must exist");
  const end = MAILER.indexOf("\n}\n", start);
  return MAILER.slice(start, end);
}

describe("the OTP fallback chain", () => {
  const fn = otpFunction();

  it("tries Resend before SES", () => {
    const resendAt = fn.indexOf("resend.emails.send");
    const sesAt = fn.indexOf("sendSesEmail");
    assert.ok(resendAt > 0 && sesAt > 0, "both providers must be attempted");
    assert.ok(resendAt < sesAt, "Resend is the established path and goes first");
  });

  it("reads Resend's `error` field rather than relying on a throw", () => {
    // The Resend SDK reports a refusal — a rate-limit rejection included — in
    // `result.error` instead of throwing. Only catching exceptions makes a
    // hit daily cap indistinguishable from a successful send.
    assert.match(fn, /result\?\.error/);
  });

  it("sends via SES as verify@, never as the follow-up address", () => {
    assert.match(fn, /from:\s*env\.SES_OTP_FROM_EMAIL/);
    assert.ok(
      !/from:\s*env\.SES_FROM_EMAIL/.test(fn),
      "a sign-in code must not inherit the unsolicited-mail address's reputation"
    );
  });

  it("puts sign-in codes on their own SES configuration set", () => {
    assert.match(fn, /configurationSet:\s*env\.SES_OTP_CONFIGURATION_SET/);
  });

  it("replies to a real mailbox", () => {
    // team@subhsandesh.in does not exist, so every reply to a sign-in code
    // bounced. support@ is a real mailbox.
    assert.match(fn, /replyTo:\s*"support@subhsandesh\.in"/);
    assert.ok(!fn.includes("team@subhsandesh.in"), "team@ is not a mailbox");
  });

  it("reports an outcome instead of returning void", () => {
    assert.match(MAILER, /Promise<OtpSendOutcome>/);
    assert.match(MAILER, /delivered:\s*boolean/);
  });

  it("does not treat the dev console log as a delivery", () => {
    // `logged` keeps a laptop working with no provider at all, but it must
    // never be reported as delivered — in production it means nothing was sent.
    assert.match(fn, /delivered:\s*false,\s*via:\s*"logged"/);
  });

  // ── The security property ───────────────────────────────────────────────
  it("never signs anybody in from the mail layer", () => {
    // Asked for as "if both fail then login directly". It is an
    // account-takeover primitive: SES refuses addresses on its suppression
    // list and a recipient domain can reject one address and no others, so
    // "sending failed" is targetable at a chosen victim.
    for (const forbidden of [
      "generateToken",
      "generateAccessToken",
      "generateRefreshToken",
      "isVerified = true",
      "jwt.sign",
    ]) {
      assert.ok(
        !fn.includes(forbidden),
        `the mail layer must not do auth — found "${forbidden}"`
      );
    }
  });
});

describe("every OTP call site handles a failed send", () => {
  it("has exactly three call sites, all awaiting the outcome", () => {
    const calls = AUTH.match(/sendOtpEmail\(/g) || [];
    assert.equal(calls.length, 3, "three call sites in auth.controller");
    const awaited = AUTH.match(/const sent = await sendOtpEmail\(/g) || [];
    assert.equal(awaited.length, 3, "every one must read the outcome");
  });

  it("no longer swallows the result with a bare catch", () => {
    // Two of the three call sites had `catch {}` and then told the user a code
    // had been sent.
    assert.ok(
      !/sendOtpEmail\([^)]*\);\s*\}\s*catch\s*\{\s*\}/.test(AUTH),
      "a bare catch around the OTP send hides exactly the failure that matters"
    );
  });

  it("resendOtp answers an error status when nothing was sent", () => {
    // This route exists BECAUSE the first code did not arrive. Answering 200
    // with "New code sent" sends the person off to wait for a second email
    // that is equally absent.
    assert.match(AUTH, /code:\s*"OTP_SEND_FAILED"/);
    assert.match(AUTH, /res\.status\(502\)/);
  });

  it("points people at Google sign-in, which needs no email at all", () => {
    const mentions = AUTH.match(/signing in with Google/g) || [];
    assert.ok(mentions.length >= 2, "both user-facing failure paths should say it");
  });

  it("tells the client whether the code actually went", () => {
    const flags = AUTH.match(/emailDelivered:/g) || [];
    assert.ok(flags.length >= 2, "registration and unverified-login both report it");
  });
});
