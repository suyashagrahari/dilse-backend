import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_EVENT_ID,
  RECEPTION_EXTRA_FIELDS,
  receptionAsGuestPage,
  receptionRsvpEvents,
  sanitizeReceptionEvents,
  sanitizeReceptionExtras,
  sanitizeReceptionGallery,
  sanitizeReceptionPerson,
} from "./receptionPage";
import { eventIdsOf, isWeddingSlug, WEDDING_TIER_LIMITS } from "./weddingShared";
import { reception } from "./aiFill/reception";
import { validateSchema } from "./aiFill/types";
import { SCHEMAS } from "./aiFill/registry.generated";

describe("reception: extra fields", () => {
  it("returns only the keys the body carries (an older client's update touches nothing new)", () => {
    assert.deepEqual(sanitizeReceptionExtras({ brideName: "Priya", venue: "x" }), {});
    assert.deepEqual(Object.keys(sanitizeReceptionExtras({ lang: "hi", hashtag: "#PriyArjun" })).sort(), ["hashtag", "lang"]);
  });

  it("coerces and clamps every value", () => {
    const out = sanitizeReceptionExtras({
      lang: "fr",
      maxGuests: "99",
      rsvpMeal: "yes",
      videoUrl: "http://youtube.com/x",
      liveUrl: "https://youtube.com/live/abc",
      upiId: "not a vpa",
      rsvpBy: "next week",
      invitation: "x".repeat(5000),
      music: { mode: "rave", youtubeId: "2Vv-BfVoq4g", start: 9999 },
      theme: "blush<script>",
    });
    assert.equal(out.lang, "en");
    assert.equal(out.maxGuests, 10);
    assert.equal(out.rsvpMeal, false);
    assert.equal(out.videoUrl, "");
    assert.equal(out.liveUrl, "https://youtube.com/live/abc");
    assert.equal(out.upiId, "");
    assert.equal(out.rsvpBy, "");
    assert.equal((out.invitation as string).length, 1200);
    assert.deepEqual(out.music, { mode: "", youtubeId: "2Vv-BfVoq4g", start: 600 });
    assert.equal(out.theme, "blushscript");
  });

  it("keeps event ids stable, unique and never derived from the title", () => {
    const evs = sanitizeReceptionEvents([
      { title: "Reception", date: "2026-03-15", time: "19:30" },
      { id: "cocktails", title: "Cocktails", time: "7pm" },
      { id: "cocktails", title: "After-party" },
      { title: "", venue: "", date: "" },
      "junk",
    ]);
    assert.deepEqual(evs.map((e) => e.id), [LEGACY_EVENT_ID, "cocktails", "cocktails-3"]);
    assert.equal(evs[1].time, "");
    assert.equal(evs[0].time, "19:30");
  });

  it("drops empty rows and caps the lists", () => {
    const out = sanitizeReceptionExtras({
      story: [{ title: "Met", line: "They met." }, { title: "", line: "" }],
      contacts: [{ name: "Rohit", phone: "+91 98290 11223" }, { name: "No phone" }],
      things: Array.from({ length: 10 }, (_, i) => ({ head: "H", text: `t${i}` })),
    });
    assert.equal((out.story as unknown[]).length, 1);
    assert.equal((out.contacts as unknown[]).length, 1);
    assert.equal((out.things as unknown[]).length, 6);
  });

  it("clamps portrait framing and gallery numbers, keeping old gallery rows as they were", () => {
    assert.deepEqual(sanitizeReceptionPerson({ name: "Priya", cropX: 140, scale: 20 }), { name: "Priya", cropX: 100, scale: 100 });
    const g = sanitizeReceptionGallery([
      { src: "https://cdn/x.webp", alt: "Couple", span: "col-span-2", category: "couple" },
      { src: "", alt: "empty" },
      { src: "/wedding-v3/demo/rw-07.webp", alt: "", span: "wide", category: "", cropY: 30, w: 1200, h: 800 },
    ]) as Record<string, unknown>[];
    assert.equal(g.length, 2);
    assert.deepEqual(g[0], { src: "https://cdn/x.webp", alt: "Couple", span: "col-span-2", category: "couple" });
    assert.equal(g[1].cropY, 30);
    assert.equal(g[1].w, 1200);
  });

  it("names every extra field the model stores", () => {
    assert.ok(RECEPTION_EXTRA_FIELDS.includes("events"));
    assert.ok(RECEPTION_EXTRA_FIELDS.includes("music"));
  });
});

describe("reception: RSVPs through the wedding kit", () => {
  it("is a wedding slug with per-event RSVPs and its own blessings wall", () => {
    assert.ok(isWeddingSlug("reception"));
    assert.equal(WEDDING_TIER_LIMITS.reception.rsvpPerEvent, true);
    assert.equal(WEDDING_TIER_LIMITS.reception.blessings, false);
  });

  it("an older page (no events) still takes RSVPs for its one reception", () => {
    assert.deepEqual(receptionRsvpEvents({}), [{ id: LEGACY_EVENT_ID, title: "Reception" }]);
    const page = receptionAsGuestPage({
      _id: "p1",
      userId: "u1",
      shareId: "s1",
      brideName: "Priya",
      groomName: "Arjun",
      comparePassword: async () => true,
    });
    assert.ok(page);
    assert.equal(page.recipientName, "Priya");
    assert.deepEqual(eventIdsOf(page.extras, "reception"), [LEGACY_EVENT_ID]);
  });

  it("a new page offers its own event ids", () => {
    const page = receptionAsGuestPage({
      _id: "p1",
      userId: "u1",
      shareId: "s1",
      events: [{ id: "reception", title: "Reception" }, { id: "after", title: "After-party" }],
      rsvpMeal: true,
      password: "hash",
      comparePassword: async (c: string) => c === "ok",
    });
    assert.ok(page);
    assert.deepEqual(eventIdsOf(page.extras, "reception"), ["reception", "after"]);
    assert.equal((page.extras as { rsvpMeal: boolean }).rsvpMeal, true);
    assert.equal(page.password, "hash");
  });

  it("passes null through", () => {
    assert.equal(receptionAsGuestPage(null), null);
  });
});

describe("reception: AI fill schema", () => {
  it("is valid, registered and within the field cap", () => {
    assert.deepEqual(validateSchema(reception), []);
    assert.ok(SCHEMAS.some((s) => s.slug === "reception"));
    assert.ok(reception.fields.length <= 40);
  });

  it("never declares media, music, maps, money or livestream", () => {
    for (const f of reception.fields) {
      assert.ok(!/photo|image|src|music|map|upi|live|video|theme/i.test(f.path), f.path);
    }
  });
});
