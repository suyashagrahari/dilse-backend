import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanScrollExtras, guestExtrasOf, httpsUrl, mirrorScrollExtras, photoUrl } from "./christianScrollExtras";

describe("christian-wedding-2 scrollExtras", () => {
  it("ignores anything that is not an object", () => {
    assert.equal(cleanScrollExtras(null), undefined);
    assert.equal(cleanScrollExtras("x"), undefined);
    assert.equal(cleanScrollExtras([1]), undefined);
  });

  it("fills defaults for an empty object", () => {
    const x = cleanScrollExtras({})!;
    assert.equal(x.theme, "blossom");
    assert.equal(x.secondLang, "none");
    assert.equal(x.rsvpOn, true);
    assert.equal(x.maxGuests, 4);
    assert.deepEqual(x.events, []);
    assert.deepEqual(x.music, { youtubeId: "", start: 0, enabled: true });
  });

  it("whitelists keys and clamps values", () => {
    const x = cleanScrollExtras({
      evil: "$where",
      theme: "noir",
      maxGuests: 99,
      upiId: "not a vpa",
      videoUrl: "javascript:alert(1)",
      liveUrl: "http://insecure.example/live",
      music: { youtubeId: "rtOvBOTyX00", start: 99999 },
      hashtag: "#Anna Weds Joel",
    })!;
    assert.equal("evil" in x, false);
    assert.equal(x.theme, "blossom");
    assert.equal(x.maxGuests, 10);
    assert.equal(x.upiId, "");
    assert.equal(x.videoUrl, "");
    assert.equal(x.liveUrl, "");
    assert.deepEqual(x.music, { youtubeId: "rtOvBOTyX00", start: 3600, enabled: true });
    assert.equal(x.hashtag, "#AnnaWedsJoel");
  });

  it("keeps event ids, generates missing or duplicate ones, drops empty rows", () => {
    const x = cleanScrollExtras({
      events: [
        { id: "mass", title: "Holy Matrimony", date: "2027-01-16", time: "15:30", mapUrl: "https://maps.app.goo.gl/abc", dressColor: "#F3EBDD" },
        { id: "mass", title: "Reception", date: "16 Jan", time: "7 pm" },
        { title: "", date: "", venue: "" },
      ],
    })!;
    const ev = x.events as Record<string, string>[];
    assert.equal(ev.length, 2);
    assert.equal(ev[0].id, "mass");
    assert.notEqual(ev[1].id, "mass");
    assert.match(ev[1].id, /^e[0-9a-f]{6}$/);
    assert.equal(ev[1].date, "");
    assert.equal(ev[1].time, "");
    assert.equal(ev[0].dressColor, "#f3ebdd");
  });

  it("accepts only safe photo sources", () => {
    assert.equal(photoUrl("/wedding-v3/christian2/demo/confetti.webp"), "/wedding-v3/christian2/demo/confetti.webp");
    assert.equal(photoUrl("/wedding-v3/../secret.webp"), "");
    assert.equal(photoUrl("data:image/webp;base64,AAAA"), "data:image/webp;base64,AAAA");
    assert.equal(photoUrl("data:text/html;base64,AAAA"), "");
    assert.equal(photoUrl("https://cdn.subhsandesh.in/a.webp"), "https://cdn.subhsandesh.in/a.webp");
    assert.equal(httpsUrl("ftp://x"), "");
  });

  it("mirrors photos into the shared flat fields", () => {
    const x = cleanScrollExtras({
      gallery: [{ url: "https://cdn.subhsandesh.in/1.webp", caption: "Kochi" }, { url: "" }],
      bridePhoto: { url: "https://cdn.subhsandesh.in/b.webp" },
      couplePhoto: { url: "" },
    })!;
    const doc: Record<string, unknown> = { sharePhoto: "old" };
    mirrorScrollExtras(doc, x);
    assert.deepEqual(doc.galleryImages, [{ src: "https://cdn.subhsandesh.in/1.webp", alt: "Kochi" }]);
    assert.equal(doc.bridePhoto, "https://cdn.subhsandesh.in/b.webp");
    assert.equal(doc.groomPhoto, "");
    assert.equal(doc.sharePhoto, "https://cdn.subhsandesh.in/1.webp");
  });

  it("gives the guest routes event ids for new and old pages alike", () => {
    assert.deepEqual(guestExtrasOf({ scrollExtras: { events: [{ id: "mass", title: "Holy Matrimony" }], rsvpMeal: true } }), {
      events: [{ id: "mass", title: "Holy Matrimony" }],
      rsvpMeal: true,
    });
    assert.deepEqual(
      guestExtrasOf({ events: [{ name: "Ceremony" }, { name: "Brunch", disabled: true }, { name: "Reception" }] }),
      { events: [{ id: "f1", title: "Ceremony" }, { id: "f2", title: "Reception" }], rsvpMeal: false },
    );
  });
});
