import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PREMIUM_DEFAULTS,
  PREMIUM_LIMITS,
  cleanReplyText,
  isPremiumLocked,
  replyWrite,
  sanitizePremium,
} from "./valentineDays";

const NOW = new Date("2027-02-01T10:00:00.000Z");

describe("sanitizePremium", () => {
  it("defaults everything from garbage", () => {
    for (const raw of [undefined, null, 42, "x", [], {}]) {
      assert.deepEqual(sanitizePremium(raw, undefined, NOW), PREMIUM_DEFAULTS);
    }
    assert.equal(PREMIUM_DEFAULTS.allowReply, true);
    assert.equal(PREMIUM_DEFAULTS.unlockTz, "Asia/Kolkata");
  });

  it("keeps an https voice link only (data URLs are the async resolver's job)", () => {
    assert.equal(sanitizePremium({ voiceNote: " https://cdn.subhsandesh.in/v.webm " }, null, NOW).voiceNote, "https://cdn.subhsandesh.in/v.webm");
    for (const bad of ["http://x/v.webm", "data:audio/webm;base64,AAAA", "javascript:alert(1)", "https://" + "a".repeat(600), 7, "https://evil.example.com/v.webm", "https://cdn.subhsandesh.in.evil.com/v.webm"]) {
      assert.equal(sanitizePremium({ voiceNote: bad }, null, NOW).voiceNote, "", String(bad).slice(0, 30));
    }
  });

  it("clamps the numbers and the waveform", () => {
    const p = sanitizePremium(
      { voiceNoteSec: 75.6, songDropAt: 9999, voicePeaks: [-5, 50.4, 101, "x", "30", ...Array(100).fill(10)] },
      null,
      NOW
    );
    assert.equal(p.voiceNoteSec, 60);
    assert.equal(p.songDropAt, 600);
    assert.equal(p.voicePeaks.length, PREMIUM_LIMITS.voicePeaks);
    assert.deepEqual(p.voicePeaks.slice(0, 5), [0, 50, 100, 0, 30]);
    assert.equal(sanitizePremium({ voiceNoteSec: -3, songDropAt: "abc" }, null, NOW).voiceNoteSec, 0);
    assert.equal(sanitizePremium({ songDropAt: "abc" }, null, NOW).songDropAt, 0);
  });

  it("caps the caption (one line) and the P.S. (newlines kept, controls stripped)", () => {
    const p = sanitizePremium(
      { voiceCaption: "  hi\nthere " + "c".repeat(200), psLetter: "Open only if…\r\n\r\nyou\u0007 miss me\u0000" + "p".repeat(900) },
      null,
      NOW
    );
    assert.equal(Array.from(p.voiceCaption).length, 90);
    assert.ok(p.voiceCaption.startsWith("hi there"));
    assert.ok(p.psLetter.startsWith("Open only if…\n\nyou miss me"));
    assert.equal(Array.from(p.psLetter).length, 600);
  });

  it("unlockAt: normalised ISO, unparsable → '', more than two years ahead → ''", () => {
    assert.equal(sanitizePremium({ unlockAt: "2027-02-14T00:00:00+05:30" }, null, NOW).unlockAt, "2027-02-13T18:30:00.000Z");
    assert.equal(sanitizePremium({ unlockAt: "not a date" }, null, NOW).unlockAt, "");
    assert.equal(sanitizePremium({ unlockAt: "2031-01-01T00:00:00Z" }, null, NOW).unlockAt, "");
    assert.equal(sanitizePremium({ unlockAt: "" }, null, NOW).unlockAt, "");
    assert.equal(sanitizePremium({ unlockAt: 12345 }, null, NOW).unlockAt, "");
    // A past instant is stored (it simply never locks).
    assert.equal(sanitizePremium({ unlockAt: "2026-01-01T00:00:00Z" }, null, NOW).unlockAt, "2026-01-01T00:00:00.000Z");
  });

  it("unlockTz: an IANA-shaped name ≤ 40, else Asia/Kolkata", () => {
    assert.equal(sanitizePremium({ unlockTz: "America/Argentina/Buenos_Aires" }, null, NOW).unlockTz, "America/Argentina/Buenos_Aires");
    assert.equal(sanitizePremium({ unlockTz: "UTC" }, null, NOW).unlockTz, "UTC");
    assert.equal(sanitizePremium({ unlockTz: "Etc/GMT+5" }, null, NOW).unlockTz, "Etc/GMT+5");
    for (const bad of ["../../etc", "Asia/Kolkata<script>", "A/B/C/D", "Europe/" + "x".repeat(40), "", 5]) {
      assert.equal(sanitizePremium({ unlockTz: bad }, null, NOW).unlockTz, "Asia/Kolkata", String(bad));
    }
  });

  it("allowReply defaults true and only an explicit false turns it off", () => {
    assert.equal(sanitizePremium({ allowReply: false }, null, NOW).allowReply, false);
    assert.equal(sanitizePremium({ allowReply: "false" }, null, NOW).allowReply, false);
    assert.equal(sanitizePremium({ allowReply: "maybe" }, null, NOW).allowReply, true);
  });

  it("on update, a key the body does not carry keeps the stored value", () => {
    const prev = sanitizePremium(
      {
        voiceNote: "https://cdn.x/v.webm",
        voiceNoteSec: 12,
        voicePeaks: [1, 2, 3],
        voiceCaption: "cap",
        songDropAt: 42,
        unlockAt: "2027-02-14T00:00:00Z",
        unlockTz: "Europe/London",
        allowReply: false,
        psLetter: "ps",
      },
      null,
      NOW
    );
    assert.deepEqual(sanitizePremium({}, prev, NOW), prev);
    const next = sanitizePremium({ psLetter: "new", allowReply: true, unlockAt: "" }, prev, NOW);
    assert.deepEqual(next, { ...prev, psLetter: "new", allowReply: true, unlockAt: "" });
  });

  it("isPremiumLocked: only a future instant locks", () => {
    assert.equal(isPremiumLocked({ unlockAt: "2027-02-14T00:00:00.000Z" }, NOW), true);
    assert.equal(isPremiumLocked({ unlockAt: "2027-01-14T00:00:00.000Z" }, NOW), false);
    assert.equal(isPremiumLocked({ unlockAt: "" }, NOW), false);
    assert.equal(isPremiumLocked(undefined, NOW), false);
  });
});

describe("cleanReplyText", () => {
  it("rejects non-strings and text that is nothing but invisible characters", () => {
    assert.equal(cleanReplyText(undefined), "");
    assert.equal(cleanReplyText(42), "");
    assert.equal(cleanReplyText("   \n\n  "), "");
    assert.equal(cleanReplyText("​‏﻿‮⁦\u0001"), "");
  });

  it("strips C0 (but keeps \\n), DEL, C1, bidi and zero-width characters", () => {
    assert.equal(cleanReplyText("a\u0000b\u0007c\u007Fd\u0085e\u009Ff"), "abcdef");
    assert.equal(cleanReplyText("evil‮txt.exe‬ and ⁧iso⁩"), "eviltxt.exe and iso");
    assert.equal(cleanReplyText("zero​width‍﻿"), "zerowidth");
    assert.equal(cleanReplyText("tab\there"), "tabhere");
  });

  it("normalises CRLF, collapses 3+ newlines to a blank line, trims", () => {
    assert.equal(cleanReplyText("  hi\r\nyou\r\n\r\n\r\n\r\nthere  \n"), "hi\nyou\n\nthere");
    assert.equal(cleanReplyText("a\rb"), "a\nb");
  });

  it("caps at 280 code points without splitting a surrogate pair", () => {
    const hearts = "💖".repeat(300);
    const out = cleanReplyText(hearts);
    assert.equal(Array.from(out).length, PREMIUM_LIMITS.reply);
    assert.equal(out, "💖".repeat(280));
    assert.equal(Array.from(cleanReplyText("x".repeat(279) + "💖💖")).length, 280);
    assert.ok(cleanReplyText("x".repeat(279) + "💖💖").endsWith("💖"));
  });
});

describe("replyWrite", () => {
  it("guards on the reply still being unset and writes text + time", () => {
    const now = new Date("2027-02-14T10:00:00Z");
    assert.deepEqual(replyWrite("thank you", now), {
      guard: { "reactions.reply": null },
      set: { "reactions.reply": { text: "thank you", at: now } },
    });
  });
});
