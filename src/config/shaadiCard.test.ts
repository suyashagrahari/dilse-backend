import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SHAADI_LIMITS,
  cleanNewFields,
  dialOf,
  displayDate,
  displayTime,
  guestPageOf,
  normalizeContacts,
  normalizeEvents,
  normalizeGallery,
  normalizeStory,
} from "./shaadiCard";
import { eventIdsOf, isWeddingSlug, WEDDING_TIER_LIMITS } from "./weddingShared";
import { shaadiCard } from "./aiFill/shaadi-card";
import { SCHEMAS } from "./aiFill/registry.generated";
import { FILL_LIMITS, parsePath } from "./aiFill/types";

// A page as it was stored before the 2026-10 rebuild (no ids, no ISO values).
const OLD_EVENTS = [
  { name: "Wedding", hindi: "विवाह", icon: "🔥", date: "15 Apr", time: "11 AM", venue: "Fateh Sagar Palace", details: "Vows", accent: "x", disabled: false },
  { name: "Haldi", hindi: "हल्दी", icon: "🌿", date: "13 Apr", time: "10 AM", venue: "Mehta Residence", details: "", accent: "y", disabled: false },
  { name: "Sangeet", hindi: "संगीत", icon: "🎶", date: "", time: "7 PM", venue: "", details: "", accent: "z", disabled: true },
];

describe("shaadi-card: events", () => {
  it("keeps an old page's events, sorts them by the old display strings and ids them e<index>", () => {
    const out = normalizeEvents(OLD_EVENTS);
    assert.deepEqual(out.map((e) => e.name), ["Haldi", "Wedding", "Sangeet"]);
    // Ids follow the order the client sent; the disabled one sorts last.
    assert.deepEqual(out.map((e) => e.id), ["e1", "e0", "e2"]);
    assert.equal(out[0].date, "13 Apr");
    assert.equal(out[0].time, "10 AM");
    assert.equal(out[0].isoDate, "");
    assert.equal(out[0].details, "");
  });

  it("derives the display strings from the new ISO values and keeps the new fields", () => {
    const [e] = normalizeEvents([
      { id: "sangeet", name: "Sangeet", isoDate: "2027-02-19", startTime: "19:30", endTime: "23:00", venue: "Durbar Hall", address: "City Palace, Udaipur", mapUrl: "https://maps.app.goo.gl/abc", dressCode: "Indo-western", dressColor: "#7B3FA0" },
    ]);
    assert.equal(e.id, "sangeet");
    assert.equal(e.date, "19 Feb");
    assert.equal(e.time, "7:30 PM");
    assert.equal(e.endTime, "23:00");
    assert.equal(e.mapUrl, "https://maps.app.goo.gl/abc");
    assert.equal(e.dressColor, "#7B3FA0");
  });

  it("refuses bad dates, times, links and colours, and de-duplicates ids", () => {
    const out = normalizeEvents([
      { id: "a", name: "A", isoDate: "2027-02-30", startTime: "25:00", mapUrl: "javascript:alert(1)", dressColor: "red" },
      { id: "a", name: "B", isoDate: "2027-02-20" },
    ]);
    assert.equal(out.find((e) => e.name === "A")?.isoDate, "");
    assert.equal(out.find((e) => e.name === "A")?.startTime, "");
    assert.equal(out.find((e) => e.name === "A")?.mapUrl, "");
    assert.equal(out.find((e) => e.name === "A")?.dressColor, "");
    const ids = out.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("sorts ISO-dated events before undated ones and caps the list", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `F${i}`, isoDate: `2027-03-${String(20 - i).padStart(2, "0")}` }));
    const out = normalizeEvents(many);
    assert.equal(out.length, SHAADI_LIMITS.events);
    assert.equal(out[0].name, "F7");
  });

  it("gives an empty request the six default functions", () => {
    assert.equal(normalizeEvents(undefined).length, 6);
  });

  it("formats display strings", () => {
    assert.equal(displayDate("2027-12-01"), "1 Dec");
    assert.equal(displayTime("00:05"), "12:05 AM");
    assert.equal(displayTime("12:00"), "12 PM");
  });
});

describe("shaadi-card: gallery, story, contacts", () => {
  it("keeps an old {src, alt} photo as it was and the new crop fields when sent", () => {
    assert.deepEqual(normalizeGallery([{ src: "https://cdn.x/a.webp", alt: "Couple" }]), [{ src: "https://cdn.x/a.webp", alt: "Couple" }]);
    const [p] = normalizeGallery([{ src: "/wedding-v3/demo/rw-01.webp", alt: "", cropX: 140, cropY: 30, scale: 50, span: "wide", w: 1024, h: 768, caption: "Haldi" }]);
    assert.deepEqual(p, { src: "/wedding-v3/demo/rw-01.webp", alt: "", cropX: 100, cropY: 30, scale: 100, span: "wide", w: 1024, h: 768, caption: "Haldi" });
    assert.equal(normalizeGallery([{ src: "" }, null]).length, 0);
  });

  it("drops empty story chapters and contacts without a valid Indian mobile", () => {
    assert.equal(normalizeStory([{ title: "", line: "", photo: "" }, { title: "How we met", line: "At a bus stop." }]).length, 1);
    const cs = normalizeContacts([
      { name: "Rohan", relation: "Brother", phone: "+91 98765 43210" },
      { name: "Nobody", phone: "12345" },
      { name: "", phone: "9876543210" },
    ]);
    assert.deepEqual(cs.map((c) => c.name), ["Rohan"]);
    assert.equal(dialOf("098765 43210"), "919876543210");
    assert.equal(dialOf("5876543210"), "");
  });
});

describe("shaadi-card: the new top-level fields", () => {
  it("cleans only what was sent", () => {
    assert.deepEqual(cleanNewFields({ brideName: "A" }), {});
    const out = cleanNewFields({
      theme: "noir",
      lang: "fr",
      videoUrl: "https://evil.example/x",
      liveUrl: "http://insecure.example",
      upiId: "khanna@okhdfc",
      musicMode: "youtube",
      musicYoutubeId: "OzEL4CwbPew",
      musicStart: 9999,
      rsvpOn: false,
      maxGuests: 40,
      hashtag: "#Ishi Weds Kabir",
      rsvpBy: "2027-02-01",
      brideCrop: { x: 20, y: 300, scale: 150 },
    });
    assert.equal(out.theme, "marigold");
    assert.equal(out.lang, "en");
    assert.equal(out.videoUrl, "");
    assert.equal(out.liveUrl, "");
    assert.equal(out.upiId, "khanna@okhdfc");
    assert.equal(out.musicYoutubeId, "OzEL4CwbPew");
    assert.equal(out.musicStart, 600);
    assert.equal(out.rsvpOn, false);
    assert.equal(out.maxGuests, 10);
    assert.equal(out.hashtag, "#IshiWedsKabir");
    assert.equal(out.rsvpBy, "2027-02-01");
    assert.deepEqual(out.brideCrop, { x: 20, y: 100, scale: 150 });
    assert.equal(cleanNewFields({ videoUrl: "https://youtu.be/abcdefghijk" }).videoUrl, "https://youtu.be/abcdefghijk");
  });
});

describe("shaadi-card: the wedding kit's RSVP routes", () => {
  it("is a wedding slug with per-function RSVP and no kit blessings wall", () => {
    assert.ok(isWeddingSlug("shaadi-card"));
    assert.equal(WEDDING_TIER_LIMITS["shaadi-card"].rsvpPerEvent, true);
    assert.equal(WEDDING_TIER_LIMITS["shaadi-card"].blessings, false);
  });

  it("projects a stored page (old or new) into the kit's guest page", async () => {
    const page = guestPageOf({
      _id: "p1",
      userId: "u1",
      shareId: "s1",
      brideName: "Ananya",
      groomName: "Arjun",
      events: [{ name: "Haldi" }, { id: "wed", name: "Wedding" }, { name: "Sangeet", disabled: true }],
      password: "",
      comparePassword: async () => true,
    });
    assert.equal(page.recipientName, "Ananya");
    assert.equal(page.senderName, "Arjun");
    assert.deepEqual(page.extras.events, [{ id: "e0", title: "Haldi" }, { id: "wed", title: "Wedding" }]);
    assert.deepEqual(eventIdsOf(page.extras, "shaadi-card"), ["e0", "wed"]);
    assert.equal(await page.comparePassword("x"), true);
  });
});

describe("shaadi-card: AI fill schema", () => {
  it("is registered, within the field cap, and declares only plain paths", () => {
    assert.ok(SCHEMAS.includes(shaadiCard));
    assert.equal(shaadiCard.slug, "shaadi-card");
    assert.ok(shaadiCard.fields.length <= FILL_LIMITS.maxFields, `${shaadiCard.fields.length} fields`);
    const paths = shaadiCard.fields.map((f) => f.path);
    assert.equal(new Set(paths).size, paths.length);
    for (const p of paths) assert.ok(parsePath(p), p);
  });
});
