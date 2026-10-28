import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RSVP_LIMITS,
  RSVP_MAIL_BURST,
  HOUR_MS,
  cleanBlessing,
  cleanRsvp,
  eventIdsOf,
  isProfane,
  isWeddingSlug,
  mailPlan,
  rsvpCsv,
  rsvpTotals,
  tokenHash,
} from "./weddingShared";
import { sanitizeLovePhotos } from "../utils/loveMedia";

const CTX = { eventIds: ["haldi", "wedding"], mealEnabled: true };

describe("wedding kit: cleanRsvp", () => {
  it("needs a name and a valid answer", () => {
    assert.equal(cleanRsvp({ attending: "yes" }, CTX).ok, false);
    assert.equal(cleanRsvp({ guestName: "Asha" }, CTX).ok, false);
    assert.equal(cleanRsvp({ guestName: "Asha", attending: "perhaps" }, CTX).ok, false);
    assert.equal(cleanRsvp(null, CTX).ok, false);
    const b = cleanRsvp({ name: "Asha", attending: true }, CTX);
    assert.ok(b.ok && b.value.attending === "yes");
  });

  it("clamps the party size and zeroes it on a decline", () => {
    const yes = cleanRsvp({ guestName: "Asha", attending: "yes", guests: 99 }, CTX);
    assert.ok(yes.ok && yes.value.guests === RSVP_LIMITS.maxGuests);
    const one = cleanRsvp({ guestName: "Asha", attending: "maybe", guests: "x" }, CTX);
    assert.ok(one.ok && one.value.guests === 1);
    const no = cleanRsvp({ guestName: "Asha", attending: "no", guests: 4, events: ["haldi"], meal: "veg" }, CTX);
    assert.ok(no.ok && no.value.guests === 0 && no.value.events.length === 0 && no.value.meal === null);
  });

  it("keeps only the page's own events, deduplicated, and the meal only when enabled", () => {
    const r = cleanRsvp({ guestName: "A", attending: "yes", events: ["haldi", "haldi", "cocktail", 5], meal: "jain" }, CTX);
    assert.ok(r.ok && r.value.events.join() === "haldi" && r.value.meal === "jain");
    const off = cleanRsvp({ guestName: "A", attending: "yes", meal: "jain" }, { eventIds: [], mealEnabled: false });
    assert.ok(off.ok && off.value.meal === null);
    assert.ok(cleanRsvp({ guestName: "A", attending: "yes", meal: "beef" }, CTX).ok);
  });

  it("strips control characters, keeps Hindi, caps lengths", () => {
    const r = cleanRsvp(
      { guestName: "  राहुल\r\nशर्मा\u0007 ", attending: "yes", message: "बधाई!\r\n\r\n\r\n\r\nSee you" + "x".repeat(900), phone: "+91 98<script>" },
      CTX,
    );
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.value.guestName, "राहुल शर्मा");
    assert.ok(r.value.message.startsWith("बधाई!\n\nSee you"));
    assert.equal(r.value.message.length, RSVP_LIMITS.message);
    assert.equal(r.value.phone, "+91 98");
  });

  it("flags the honeypot and refuses abuse", () => {
    const s = cleanRsvp({ guestName: "Bot", attending: "yes", website: "http://spam" }, CTX);
    assert.ok(s.ok && s.spam);
    assert.equal(cleanRsvp({ guestName: "X", attending: "yes", message: "f u c k you" }, CTX).ok, false);
    assert.ok(isProfane("chutiya"));
    assert.ok(!isProfane("Kshitij and Scunthorpe send love"));
    assert.ok(isProfane("f.u.c.k off"));
  });
});

describe("wedding kit: blessings", () => {
  it("validates and filters", () => {
    assert.equal(cleanBlessing({ name: "A" }).ok, false);
    assert.equal(cleanBlessing({ message: "Bless you" }).ok, false);
    assert.equal(cleanBlessing({ name: "A", message: "you bitch" }).ok, false);
    const ok = cleanBlessing({ name: "Nani", message: "सदा सुखी रहो ❤️" });
    assert.ok(ok.ok && !ok.spam && ok.value.message === "सदा सुखी रहो ❤️");
  });
});

describe("wedding kit: events per tier", () => {
  const extras = { events: [{ id: "haldi", title: "Haldi" }, { id: "wedding" }, { id: "" }] };
  it("every wedding tier reads per-event RSVP ids (classic since the jharokha rebuild)", () => {
    assert.deepEqual(eventIdsOf(extras, "wedding-invitation"), ["haldi", "wedding"]);
    assert.deepEqual(eventIdsOf(extras, "wedding-invitation-premium"), ["haldi", "wedding"]);
    assert.ok(isWeddingSlug("royal-wedding-invitation") && !isWeddingSlug("happy-rose-day"));
    for (const slug of ["palace-door-wedding-invitation", "garden-wedding-invitation", "floral-wedding-invitation", "lotus-wedding-invitation", "sikh-wedding-invitation", "muslim-wedding-invitation", "christian-wedding-invitation"]) {
      assert.ok(isWeddingSlug(slug), slug);
      assert.deepEqual(eventIdsOf(extras, slug), ["haldi", "wedding"]);
    }
  });
});

describe("wedding kit: totals", () => {
  it("counts heads, maybes and per-event heads", () => {
    const t = rsvpTotals([
      { attending: "yes", guests: 3, events: ["haldi", "wedding"], meal: "veg" },
      { attending: "yes", guests: 2, events: ["wedding"], meal: null },
      { attending: "maybe", guests: 4, events: [], meal: null },
      { attending: "no", guests: 0, events: [], meal: null },
    ]);
    assert.deepEqual(
      { r: t.responses, a: t.attending, m: t.maybe, d: t.declined, h: t.heads, hm: t.headsWithMaybe },
      { r: 4, a: 2, m: 1, d: 1, h: 5, hm: 9 },
    );
    assert.deepEqual(t.perEvent, { haldi: 3, wedding: 5 });
    assert.equal(t.meals.veg, 3);
  });
});

describe("wedding kit: mail throttle", () => {
  const now = new Date("2026-12-01T10:00:00Z");
  it("single mails until the burst, then one digest an hour", () => {
    assert.equal(mailPlan({ recentCount: 1, lastDigestAt: null, now }), "single");
    assert.equal(mailPlan({ recentCount: RSVP_MAIL_BURST, lastDigestAt: null, now }), "single");
    assert.equal(mailPlan({ recentCount: RSVP_MAIL_BURST + 1, lastDigestAt: null, now }), "digest");
    assert.equal(mailPlan({ recentCount: 30, lastDigestAt: new Date(now.getTime() - 5 * 60_000), now }), "hold");
    assert.equal(mailPlan({ recentCount: 30, lastDigestAt: new Date(now.getTime() - HOUR_MS), now }), "digest");
  });
});

describe("wedding kit: CSV", () => {
  it("has a BOM, event columns, and is formula-safe", () => {
    const csv = rsvpCsv(
      [
        { guestName: "=HYPERLINK(1)", phone: "+91 1", attending: "yes", guests: 2, events: ["haldi"], meal: "veg", message: 'He said "hi", ok', createdAt: new Date("2026-01-01T00:00:00Z") },
      ],
      { haldi: "Haldi", wedding: "Wedding" },
    );
    assert.ok(csv.startsWith("﻿Name,Phone,Attending,Guests,Haldi,Wedding,Meal,Message,Responded at\r\n"));
    assert.ok(csv.includes("'=HYPERLINK(1),'+91 1,yes,2,yes,,veg,\"He said \"\"hi\"\", ok\",2026-01-01T00:00:00.000Z"));
  });
  it("hashes tokens deterministically", () => {
    assert.equal(tokenHash("a"), tokenHash("a"));
    assert.notEqual(tokenHash("a"), tokenHash("b"));
  });
});

describe("love photos: masonry hints", () => {
  it("keeps span and natural size, drops junk", async () => {
    const out = await sanitizeLovePhotos(
      [
        { url: "https://cdn.subhsandesh.in/a.webp", span: "wide", w: 1600.4, h: 900 },
        { url: "https://cdn.subhsandesh.in/b.webp", span: "normal", w: 800 },
        { url: "https://cdn.subhsandesh.in/c.webp", span: "huge", w: null, h: null },
      ],
      "test",
    );
    assert.deepEqual(out[0], { url: "https://cdn.subhsandesh.in/a.webp", span: "wide", w: 1600, h: 900 });
    assert.deepEqual(out[1], { url: "https://cdn.subhsandesh.in/b.webp" });
    assert.deepEqual(out[2], { url: "https://cdn.subhsandesh.in/c.webp" });
  });
});
