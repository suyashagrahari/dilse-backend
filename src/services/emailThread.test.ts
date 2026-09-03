import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HEADER_VALUE_MAX,
  baseSubject,
  buildReferences,
  normalizeMessageId,
  parseMessageIds,
  replySubject,
  rfcMessageIdFor,
  stripQuotedReply,
  subjectKey,
  threadingHeadersFor,
} from "./emailThread.service";

describe("rfcMessageIdFor", () => {
  it("glues the us-east-1 domain on, which has no region prefix", () => {
    assert.equal(
      rfcMessageIdFor("010001a05d94a634-abc-000000", "us-east-1"),
      "<010001a05d94a634-abc-000000@email.amazonses.com>"
    );
  });

  it("uses the region's own name everywhere else", () => {
    assert.equal(rfcMessageIdFor("abc", "eu-west-1"), "<abc@eu-west-1.amazonses.com>");
    assert.equal(rfcMessageIdFor("abc", "ap-south-1"), "<abc@ap-south-1.amazonses.com>");
  });

  it("defaults a missing region rather than building an id with 'undefined' in it", () => {
    assert.equal(rfcMessageIdFor("abc", ""), "<abc@email.amazonses.com>");
  });

  it("leaves an id that is already a full header alone", () => {
    assert.equal(
      rfcMessageIdFor("<x@mail.example.com>", "us-east-1"),
      "<x@mail.example.com>"
    );
  });

  it("returns empty for no id — a skipped send must not anchor a thread", () => {
    assert.equal(rfcMessageIdFor("", "us-east-1"), "");
    assert.equal(rfcMessageIdFor("   ", "us-east-1"), "");
  });
});

describe("normalizeMessageId", () => {
  it("adds the brackets a client left off", () => {
    assert.equal(normalizeMessageId("a@b.com"), "<a@b.com>");
  });

  it("strips repeated brackets", () => {
    assert.equal(normalizeMessageId("<<a@b.com>>"), "<a@b.com>");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(normalizeMessageId("  <a@b.com>  \n"), "<a@b.com>");
  });

  it("rejects anything with inner whitespace — that is not one id", () => {
    assert.equal(normalizeMessageId("<a@b.com> <c@d.com>"), "");
    assert.equal(normalizeMessageId("hello there"), "");
  });

  it("rejects an absurdly long id", () => {
    assert.equal(normalizeMessageId("x".repeat(500) + "@b.com"), "");
  });

  it("rejects empty", () => {
    assert.equal(normalizeMessageId(""), "");
    assert.equal(normalizeMessageId("<>"), "");
  });
});

describe("parseMessageIds", () => {
  it("reads a space-separated References chain in order", () => {
    assert.deepEqual(parseMessageIds("<a@x> <b@x> <c@x>"), ["<a@x>", "<b@x>", "<c@x>"]);
  });

  it("survives folding across lines with tabs and commas", () => {
    assert.deepEqual(parseMessageIds("<a@x>,\n\t<b@x>\r\n <c@x>"), [
      "<a@x>",
      "<b@x>",
      "<c@x>",
    ]);
  });

  it("deduplicates while keeping first appearance", () => {
    assert.deepEqual(parseMessageIds("<a@x> <b@x> <a@x>"), ["<a@x>", "<b@x>"]);
  });

  it("accepts a lone bare id", () => {
    assert.deepEqual(parseMessageIds("a@x.com"), ["<a@x.com>"]);
  });

  it("does not mistake prose for an id", () => {
    assert.deepEqual(parseMessageIds("no ids here at all"), []);
    assert.deepEqual(parseMessageIds(""), []);
  });
});

describe("buildReferences", () => {
  it("appends the parent to the chain", () => {
    assert.equal(buildReferences(["<a@x>", "<b@x>"], "<c@x>"), "<a@x> <b@x> <c@x>");
  });

  it("does not repeat a parent already in the chain", () => {
    assert.equal(buildReferences(["<a@x>", "<c@x>"], "<c@x>"), "<a@x> <c@x>");
  });

  it("keeps the root and the tail when it has to trim, dropping the middle", () => {
    // 40 ids of ~44 chars each is far over the budget.
    const ids = Array.from({ length: 40 }, (_, i) => `<id-${i}-padding-padding-padding@mail.example.com>`);
    const out = buildReferences(ids.slice(0, 39), ids[39]);

    assert.ok(out.length <= HEADER_VALUE_MAX, `header was ${out.length} chars`);
    assert.ok(out.startsWith(ids[0]), "the root must survive — it places the conversation");
    assert.ok(out.endsWith(ids[39]), "the parent must survive — it places the message");
    assert.ok(!out.includes(ids[15]), "the middle is what gets dropped");
  });

  it("falls back to the root alone when even one more id will not fit", () => {
    const root = "<" + "r".repeat(300) + "@x>";
    const parent = "<" + "p".repeat(700) + "@x>";
    assert.equal(buildReferences([root], parent), root);
  });

  it("returns empty when there is nothing valid", () => {
    assert.equal(buildReferences([], ""), "");
    assert.equal(buildReferences(["nonsense here"], "also nonsense"), "");
  });
});

describe("baseSubject / replySubject", () => {
  it("strips one Re:", () => {
    assert.equal(baseSubject("Re: Your Rakhi page"), "Your Rakhi page");
  });

  it("strips a stack of them, in any casing, and Fwd too", () => {
    assert.equal(baseSubject("RE: Re: FWD: re: Your Rakhi page"), "Your Rakhi page");
    assert.equal(baseSubject("Fwd: Re: Your Rakhi page"), "Your Rakhi page");
  });

  it("strips the numbered form Outlook writes", () => {
    assert.equal(baseSubject("Re[2]: Your Rakhi page"), "Your Rakhi page");
  });

  it("strips non-English prefixes", () => {
    assert.equal(baseSubject("AW: Your Rakhi page"), "Your Rakhi page");
    assert.equal(baseSubject("SV: Your Rakhi page"), "Your Rakhi page");
  });

  it("collapses folded whitespace", () => {
    assert.equal(baseSubject("Re:  Your\r\n\tRakhi   page"), "Your Rakhi page");
  });

  it("does not eat a subject that merely starts with the letters", () => {
    assert.equal(baseSubject("Reminder about your page"), "Reminder about your page");
    assert.equal(baseSubject("Research on wedding cards"), "Research on wedding cards");
  });

  it("adds exactly one Re:, never a second", () => {
    assert.equal(replySubject("Your Rakhi page"), "Re: Your Rakhi page");
    assert.equal(replySubject("Re: Your Rakhi page"), "Re: Your Rakhi page");
    assert.equal(replySubject("Re: Re: Your Rakhi page"), "Re: Your Rakhi page");
  });

  it("never produces a bare 'Re: ' with nothing after it", () => {
    assert.equal(replySubject(""), "Re:");
    assert.equal(replySubject("Re:"), "Re:");
  });

  it("matches two spellings of the same subject", () => {
    assert.equal(subjectKey("RE: Your  Rakhi Page"), subjectKey("your rakhi page"));
  });
});

describe("threadingHeadersFor", () => {
  it("opens a thread when there is nothing to anchor to", () => {
    const h = threadingHeadersFor([]);
    assert.equal(h.inReplyTo, "");
    assert.equal(h.references, "");
    assert.equal(h.confidence, "none");
  });

  it("reports 'reconstructed' when the only anchor is one of our own guesses", () => {
    const h = threadingHeadersFor([
      { direction: "outbound", rfcMessageId: "<m1@email.amazonses.com>", rfcMessageIdSource: "reconstructed" },
    ]);
    assert.equal(h.inReplyTo, "<m1@email.amazonses.com>");
    assert.equal(h.references, "<m1@email.amazonses.com>");
    assert.equal(h.confidence, "reconstructed");
  });

  it("becomes exact once a real reply has been received", () => {
    const h = threadingHeadersFor([
      { direction: "outbound", rfcMessageId: "<m1@email.amazonses.com>", rfcMessageIdSource: "reconstructed" },
      {
        direction: "inbound",
        rfcMessageId: "<r1@mail.gmail.com>",
        rfcMessageIdSource: "received",
        references: ["<m1@email.amazonses.com>"],
      },
    ]);
    assert.equal(h.confidence, "exact");
    assert.equal(h.inReplyTo, "<r1@mail.gmail.com>", "the parent is the newest message");
    assert.equal(h.references, "<m1@email.amazonses.com> <r1@mail.gmail.com>");
  });

  it("anchors to the newest message even when an older one was exact", () => {
    const h = threadingHeadersFor([
      { direction: "inbound", rfcMessageId: "<r1@g>", rfcMessageIdSource: "received" },
      { direction: "outbound", rfcMessageId: "<m2@a>", rfcMessageIdSource: "reconstructed" },
    ]);
    assert.equal(h.inReplyTo, "<m2@a>");
    assert.equal(h.references, "<r1@g> <m2@a>", "the exact id stays in the ancestry");
  });

  it("skips messages that have no id at all — an unconfigured send", () => {
    const h = threadingHeadersFor([
      { direction: "outbound", rfcMessageId: "<m1@a>", rfcMessageIdSource: "reconstructed" },
      { direction: "outbound", rfcMessageId: "" },
    ]);
    assert.equal(h.inReplyTo, "<m1@a>");
  });

  it("keeps the References header inside SES's limit for a long conversation", () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({
      direction: (i % 2 === 0 ? "outbound" : "inbound") as "outbound" | "inbound",
      rfcMessageId: `<message-number-${i}-with-padding@mail.example.com>`,
      rfcMessageIdSource: "received" as const,
    }));
    const h = threadingHeadersFor(messages);
    assert.ok(h.references.length <= HEADER_VALUE_MAX, `${h.references.length} chars`);
    assert.ok(h.references.startsWith("<message-number-0-"));
  });
});

describe("stripQuotedReply", () => {
  it("cuts at Gmail's 'On … wrote:'", () => {
    const out = stripQuotedReply(
      "Honestly the price put me off.\n\nOn Mon, 1 Sep 2026 at 10:04, SubhSandesh <feedback@subhsandesh.in> wrote:\n> Hi Asha, we saw you started a page"
    );
    assert.equal(out, "Honestly the price put me off.");
  });

  it("cuts when Gmail folds the attribution onto two lines", () => {
    const out = stripQuotedReply(
      "no thanks\n\nOn Mon, 1 Sep 2026 at 10:04, SubhSandesh <feedback@subhsandesh.in>\nwrote:\n> Hi Asha"
    );
    assert.equal(out, "no thanks");
  });

  it("cuts at Outlook's original-message rule", () => {
    const out = stripQuotedReply(
      "I could not upload the photo.\n\n-----Original Message-----\nFrom: SubhSandesh"
    );
    assert.equal(out, "I could not upload the photo.");
  });

  it("cuts at Outlook's underscore rule", () => {
    const out = stripQuotedReply("Too expensive.\n\n________________________________\nFrom: SubhSandesh");
    assert.equal(out, "Too expensive.");
  });

  it("cuts at a bare quote block", () => {
    assert.equal(stripQuotedReply("sure, will finish it\n> Hi Asha\n> we saw"), "sure, will finish it");
  });

  it("cuts at a mobile signature", () => {
    assert.equal(stripQuotedReply("ok\n\nSent from my iPhone"), "ok");
  });

  it("does not cut a sentence that merely begins with 'On'", () => {
    const text = "On Diwali I wanted to send this to my family.\nBut the payment failed.";
    assert.equal(stripQuotedReply(text), text);
  });

  it("does not cut a line that merely begins with 'From'", () => {
    const text = "Fine.\nFrom what I saw the editor kept resetting.";
    assert.equal(stripQuotedReply(text), text);
  });

  it("returns the whole thing when the reply is nothing but quoted text", () => {
    const text = "> Hi Asha\n> we saw you started a page";
    assert.equal(stripQuotedReply(text), text.trim());
  });

  it("returns empty only for empty input", () => {
    assert.equal(stripQuotedReply(""), "");
    assert.equal(stripQuotedReply("   \n  "), "");
  });

  it("normalises CRLF so the cut lands on the right line", () => {
    assert.equal(stripQuotedReply("price\r\n\r\n> quoted"), "price");
  });
});

describe("stripQuotedReply — the quote-only regression", () => {
  // The first version guarded on `i === 0`, so any quote-only message whose
  // first WRITTEN line was not literally line zero got cut down to that one
  // line and the rest of the quote was thrown away.
  it("keeps a quote-only reply whole when it starts with a blank line", () => {
    const text = "\n\n> Hi Asha\n> we saw you started a page";
    assert.equal(stripQuotedReply(text), text.trim());
  });

  it("keeps a quote-only reply whole across many quoted lines", () => {
    const text = "> one\n> two\n> three\n> four";
    assert.equal(stripQuotedReply(text), text);
  });

  it("keeps a bare forward whole", () => {
    const text = "-----Original Message-----\nFrom: SubhSandesh\nSubject: Your page";
    assert.equal(stripQuotedReply(text), text);
  });

  it("still trims when there is even one written line above the quote", () => {
    assert.equal(stripQuotedReply("\n\nno thanks\n\n> Hi Asha\n> we saw"), "no thanks");
  });
});
