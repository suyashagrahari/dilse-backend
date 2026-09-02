import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ─── Google sign-in must never lead to an OTP ───────────────────────────────
//
// Structural assertions against auth.controller.ts. Every one corresponds to a
// bug that was really present and reproduced against a running server before
// being fixed — see the comments in `googleAuth`.

const AUTH = fs.readFileSync(
  path.join(process.cwd(), "src", "controllers", "auth.controller.ts"),
  "utf8"
);

function block(name: string): string {
  const start = AUTH.indexOf(`export const ${name} = async`);
  assert.ok(start > 0, `${name} must exist`);
  const next = AUTH.indexOf("\nexport const ", start + 10);
  return AUTH.slice(start, next === -1 ? undefined : next);
}

describe("googleAuth never sends an OTP", () => {
  const fn = block("googleAuth");

  it("does not call sendOtpEmail at all", () => {
    // Google has already proved the address. Asking again is the bug.
    assert.ok(!fn.includes("sendOtpEmail"));
  });

  it("verifies the address on an account that was unverified", () => {
    // THE reported bug: this block linked googleId and flipped provider but
    // never set isVerified, so the NEXT password login hit the verification
    // gate and mailed a code.
    assert.match(fn, /user\.isVerified = true/);
  });

  it("clears any pending code once the address is proved", () => {
    // Otherwise a code mailed before the Google sign-in still works.
    assert.match(fn, /user\.set\("otp", undefined\)/);
    assert.match(fn, /user\.set\("otpExpiry", undefined\)/);
  });

  it("selects +password, without which the linking logic reads undefined", () => {
    // `password` is `select: false`. The old code could not have made this
    // decision correctly even if it had tried.
    assert.match(fn, /\.select\("\+password"\)/);
  });

  // ── The takeover that fixing the reported bug would otherwise open ──────
  it("discards a password that belonged to a never-verified account", () => {
    // 1. attacker registers victim@gmail.com with a password they choose
    // 2. the real victim signs in with Google
    // 3. without this, the account is now verified AND the attacker's
    //    password works.
    assert.match(fn, /user\.set\("password", undefined\)/);
    const guard = /if \(wasUnverified\)[\s\S]*?user\.set\("password", undefined\)/;
    assert.match(fn, guard, "clearing must be gated on the account having been unverified");
  });

  it("does NOT clear the password of an already-verified account", () => {
    // Someone who verified by email and later adds Google keeps both ways in.
    const idx = fn.indexOf('user.set("password", undefined)');
    const before = fn.slice(0, idx);
    assert.ok(
      before.lastIndexOf("if (wasUnverified)") > before.lastIndexOf("} else {"),
      "the clear sits inside the wasUnverified branch"
    );
  });

  it("only claims provider google when no usable password remains", () => {
    // `login` refuses on `provider === "google" && !password`, so labelling an
    // account with a password as google-only rejects that password.
    assert.match(fn, /if \(!user\.password\) user\.provider = "google"/);
  });

  it("does not overwrite an avatar the user chose", () => {
    assert.match(fn, /if \(googlePicture && !user\.avatar\)/);
  });

  // ── Token verification ─────────────────────────────────────────────────
  it("checks the access token's audience", () => {
    // /userinfo answers for ANY valid Google access token, whichever client
    // minted it — so a token issued to another application authenticated as
    // that user here.
    assert.match(fn, /tokeninfo\?access_token=/);
    assert.match(fn, /tokenInfo\.aud !== env\.GOOGLE_CLIENT_ID/);
  });

  it("refuses a Google address Google itself has not verified", () => {
    assert.match(fn, /googleEmailVerified/);
    assert.match(fn, /if \(!googleEmailVerified\)/);
    assert.match(fn, /email_verified/);
  });
});

describe("password login is the only path that sends an OTP", () => {
  it("login sends a code only after the password matched", () => {
    const fn = block("login");
    const match = fn.indexOf("comparePassword");
    const otp = fn.indexOf("sendOtpEmail");
    assert.ok(match > 0 && otp > 0);
    assert.ok(match < otp, "a wrong password must not be able to mail codes");
  });

  it("login refuses a google-only account before ever reaching the OTP gate", () => {
    const fn = block("login");
    const googleGuard = fn.indexOf('user.provider === "google" && !user.password');
    const otp = fn.indexOf("sendOtpEmail");
    assert.ok(googleGuard > 0 && googleGuard < otp);
  });

  it("resendOtp refuses an already-verified account", () => {
    const fn = block("resendOtp");
    assert.match(fn, /user\.isVerified[\s\S]*?Email already verified/);
  });

  it("register names Google rather than just saying the account exists", () => {
    const fn = block("register");
    assert.match(fn, /code:\s*"USE_GOOGLE"/);
  });
});

describe("an account with no password can set one", () => {
  const fn = block("changePassword");

  it("does not require a current password when there is none", () => {
    // Without this, both a Google signup and anyone whose unverified-era
    // password was cleared are stranded — there is NO /forgot-password route
    // anywhere in this codebase to fall back on.
    assert.match(fn, /settingFirstPassword/);
    assert.match(fn, /if \(!settingFirstPassword\)/);
  });

  it("still requires it when a password exists", () => {
    assert.match(fn, /Your current password is required to change it/);
    assert.match(fn, /Current password is incorrect/);
  });

  it("flips provider to local so login accepts the new password", () => {
    assert.match(fn, /if \(user\.provider === "google"\) user\.provider = "local"/);
  });

  it("no longer refuses google accounts outright", () => {
    assert.ok(!fn.includes("Google accounts cannot change password here"));
  });
});

describe("no /forgot-password route exists", () => {
  it("is recorded, because the fixes above depend on it", () => {
    const routes = fs.readFileSync(
      path.join(process.cwd(), "src", "routes", "auth.routes.ts"),
      "utf8"
    );
    // If a reset flow is ever added, revisit changePassword: the
    // set-first-password path exists specifically because there is none.
    assert.ok(
      !/forgot|reset-password/i.test(routes),
      "a reset flow now exists — revisit the set-first-password path in changePassword"
    );
  });
});
