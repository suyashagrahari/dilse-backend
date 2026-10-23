import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanChristianExtras,
  cleanGallery,
  eventEpoch,
  guestExtrasOf,
  httpsUrl,
  normalizeChristianEvents,
  phone,
  photoRef,
  upiId,
  youTubeId,
} from "./christianWedding";
import { WEDDING_TIER_LIMITS, eventIdsOf, isWeddingSlug } from "./weddingShared";

describe("christian-wedding: events", () => {
  it("keeps an old page's events readable and gives each one an id once", () => {
    const old = [
      { name: "Ceremony", hindi: "", icon: "⛪", date: "22 Jul", time: "4 PM", venue: "St. Mary's", details: "Arrive early", accent: "x", disabled: false },
      { name: "Rehearsal Dinner", hindi: "", icon: "🍽️", date: "21 Jul", time: "6 PM", venue: "Bistro", details: "", accent: "y", disabled: false },
      { name: "Reserved", hindi: "", icon: "📌", date: "", time: "", venue: "", details: "", accent: "z", disabled: true },
    ];
    const out = normalizeChristianEvents(old);
    assert.deepEqual(out.map((e) => e.name), ["Rehearsal Dinner", "Ceremony", "Reserved"]);
    assert.ok(out.every((e) => /^[\w-]+$/.test(e.id)));
    assert.equal(new Set(out.map((e) => e.id)).size, 3);
    assert.equal(out[1].venue, "St. Mary's");
    assert.equal(out[1].details, "Arrive early");
    // A second save keeps the ids it was given.
    const again = normalizeChristianEvents(out);
    assert.deepEqual(again.map((e) => e.id), out.map((e) => e.id));
  });

  it("sorts by the ISO date when there is one and cleans the new fields", () => {
    const out = normalizeChristianEvents([
      { id: "rec", name: "Reception", isoDate: "2026-12-12", time: "19:00", mapUrl: "javascript:alert(1)", dressColor: "#AABBCC" },
      { id: "mass", name: "Nuptial Mass", isoDate: "2026-12-12", time: "10:30", mapUrl: "https://maps.app.goo.gl/abc", dressColor: "red" },
      { id: "mass", name: "Brunch", isoDate: "2026-12-13", time: "10:00" },
    ]);
    assert.deepEqual(out.map((e) => e.name), ["Nuptial Mass", "Reception", "Brunch"]);
    assert.equal(out[0].mapUrl, "https://maps.app.goo.gl/abc");
    assert.equal(out[1].mapUrl, "");
    assert.equal(out[1].dressColor, "#aabbcc");
    assert.equal(out[0].dressColor, "");
    assert.notEqual(out[2].id, "mass", "a duplicate id is re-keyed");
  });

  it("reads the old free-text date in the current year", () => {
    assert.ok(eventEpoch({ isoDate: "", date: "21 Jul", time: "6 PM" }) < eventEpoch({ isoDate: "", date: "22 Jul", time: "4 PM" }));
    assert.equal(eventEpoch({ isoDate: "", date: "", time: "" }), Number.MAX_SAFE_INTEGER);
  });
});

describe("christian-wedding: extras", () => {
  it("cleans only the keys the body carries (an old editor's save touches none)", () => {
    assert.deepEqual(cleanChristianExtras({ brideName: "Anna" }), {});
    const out = cleanChristianExtras({
      theme: "noir",
      secondLang: "ml",
      scripture: { text: "Love is patient, love is kind.", ref: "1 Corinthians 13:4" },
      videoUrl: "https://youtu.be/dQw4w9WgXcQ",
      liveUrl: "http://example.com/live",
      upiId: "anna joel@okaxis",
      contacts: [{ name: "Thomas", relation: "Uncle", phone: "+91 98470 12345" }, { name: "No phone", phone: "12" }],
      music: { mode: "youtube", youtubeId: "nope", start: 9999 },
      maxGuests: 40,
      rsvpBy: "2026-11-30",
      story: [{ title: "", line: "" }, { title: "A choir practice", line: "They met singing.", cropX: 120 }],
    });
    assert.equal(out.theme, "");
    assert.equal(out.secondLang, "ml");
    assert.equal(out.scripture?.ref, "1 Corinthians 13:4");
    assert.equal(out.videoUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(out.liveUrl, "");
    assert.equal(out.upiId, "annajoel@okaxis");
    assert.deepEqual(out.contacts, [{ name: "Thomas", relation: "Uncle", phone: "+919847012345" }]);
    assert.deepEqual(out.music, { mode: "track", youtubeId: "", start: 600 });
    assert.equal(out.maxGuests, 10);
    assert.equal(out.rsvpBy, "2026-11-30");
    assert.equal(out.story?.length, 1);
    assert.equal(out.story?.[0].cropX, 100);
  });

  it("validates links, ids and phones", () => {
    assert.equal(httpsUrl("https://maps.google.com/?q=x"), "https://maps.google.com/?q=x");
    assert.equal(httpsUrl("ftp://x"), "");
    assert.equal(youTubeId("https://www.youtube.com/watch?v=abcdefghijk&t=3"), "abcdefghijk");
    assert.equal(youTubeId("not a link"), "");
    assert.equal(upiId("bad"), "");
    assert.equal(phone("98470 12345"), "9847012345");
    assert.equal(phone("123"), "");
    assert.equal(photoRef("/wedding-v3/demo/rw-16.webp"), "/wedding-v3/demo/rw-16.webp");
    assert.equal(photoRef("/etc/passwd"), "");
    assert.ok(photoRef("data:image/webp;base64,AAAA").startsWith("data:image/"));
  });

  it("keeps the masonry framing on gallery rows and drops empty ones", () => {
    const g = cleanGallery([{ src: "https://cdn.subhsandesh.in/a.webp", alt: "Us", size: "wide", cropX: 30, w: 1200, h: 800 }, { src: "" }, { src: "https://x/b.webp", size: "huge" }]);
    assert.equal(g.length, 2);
    assert.deepEqual(g[0], { src: "https://cdn.subhsandesh.in/a.webp", alt: "Us", cropX: 30, cropY: 50, scale: 100, size: "wide", w: 1200, h: 800 });
    assert.equal(g[1].size, "normal");
  });
});

describe("christian-wedding: RSVPs through the shared guest controller", () => {
  it("is a wedding slug with per-event RSVPs and its own blessings wall", () => {
    assert.ok(isWeddingSlug("christian-wedding"));
    assert.equal(WEDDING_TIER_LIMITS["christian-wedding"].rsvpPerEvent, true);
    assert.equal(WEDDING_TIER_LIMITS["christian-wedding"].blessings, false);
  });

  it("offers only enabled events that have an id", () => {
    const extras = guestExtrasOf({
      events: [
        { id: "mass", name: "Nuptial Mass", disabled: false },
        { id: "brunch", name: "Brunch", disabled: true },
        { name: "No id yet", disabled: false },
      ],
      rsvpMeal: true,
    });
    assert.deepEqual(extras, { events: [{ id: "mass", title: "Nuptial Mass" }], rsvpMeal: true });
    assert.deepEqual(eventIdsOf(extras, "christian-wedding"), ["mass"]);
  });
});
