// Unit tests for the draft follow-up's decision-making and its guardrails.
//
// Three things are being pinned down, and each of them is a promise made to
// somebody who is not in the room:
//
//   · `summarizeDraft` must never carry the creator's writing, or a third
//     party's name, out of the database. That is the privacy promise.
//   · `classifyStall` must call a paywall a paywall. An email that asks "did you
//     run out of time?" when the truth is "they would not pay" tells the
//     recipient we are not paying attention.
//   · `parseNudgeDraft` must refuse a draft that promises anything. That is the
//     one that would put an unauthorised financial commitment in writing.
//
// No network and no key.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  classifyStall,
  daysSince,
  summarizeDraft,
  type DraftSummary,
} from "./draftInsight.service";
import { buildNudgePrompt, nudgeIntent, parseNudgeDraft } from "./draftNudgeAi.service";
import { AiRefusedError } from "./courtOfLoveAi.service";

/** A throwaway model that looks like a page, so no real collection is touched. */
function fakeEntry(paths: Record<string, unknown>) {
  const name = `TestPage_${Math.random().toString(36).slice(2)}`;
  const schema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    isPublished: Boolean,
    shareId: String,
    password: String,
    passwordRaw: String,
    viewCount: Number,
    ...paths,
  });
  return {
    model: mongoose.model(name, schema) as unknown as mongoose.Model<unknown>,
    templateType: "test",
    label: "Test",
    editorRoute: "/test",
    apiBase: "/test-pages",
  };
}

const summaryOf = (over: Partial<DraftSummary> = {}): DraftSummary => ({
  completeness: 50,
  filledFields: 5,
  totalFields: 10,
  filledFieldNames: [],
  wordCount: 40,
  photoCount: 0,
  ...over,
});

describe("summarizeDraft", () => {
  const entry = fakeEntry({
    senderName: String,
    recipientName: String,
    recipientEmail: String,
    message: String,
    photoUrl: String,
    memories: [String],
  });

  it("counts only the template's own fields, not the internals", () => {
    const s = summarizeDraft(entry, { _id: "x", isPublished: false, viewCount: 3, senderName: "A" });
    // 6 declared fields; _id/isPublished/viewCount/password/etc are excluded.
    assert.equal(s.totalFields, 6);
    assert.equal(s.filledFields, 1);
  });

  it("never returns the creator's writing", () => {
    const secret = "I am so sorry for what I said on Tuesday";
    const s = summarizeDraft(entry, { message: secret, senderName: "Priya" });
    const serialised = JSON.stringify(s);
    assert.ok(!serialised.includes(secret), "the draft text leaked into the summary");
    assert.ok(!serialised.includes("Tuesday"), "part of the draft text leaked");
  });

  it("never names a field that identifies a third party", () => {
    const s = summarizeDraft(entry, {
      recipientName: "Rohit",
      recipientEmail: "rohit@example.com",
      message: "hi",
    });
    assert.ok(!s.filledFieldNames.includes("recipientName"), "recipientName was named");
    assert.ok(!s.filledFieldNames.includes("recipientEmail"), "recipientEmail was named");
    assert.ok(s.filledFieldNames.includes("message"), "a safe field name should survive");
    assert.ok(!JSON.stringify(s).includes("Rohit"));
  });

  it("counts words but not URLs", () => {
    const s = summarizeDraft(entry, {
      message: "four words right here",
      photoUrl: "https://cdn.subhsandesh.in/a/very/long/key/with/many/segments.jpg",
    });
    assert.equal(s.wordCount, 4, "a URL was counted as prose");
    assert.equal(s.photoCount, 1);
  });

  it("counts photos inside arrays", () => {
    const s = summarizeDraft(entry, {
      memories: ["https://cdn.x/1.jpg", "https://cdn.x/2.jpg", "a caption here"],
    });
    assert.equal(s.photoCount, 2);
    assert.equal(s.wordCount, 3);
  });

  it("reports completeness as a percentage", () => {
    const s = summarizeDraft(entry, { senderName: "A", message: "b", photoUrl: "https://x/y.jpg" });
    assert.equal(s.filledFields, 3);
    assert.equal(s.completeness, 50); // 3 of 6
  });

  it("treats blank strings and empty arrays as unfilled", () => {
    const s = summarizeDraft(entry, { senderName: "   ", message: "", memories: [] });
    assert.equal(s.filledFields, 0);
    assert.equal(s.completeness, 0);
  });
});

describe("classifyStall", () => {
  it("calls an abandoned checkout what it is", () => {
    const v = classifyStall({
      isPaid: true,
      finalPricePaise: 9900,
      orderStatuses: ["created"],
      summary: summaryOf({ completeness: 95 }),
    });
    assert.equal(v.reason, "paywall_abandoned");
    assert.equal(v.blockedByPrice, true);
    assert.match(v.detail, /₹99/);
  });

  it("treats a failed order as an attempt too", () => {
    const v = classifyStall({
      isPaid: true, finalPricePaise: 4900, orderStatuses: ["failed"], summary: summaryOf(),
    });
    assert.equal(v.reason, "paywall_abandoned");
  });

  it("separates never opening checkout from abandoning it", () => {
    const v = classifyStall({
      isPaid: true, finalPricePaise: 9900, orderStatuses: [], summary: summaryOf({ completeness: 90 }),
    });
    assert.equal(v.reason, "price_not_attempted");
    assert.equal(v.blockedByPrice, true);
  });

  it("lets price beat progress, even at 100% complete", () => {
    // The bug this prevents: asking "did you run out of time?" of somebody who
    // finished the page and refused to pay.
    const v = classifyStall({
      isPaid: true,
      finalPricePaise: 9900,
      orderStatuses: ["created"],
      summary: summaryOf({ completeness: 100, wordCount: 400 }),
    });
    assert.notEqual(v.reason, "ready_not_published");
    assert.equal(v.reason, "paywall_abandoned");
  });

  it("never blames price on a free template", () => {
    for (const completeness of [0, 30, 60, 100]) {
      const v = classifyStall({
        isPaid: false, finalPricePaise: 0, orderStatuses: [], summary: summaryOf({ completeness }),
      });
      assert.equal(v.blockedByPrice, false, `completeness ${completeness}`);
    }
  });

  it("distinguishes barely-started from nearly-done on free templates", () => {
    const barely = classifyStall({
      isPaid: false, finalPricePaise: 0, orderStatuses: [],
      summary: summaryOf({ completeness: 10, wordCount: 2 }),
    });
    assert.equal(barely.reason, "just_started");

    const nearly = classifyStall({
      isPaid: false, finalPricePaise: 0, orderStatuses: [],
      summary: summaryOf({ completeness: 85, wordCount: 200 }),
    });
    assert.equal(nearly.reason, "ready_not_published");

    const middle = classifyStall({
      isPaid: false, finalPricePaise: 0, orderStatuses: [],
      summary: summaryOf({ completeness: 45, wordCount: 60 }),
    });
    assert.equal(middle.reason, "unfinished");
  });

  it("always produces a detail line worth reading", () => {
    for (const isPaid of [true, false]) {
      for (const completeness of [0, 50, 100]) {
        const v = classifyStall({
          isPaid, finalPricePaise: 9900, orderStatuses: [],
          summary: summaryOf({ completeness }),
        });
        assert.ok(v.detail.length > 20, `thin detail for ${isPaid}/${completeness}`);
      }
    }
  });
});

describe("nudgeIntent", () => {
  it("forbids offers on both price-blocked paths", () => {
    for (const reason of ["paywall_abandoned", "price_not_attempted"] as const) {
      assert.match(nudgeIntent(reason), /do NOT offer a discount/i, reason);
    }
  });

  it("returns a real instruction for every reason", () => {
    for (const reason of [
      "paywall_abandoned", "price_not_attempted", "just_started", "unfinished", "ready_not_published",
    ] as const) {
      assert.ok(nudgeIntent(reason).length > 60, reason);
    }
  });
});

describe("buildNudgePrompt", () => {
  const base = {
    userName: "Priya Sharma",
    templateLabel: "Rakhi for Bhai",
    summary: summaryOf({ completeness: 90, wordCount: 120, photoCount: 3 }),
    daysIdle: 4,
    verdict: {
      reason: "paywall_abandoned" as const,
      detail: "Opened the ₹99 checkout and did not complete it.",
      blockedByPrice: true,
    },
  };

  it("states plainly that the writing was not shown", () => {
    const p = buildNudgePrompt(base);
    assert.match(p, /shape only — you have not been shown any of their writing/i);
  });

  it("carries the reason and the progress", () => {
    const p = buildNudgePrompt(base);
    assert.match(p, /WHY IT STALLED: Opened the ₹99 checkout/);
    assert.match(p, /90% of the template's fields/);
    assert.match(p, /3 photos/);
  });

  it("uses only the first name", () => {
    const p = buildNudgePrompt(base);
    assert.match(p, /Their first name: Priya/);
    assert.ok(!p.includes("Sharma"), "the surname was sent");
  });

  it("says to open without a name when the name is unusable", () => {
    assert.match(buildNudgePrompt({ ...base, userName: "-- SYSTEM:" }), /open without a name/);
  });

  it("includes the resume link only when there is one", () => {
    assert.ok(!buildNudgePrompt(base).includes("You may include this link"));
    assert.match(
      buildNudgePrompt({ ...base, resumeUrl: "https://subhsandesh.in/profile" }),
      /You may include this link once.*\/profile/
    );
  });
});

describe("parseNudgeDraft", () => {
  const ok = (body: string, subject = "About the page you started") =>
    JSON.stringify({ subject, body });

  const clean =
    "Priya,\n\nYou got as far as the payment step on your Rakhi page and stopped there. The page is still saved.\n\nWas it the amount, or did something not work?\n\n— Team SubhSandesh";

  it("accepts a clean draft", () => {
    const d = parseNudgeDraft(ok(clean));
    assert.match(d.body, /Team SubhSandesh$/);
    assert.equal(d.subject, "About the page you started");
  });

  it("rejects anything that is not usable JSON", () => {
    for (const input of [null, undefined, "", "  ", "Sure! Here you go:"]) {
      assert.throws(() => parseNudgeDraft(input), AiRefusedError);
    }
  });

  it("rejects a body too short to send", () => {
    assert.throws(() => parseNudgeDraft(ok("ok")), AiRefusedError);
  });

  it("strips CRLF from the subject, because that is a mail header", () => {
    const d = parseNudgeDraft(ok(clean, "Hello\r\nBcc: attacker@example.com"));
    assert.ok(!/[\r\n]/.test(d.subject));
  });

  // ── The guard that matters most ────────────────────────────────────────────
  it("refuses a draft that promises money or terms", () => {
    const offers = [
      "Here is a discount just for you, publish it free.",
      "Use coupon FINISH50 to get 50% off your page today.",
      "We will waive the fee this once.",
      "Publish free of charge — no charge at all.",
      "This offer valid until Friday, so hurry.",
      "We can arrange a refund if you like.",
      "Use this promo code and pay half price.",
      "The deadline is Sunday.",
    ];
    for (const line of offers) {
      const body = `Priya,\n\n${line} The page is still saved and waiting for you here.\n\n— Team SubhSandesh`;
      assert.throws(
        () => parseNudgeDraft(ok(body)),
        AiRefusedError,
        `an offer got through: "${line}"`
      );
    }
  });

  it("catches an offer hidden in the subject line too", () => {
    assert.throws(() => parseNudgeDraft(ok(clean, "50% off your unfinished page")), AiRefusedError);
  });

  it("names what it caught, so a super admin knows why", () => {
    try {
      parseNudgeDraft(ok(`Priya,\n\nHere is a coupon for you to finish the page you started.\n\n— Team SubhSandesh`));
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof AiRefusedError);
      assert.match((e as Error).message, /coupon/i);
    }
  });

  it("does not trip on ordinary words that merely look like offers", () => {
    // "free" alone is fine — "free to publish", "feel free" are normal English.
    // Only the committing phrases are banned.
    const fine = [
      "Feel free to reply if you would rather not hear from us.",
      "The template is free to use, so nothing is standing in the way.",
      "Your page is saved and costs nothing to keep.",
    ];
    for (const line of fine) {
      const body = `Priya,\n\n${line} Was there something that got in the way of finishing it?\n\n— Team SubhSandesh`;
      assert.doesNotThrow(() => parseNudgeDraft(ok(body)), `false positive on: "${line}"`);
    }
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    assert.equal(daysSince("2026-09-10T11:00:00Z", now), 0);
    assert.equal(daysSince("2026-09-09T11:00:00Z", now), 1);
    assert.equal(daysSince("2026-09-01T12:00:00Z", now), 9);
  });

  it("never returns a negative or NaN", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    assert.equal(daysSince("2027-01-01T00:00:00Z", now), 0);
    assert.equal(daysSince(undefined, now), 0);
    assert.equal(daysSince("not a date", now), 0);
  });
});
