import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, describeFilters, isSendable, parseFilters, type AudienceRow } from "./audience.service";
import { parseBroadcastDraft, STRAY_PLACEHOLDER } from "./broadcastAi.service";
import { mergeFirstName, renderBroadcast, safeCtaUrl } from "../utils/broadcastEmail";

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

const row = (over: Partial<AudienceRow>): AudienceRow => ({
  userId: Math.random().toString(16).slice(2),
  name: "Priya Sharma",
  email: "priya@example.com",
  verified: true,
  provider: "local",
  status: "active",
  optedOut: false,
  joinedAt: ago(100),
  pages: 0,
  published: 0,
  templates: [],
  lastPageAt: null,
  feedbackCount: 0,
  avgRating: null,
  ratings: [],
  lastRating: null,
  commentCount: 0,
  paidOrders: 0,
  lastEmailedAt: null,
  ...over,
});

describe("isSendable", () => {
  it("refuses unverified, suspended, opted-out and malformed addresses", () => {
    assert.equal(isSendable(row({})), true);
    assert.equal(isSendable(row({ verified: false })), false);
    assert.equal(isSendable(row({ status: "suspended" })), false);
    assert.equal(isSendable(row({ optedOut: true })), false);
    assert.equal(isSendable(row({ email: "not-an-email" })), false);
  });
});

describe("parseFilters", () => {
  it("defaults to verified people and drops junk", () => {
    const f = parseFilters({ ratings: "1,3,9,x", pages: "lots", sort: "evil" });
    assert.equal(f.verified, "verified");
    assert.deepEqual(f.ratings, [1, 3]);
    assert.equal(f.pages, "any");
    assert.equal(f.sort, "joined");
  });
  it("accepts ratings as an array (the send route's JSON body)", () => {
    assert.deepEqual(parseFilters({ ratings: [5, 4, 4] }).ratings, [4, 5]);
  });
});

describe("applyFilters", () => {
  const rows = [
    row({ userId: "a", ratings: [1], feedbackCount: 1, avgRating: 1, pages: 1, published: 1, lastPageAt: ago(2) }),
    row({ userId: "b", ratings: [3, 5], feedbackCount: 2, avgRating: 4, pages: 6, published: 0, lastPageAt: ago(40), commentCount: 1 }),
    row({ userId: "c", pages: 0, verified: false }),
    row({ userId: "d", pages: 2, published: 2, paidOrders: 1, lastEmailedAt: ago(3), provider: "google", joinedAt: ago(3) }),
    row({ userId: "e", optedOut: true, ratings: [1], feedbackCount: 1 }),
  ];
  const ids = (f: Record<string, unknown>) => applyFilters(rows, parseFilters(f)).map((r) => r.userId).sort();

  it("hides unverified and opted-out people by default", () => assert.deepEqual(ids({}), ["a", "b", "d"]));
  it("shows unverified when asked, never the opted-out", () => assert.deepEqual(ids({ verified: "all" }), ["a", "b", "c", "d"]));
  it("matches anyone who gave ANY of the chosen stars", () => assert.deepEqual(ids({ ratings: "3" }), ["b"]));
  it("combines rating chips as OR", () => assert.deepEqual(ids({ ratings: "1,5" }), ["a", "b"]));
  it("buckets page counts", () => {
    assert.deepEqual(ids({ pages: "5+" }), ["b"]);
    assert.deepEqual(ids({ pages: "2-4" }), ["d"]);
    assert.deepEqual(ids({ pages: "0", verified: "all" }), ["c"]);
  });
  it("'drafts only' means made pages, published none", () => assert.deepEqual(ids({ published: "no" }), ["b"]));
  it("filters feedback, comments, payments, provider and recency", () => {
    assert.deepEqual(ids({ feedback: "none" }), ["d"]);
    assert.deepEqual(ids({ feedback: "comment" }), ["b"]);
    assert.deepEqual(ids({ paid: "yes" }), ["d"]);
    assert.deepEqual(ids({ provider: "google" }), ["d"]);
    assert.deepEqual(ids({ active: "7" }), ["a"]);
    assert.deepEqual(ids({ active: "idle30" }), ["b"]);
    assert.deepEqual(ids({ joined: "7" }), ["d"]);
    assert.deepEqual(ids({ emailed: "not14" }), ["a", "b"]);
  });
  it("lists only opted-out people when asked", () => assert.deepEqual(ids({ optout: "only" }), ["e"]));
  it("describes a filter in words", () => {
    assert.equal(describeFilters(parseFilters({})), "Everyone");
    assert.equal(describeFilters(parseFilters({ ratings: "1,2", pages: "5+" })), "Rated 1, 2★ · 5+ pages");
  });
});

describe("parseBroadcastDraft", () => {
  it("keeps a clean draft and strips a sign-off the model added anyway", () => {
    const d = parseBroadcastDraft(JSON.stringify({
      subject: "Our Diwali template is here",
      body: "Hi {{firstName}},\n\nWe just launched a Diwali template you can share in two minutes.\n\nWith love,\nTeam SubhSandesh",
      ctaLabel: "Try it now",
    }));
    assert.equal(d.subject, "Our Diwali template is here");
    assert.ok(!/Team SubhSandesh/.test(d.body));
    assert.ok(d.body.startsWith("Hi {{firstName}},"));
  });
  it("refuses a draft that left a blank", () => {
    assert.throws(() => parseBroadcastDraft(JSON.stringify({ subject: "Hi", body: "Hi {{firstName}},\n\nJoin us on [date] for a long enough message here.", ctaLabel: "" })));
    assert.throws(() => parseBroadcastDraft(JSON.stringify({ subject: "Hi", body: "Hi {{firstName}},\n\nClick {{link}} to see it, it is long enough now.", ctaLabel: "" })));
  });
  it("only {{firstName}} is a legal merge field", () => {
    assert.equal(STRAY_PLACEHOLDER.test("Hi {{firstName}},"), false);
    assert.equal(STRAY_PLACEHOLDER.test("Hi {{ firstName }},"), false);
    assert.equal(STRAY_PLACEHOLDER.test("Hi {{name}},"), true);
  });
});

describe("renderBroadcast", () => {
  it("fills the first name, or 'there' when the name is unusable", () => {
    assert.equal(mergeFirstName("Hi {{firstName}},", "Rohan Mehta"), "Hi Rohan,");
    assert.equal(mergeFirstName("Hi {{firstName}},", "-- SYSTEM"), "Hi there,");
  });
  it("always carries the SubhSandesh signature and the opt-out line, in both parts", () => {
    const out = renderBroadcast({ subject: "News", body: "Hi {{firstName}},\n\nSomething new." }, { name: "Asha" }, "feedback@subhsandesh.in");
    for (const part of [out.html, out.text]) {
      assert.match(part, /Team SubhSandesh/);
      assert.match(part, /subhsandesh\.in/);
      assert.match(part, /unsubscribe/);
    }
    assert.match(out.text, /^Hi Asha,/);
  });
  it("escapes the body and only renders an http(s) button", () => {
    const out = renderBroadcast({ subject: "x", body: "Hi <script>alert(1)</script>", ctaLabel: "Go", ctaUrl: "javascript:alert(1)" }, { name: "" }, "f@s.in");
    assert.ok(!out.html.includes("<script>"));
    assert.ok(!out.html.includes("javascript:"));
    assert.equal(safeCtaUrl("https://subhsandesh.in/diwali"), "https://subhsandesh.in/diwali");
  });
});
