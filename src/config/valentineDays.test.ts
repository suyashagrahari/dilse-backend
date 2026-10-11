import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_DAY_SLUGS,
  PREMIUM_BASE,
  PREMIUM_DAY_SLUGS,
  VALENTINE_DAYS,
  VALENTINE_DAY_SLUGS,
  baseDaySlug,
  isPremiumDaySlug,
  reactionWrite,
  type PremiumDaySlug,
  sanitizeExtras,
  sanitizeGifSlots,
  sanitizeMusic,
} from "./valentineDays";

describe("sanitizeMusic", () => {
  it("defaults to the built-in melody", () => {
    assert.deepEqual(sanitizeMusic({}), { music: true, musicMode: "melody", musicYoutubeId: "", musicStart: 0 });
  });
  it("keeps a valid YouTube id and start, and derives music=true", () => {
    assert.deepEqual(sanitizeMusic({ musicMode: "youtube", musicYoutubeId: "2Vv-BfVoq4g", musicStart: 42.4 }), {
      music: true, musicMode: "youtube", musicYoutubeId: "2Vv-BfVoq4g", musicStart: 42,
    });
  });
  it("never stores a URL or a malformed id; youtube without an id falls back to melody", () => {
    for (const bad of ["https://youtu.be/2Vv-BfVoq4g", "2Vv-BfVoq4", "2Vv-BfVoq4g1", "<script>x</s", "2Vv BfVoq4g", 12345678901]) {
      const m = sanitizeMusic({ musicMode: "youtube", musicYoutubeId: bad as unknown as string });
      assert.equal(m.musicYoutubeId, "", String(bad));
      assert.equal(m.musicMode, "melody", String(bad));
    }
  });
  it("rejects unknown modes and clamps the start to 0–600", () => {
    assert.equal(sanitizeMusic({ musicMode: "spotify" }).musicMode, "melody");
    assert.equal(sanitizeMusic({ musicStart: -5 }).musicStart, 0);
    assert.equal(sanitizeMusic({ musicStart: 9999 }).musicStart, 600);
    assert.equal(sanitizeMusic({ musicStart: "abc" }).musicStart, 0);
  });
  it("off ⇒ music false; an old client's music:false still means off", () => {
    assert.equal(sanitizeMusic({ musicMode: "off" }).music, false);
    assert.equal(sanitizeMusic({ music: false }).musicMode, "off");
    assert.equal(sanitizeMusic({ music: "false" }).musicMode, "off");
  });
  it("a partial update keeps what it does not mention", () => {
    const prev = { music: true, musicMode: "youtube" as const, musicYoutubeId: "450p7goxZqg", musicStart: 30 };
    assert.deepEqual(sanitizeMusic({ music: true }, prev), prev);
    assert.deepEqual(sanitizeMusic({ musicStart: 10 }, prev), { ...prev, musicStart: 10 });
    assert.equal(sanitizeMusic({ music: false }, prev).musicMode, "off");
    assert.equal(sanitizeMusic({ music: true }, { ...prev, musicMode: "off", music: false }).musicMode, "melody");
  });
});

describe("sanitizeMusic — the template's own track", () => {
  it("keeps \"track\" only on a slug that ships one; elsewhere it falls back to the melody", () => {
    assert.deepEqual(sanitizeMusic({ musicMode: "track" }, undefined, { track: true }), {
      music: true, musicMode: "track", musicYoutubeId: "", musicStart: 0,
    });
    assert.equal(sanitizeMusic({ musicMode: "track" }).musicMode, "melody");
    assert.equal(sanitizeMusic({ musicMode: "track" }, undefined, { track: false }).musicMode, "melody");
  });
  it("a new page on a track slug defaults to the track", () => {
    assert.equal(sanitizeMusic({}, undefined, { track: true }).musicMode, "track");
    assert.equal(sanitizeMusic({ music: true }, undefined, { track: true }).musicMode, "track");
    assert.equal(sanitizeMusic({}).musicMode, "melody");
  });
  it("youtube without a valid id falls back to the track on a track slug", () => {
    assert.equal(sanitizeMusic({ musicMode: "youtube", musicYoutubeId: "nope" }, undefined, { track: true }).musicMode, "track");
  });
  it("still lets the sender pick youtube, melody or off on a track slug", () => {
    const o = { track: true };
    assert.equal(sanitizeMusic({ musicMode: "youtube", musicYoutubeId: "2Vv-BfVoq4g" }, undefined, o).musicMode, "youtube");
    assert.equal(sanitizeMusic({ musicMode: "melody" }, undefined, o).musicMode, "melody");
    assert.equal(sanitizeMusic({ musicMode: "off" }, undefined, o).music, false);
  });
  it("updates: music:true after off returns to the track; a stored track survives a partial body", () => {
    const off = { music: false, musicMode: "off" as const, musicYoutubeId: "", musicStart: 0 };
    assert.equal(sanitizeMusic({ music: true }, off, { track: true }).musicMode, "track");
    const tr = { music: true, musicMode: "track" as const, musicYoutubeId: "", musicStart: 0 };
    assert.equal(sanitizeMusic({ musicStart: 5 }, tr, { track: true }).musicMode, "track");
    // A stored "track" on a slug that lost its track degrades to the melody.
    assert.equal(sanitizeMusic({ musicStart: 5 }, tr).musicMode, "melody");
  });
  it("only the two Halloween slugs ship a track", () => {
    const withTrack = (Object.keys(VALENTINE_DAYS) as (keyof typeof VALENTINE_DAYS)[]).filter((s) => VALENTINE_DAYS[s].musicTrack).sort();
    assert.deepEqual(withTrack, ["happy-halloween", "happy-halloween-premium"]);
  });
});

/**
 * The client mirror (client/app/(templates)/_valentine/days/<slug>.ts) is kept
 * in step by hand. These keys are the contract: change one here and the client
 * file must change in the same commit, or the field is silently dropped on save.
 */
const PINNED_KEYS: Record<string, string[]> = {
  "happy-rose-day": ["roseColor", "colorReason", "roseCount", "openingLine", "petalStyle", "shayari", "signOff"],
  "happy-propose-day": ["question", "teaser", "reasons", "moments", "ringStyle", "stoneColor", "noMode", "noLines", "afterYes", "shayari"],
  "happy-chocolate-day": ["giftTag", "boxSize", "reasons", "finalAsk"],
  "happy-teddy-day": ["teddyName", "furColor", "marquee", "nearMiss", "outfit", "winLine", "squeezeLines"],
  "happy-promise-day": ["envelopeLine", "pinkyPrompt", "promises", "bigPromise", "lockEngraving", "lockStyle", "lockFinale"],
  "happy-hug-day": ["cafeSign", "squishPrompt", "characters", "tagMe", "tagYou", "menu", "coupons"],
  "happy-kiss-day": ["kissStyle", "lipShade", "openingLine", "kissTarget", "kissNotes", "coupons", "kissBackText"],
  "happy-valentines-day": ["ticketLine", "weekLines", "togetherSince", "stats", "metPlace", "question", "noLines", "datePlan", "ps"],
  "happy-halloween": ["tone", "houseName", "trickLine", "carveWord", "costume", "costumeWhy", "ingredients", "potionSpell", "question", "yesLine"],
  "dandiya-partner": ["tone", "openingLine", "nightLines", "myColor", "lookLine", "eventDate", "eventTime", "venue", "dressCode", "question", "yesLine"],
  // The premium twins (config/premiumDays/<slug>.ts) — each started as a copy
  // of its base day's extras; a builder changing one updates its line here.
  "happy-rose-day-premium": ["roseColor", "colorReason", "openingLine", "question", "yesLine", "sinceDate", "signOff", "shayari"],
  "happy-propose-day-premium": ["teaser", "moments", "rehearsal", "decoys", "stoneColor", "question", "noLines", "afterYes", "terms"],
  "happy-chocolate-day-premium": ["houseName", "openingLine", "flavours", "boxLine", "catchPrize", "heartLine", "lastPiece", "sinceDate", "signOff", "coupon"],
  "happy-teddy-day-premium": ["teddyName", "parcelNote", "firstWords", "outfit", "careLines", "birthPlace", "temperament", "signOff", "question", "yesLine"],
  "happy-promise-day-premium": ["envelopeLine", "pinkyPrompt", "welcomeLine", "promises", "bigPromise", "clubRules", "beadWord", "stickyPromises", "askBack", "lockEngraving", "sinceDate"],
  "happy-hug-day-premium": ["openingLine", "characters", "hugLines", "distanceKm", "meetLine", "coupons", "replyLine", "question", "yesLine", "hugTitle"],
  "happy-kiss-day-premium": ["kissStyle", "lipShade", "openingLine", "kissFrame", "foreheadLine", "cheekLine", "noseLine", "handLine", "kissNotes", "question", "sinceDate", "kissBackText"],
  "happy-valentines-day-premium": ["ticketLine", "balloonLine", "meterLine", "weekLines", "togetherSince", "songNote", "question", "noLines", "datePlan"],
  "happy-halloween-premium": ["tone", "houseName", "treats", "ingredients", "potionSpell", "perks", "costumeDuo", "question", "yesLine"],
};

const PINNED_PREMIUM_GIFS: Record<PremiumDaySlug, string[]> = {
  "happy-rose-day-premium": ["rg1-peek", "rg2-water", "rg3-blush", "rg4-lovesme", "rg5-note", "rg6-yes"],
  "happy-propose-day-premium": ["pp-door", "pp-story", "pp-peek", "pp-ask", "pp-please", "pp-yes"],
  "happy-chocolate-day-premium": ["sf1-ticket", "sf2-box", "sf3-catch", "sf4-melt", "sf5-share", "sf6-yay"],
  "happy-teddy-day-premium": ["td1-hello", "td2-heart", "td3-dress", "td4-squeeze", "td5-sleep", "td6-yes"],
  "happy-promise-day-premium": ["pk-pinky", "pk-jar", "pk-stamp", "pk-bracelet", "pk-lock", "pk-yes"],
  "happy-hug-day-premium": ["hp1-run", "hp2-bear", "hp3-back", "hp4-far", "hp5-coupon", "hp6-yes"],
  "happy-kiss-day-premium": ["km1-gate", "km2-mwah", "km3-booth", "km4-catch", "km5-letter", "km6-yes"],
  "happy-valentines-day-premium": ["vc1-ticket", "vc2-balloons", "vc3-meter", "vc4-letter", "vc5-please", "vc6-yes"],
  "happy-halloween-premium": ["hb1-hello", "hb2-treats", "hb3-pumpkin", "hb4-booth", "hb5-potion", "hb6-yes"],
};

describe("Valentine's week day configs", () => {
  it("has exactly the eight days + Halloween + their nine premium twins, each pinned", () => {
    assert.deepEqual([...VALENTINE_DAY_SLUGS].sort(), Object.keys(PINNED_KEYS).sort());
    assert.equal(VALENTINE_DAY_SLUGS.length, BASE_DAY_SLUGS.length + PREMIUM_DAY_SLUGS.length);
    assert.deepEqual([...VALENTINE_DAY_SLUGS.slice(0, BASE_DAY_SLUGS.length)], [...BASE_DAY_SLUGS]);
    assert.deepEqual([...VALENTINE_DAY_SLUGS.slice(BASE_DAY_SLUGS.length)], [...PREMIUM_DAY_SLUGS]);
    for (const slug of VALENTINE_DAY_SLUGS) {
      assert.deepEqual(VALENTINE_DAYS[slug].extras.map((f) => f.key), PINNED_KEYS[slug], slug);
    }
  });

  it("every $2 day has five GIF slots and sane limits; only Propose, Valentine's and Halloween ask", () => {
    for (const slug of BASE_DAY_SLUGS) {
      const d = VALENTINE_DAYS[slug];
      assert.equal(d.gifSlots.length, 5, slug);
      assert.ok(d.maxPhotos >= 6 && d.maxPhotos <= 9, slug);
      assert.ok(d.letterMax === 1500 || d.letterMax === 2000, slug);
      assert.notEqual(d.premium, true, slug);
    }
    assert.deepEqual(
      BASE_DAY_SLUGS.filter((s) => VALENTINE_DAYS[s].asksQuestion),
      ["happy-propose-day", "happy-valentines-day", "happy-halloween", "dandiya-partner"]
    );
  });

  it("every premium twin: premium, 12 photos, 3000-char letter, six pinned GIF slots, asks like its base", () => {
    for (const slug of PREMIUM_DAY_SLUGS) {
      const d = VALENTINE_DAYS[slug];
      assert.equal(d.premium, true, slug);
      assert.equal(d.maxPhotos, 12, slug);
      assert.equal(d.letterMax, 3000, slug);
      assert.deepEqual([...d.gifSlots], PINNED_PREMIUM_GIFS[slug], slug);
      assert.equal(d.asksQuestion, VALENTINE_DAYS[PREMIUM_BASE[slug]].asksQuestion, slug);
      assert.equal(baseDaySlug(slug), PREMIUM_BASE[slug]);
      assert.ok(isPremiumDaySlug(slug));
      assert.ok(!isPremiumDaySlug(PREMIUM_BASE[slug]));
    }
    assert.equal(baseDaySlug("happy-halloween"), "happy-halloween");
  });

  it("Halloween: tone and costume fall back to their defaults; ingredients are capped", () => {
    const out = sanitizeExtras("happy-halloween", {
      tone: "horror",
      costume: "zombie",
      carveWord: "  PUMPKINPIE-XL  ",
      ingredients: Array.from({ length: 8 }, (_, i) => ({ name: `n${i}`, line: "l".repeat(200), evil: 1 })),
    });
    assert.equal(out.tone, "romantic");
    assert.equal(out.costume, "ghost");
    assert.equal(out.carveWord, "PUMPKINPIE");
    const ings = out.ingredients as Record<string, unknown>[];
    assert.equal(ings.length, 5);
    assert.equal((ings[0].line as string).length, 70);
    assert.equal("evil" in ings[0], false);
    assert.equal(sanitizeExtras("happy-halloween", { tone: "kids", costume: "black-cat" }).costume, "black-cat");
  });
});

describe("Be My Dandiya Partner extras", () => {
  it("tone and colour fall back to their defaults; nine night lines at most, each capped", () => {
    const out = sanitizeExtras("dandiya-partner", {
      tone: "enemy",
      myColor: "beige",
      nightLines: Array.from({ length: 12 }, (_, i) => `night ${i} ${"x".repeat(100)}`),
      venue: "v".repeat(200),
    });
    assert.equal(out.tone, "romantic");
    assert.equal(out.myColor, "peacock");
    const lines = out.nightLines as string[];
    assert.equal(lines.length, 9);
    assert.equal(lines[0].length, 70);
    assert.equal((out.venue as string).length, 60);
    assert.equal(sanitizeExtras("dandiya-partner", { tone: "crush", myColor: "rani" }).myColor, "rani");
  });
});

describe("sanitizeExtras", () => {
  it("always returns every key and drops unknown ones", () => {
    const out = sanitizeExtras("happy-rose-day", { evil: "x", userId: "y", roseColor: "red" });
    assert.deepEqual(Object.keys(out), PINNED_KEYS["happy-rose-day"]);
    assert.equal("evil" in out, false);
  });

  it("trims and caps text", () => {
    const out = sanitizeExtras("happy-rose-day", { openingLine: "  " + "a".repeat(200) + "  " });
    assert.equal((out.openingLine as string).length, 70);
  });

  it("falls back to the enum default on anything off-list", () => {
    assert.equal(sanitizeExtras("happy-rose-day", { roseColor: "black" }).roseColor, "red");
    assert.equal(sanitizeExtras("happy-rose-day", { roseColor: "coral" }).roseColor, "coral");
    assert.equal(sanitizeExtras("happy-chocolate-day", { boxSize: 6 }).boxSize, "6");
  });

  it("clamps numbers and defaults unreadable ones", () => {
    assert.equal(sanitizeExtras("happy-kiss-day", { kissTarget: 500 }).kissTarget, 30);
    assert.equal(sanitizeExtras("happy-kiss-day", { kissTarget: 1 }).kissTarget, 5);
    assert.equal(sanitizeExtras("happy-kiss-day", { kissTarget: "nope" }).kissTarget, 14);
    assert.equal(sanitizeExtras("happy-kiss-day", { kissTarget: "12.6" }).kissTarget, 13);
  });

  it("coerces booleans with a default", () => {
    assert.equal(sanitizeExtras("happy-promise-day", {}).lockFinale, true);
    assert.equal(sanitizeExtras("happy-promise-day", { lockFinale: "false" }).lockFinale, false);
    assert.equal(sanitizeExtras("happy-teddy-day", { nearMiss: 1 }).nearMiss, true);
  });

  it("lists: blanks removed, items capped, count capped", () => {
    const reasons = Array.from({ length: 20 }, (_, i) => (i === 2 ? "   " : `reason ${i} ` + "x".repeat(200)));
    const out = sanitizeExtras("happy-chocolate-day", { reasons }).reasons as string[];
    assert.equal(out.length, 9);
    assert.ok(out.every((r) => r.length <= 90 && r.trim() === r && r.length > 0));
    assert.deepEqual(sanitizeExtras("happy-chocolate-day", { reasons: "not a list" }).reasons, []);
    assert.deepEqual(sanitizeExtras("happy-chocolate-day", { reasons: [1, null, { a: 1 }, "ok"] }).reasons, ["ok"]);
  });

  it("objlists: leaves sanitised, empty rows dropped, extra keys stripped, count capped", () => {
    const menu = [
      { name: "Bear Hug", line: "tight", price: "1 smile", hack: true },
      { name: "", line: "", price: "" },
      ...Array.from({ length: 10 }, (_, i) => ({ name: `Hug ${i}`, line: "l".repeat(300) })),
    ];
    const out = sanitizeExtras("happy-hug-day", { menu }).menu as Record<string, unknown>[];
    assert.equal(out.length, 6);
    assert.deepEqual(out[0], { name: "Bear Hug", line: "tight", price: "1 smile" });
    assert.equal((out[1].line as string).length, 70);
    assert.equal(out[1].price, "");

    const outfit = sanitizeExtras("happy-teddy-day", { outfit: [{ item: "jetpack", note: "zoom" }] }).outfit as Record<string, unknown>[];
    assert.deepEqual(outfit, [{ item: "bow", note: "zoom" }]);
  });

  it("survives garbage input", () => {
    for (const slug of VALENTINE_DAY_SLUGS) {
      for (const raw of [null, undefined, 42, "str", [], [1, 2]]) {
        assert.deepEqual(Object.keys(sanitizeExtras(slug, raw)), PINNED_KEYS[slug]);
      }
    }
  });
});

describe("sanitizeGifSlots", () => {
  it("keeps https links and 'none', blanks everything else, drops unknown slots", () => {
    const out = sanitizeGifSlots("happy-rose-day", {
      "r1-arrival": "https://media.giphy.com/media/abc/giphy.gif",
      "r2-loves-me": "none",
      "r3-letter": "http://insecure.gif",
      "r4-bouquet": "javascript:alert(1)",
      "zz-unknown": "https://x.gif",
    });
    assert.deepEqual(out, {
      "r1-arrival": "https://media.giphy.com/media/abc/giphy.gif",
      "r2-loves-me": "none",
      "r3-letter": "",
      "r4-bouquet": "",
      "r5-ending": "",
    });
  });
});

describe("reactionWrite", () => {
  const now = new Date("2027-02-08T21:42:00Z");

  it("each event is guarded on its own field still being unset (first wins)", () => {
    assert.deepEqual(reactionWrite("opened", {}, now).guard, { "reactions.openedAt": null });
    assert.deepEqual(reactionWrite("completed", {}, now).guard, { "reactions.completedAt": null });
    assert.deepEqual(reactionWrite("answered", {}, now).guard, { "reactions.answer": null });
  });

  it("answered writes yes + time + clamped counters", () => {
    const { set } = reactionWrite("answered", { noDodges: "4", count: -3 }, now);
    assert.deepEqual(set, {
      "reactions.answer": "yes",
      "reactions.answeredAt": now,
      "reactions.noDodges": 4,
      "reactions.count": 0,
    });
    assert.equal(reactionWrite("answered", { noDodges: 1e9 }, now).set["reactions.noDodges"], 999);
    assert.equal("reactions.noDodges" in reactionWrite("answered", { noDodges: "x" }, now).set, false);
  });

  it("never touches another event's field", () => {
    assert.deepEqual(Object.keys(reactionWrite("opened", { noDodges: 3, count: 3 }, now).set), ["reactions.openedAt"]);
  });
});
