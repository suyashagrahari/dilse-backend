import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateSchema } from "./aiFill/types";
import { willYouBeMine } from "./aiFill/will-you-be-mine";
import { sorryPremium } from "./aiFill/sorry-premium";
import { proposalPremium } from "./aiFill/proposal-premium";
import { happyAnniversary } from "./aiFill/happy-anniversary";
import { anniversaryPremium } from "./aiFill/anniversary-premium";
import { digitalBouquet } from "./aiFill/digital-bouquet";
import { weddingInvitation } from "./aiFill/wedding-invitation";
import { weddingInvitationPremium } from "./aiFill/wedding-invitation-premium";
import { royalWeddingInvitation } from "./aiFill/royal-wedding-invitation";
import { palaceDoorWeddingInvitation } from "./aiFill/palace-door-wedding-invitation";
import { gardenWeddingInvitation } from "./aiFill/garden-wedding-invitation";
import { floralWeddingInvitation } from "./aiFill/floral-wedding-invitation";
import { lotusWeddingInvitation } from "./aiFill/lotus-wedding-invitation";
import { isWeddingSlug, WEDDING_TIER_LIMITS, eventIdsOf } from "./weddingShared";
import {
  BASE_DAY_SLUGS,
  PREMIUM_BASE,
  PREMIUM_DAY_SLUGS,
  VALENTINE_DAYS,
  VALENTINE_DAY_SLUGS,
  baseDaySlug,
  isPremiumDaySlug,
  reactionWrite,
  parseAnswer,
  answerAllows,
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
  it("only the two Halloween slugs, Sorry, Happy Birthday, Miss You, Will You Be Mine and their premium editions and both Anniversary pages and the Digital Bouquet ship a track", () => {
    const withTrack = (Object.keys(VALENTINE_DAYS) as (keyof typeof VALENTINE_DAYS)[]).filter((s) => VALENTINE_DAYS[s].musicTrack).sort();
    assert.deepEqual(withTrack, ["anniversary-premium", "birthday-premium", "digital-bouquet", "happy-anniversary", "happy-birthday", "happy-halloween", "happy-halloween-premium", "miss-you", "miss-you-premium", "proposal-premium", "sorry", "sorry-premium", "will-you-be-mine"]);
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
  "dandiya-partner": ["tone", "openingLine", "nightLines", "myColor", "lookLine", "eventDate", "eventTime", "venue", "dressCode", "question", "yesLine", "answerMode", "noTries"],
  "happy-diwali": ["tone", "doorNote", "wishes", "initials", "sparkleWord", "mithai", "mithaiNote", "blessing"],
  sorry: ["palette", "tone", "openingLine", "moodLines", "confession", "reasons", "promise", "coupons", "question", "yesLine", "answerMode", "noTries"],
  "happy-birthday": ["palette", "tone", "crown", "age", "openingLine", "wishLine", "cakeLine", "reasons", "coupons", "question", "yesLine", "askWhen"],
  "birthday-premium": ["palette", "tone", "age", "togetherSince", "coverLine", "wishes", "milestones", "reasons", "cakeLine", "ticketTitle", "ticketLine", "question", "yesLine", "askWhen"],
  "will-you-be-mine": ["palette", "tone", "openingLine", "story", "reasons", "quiz", "promise", "question", "yesLine", "answerMode", "noTries"],
  "proposal-premium": ["palette", "tone", "openingLine", "lightsLine", "story", "since", "reasons", "promise", "question", "yesLine", "datePlan", "answerMode", "noTries"],
  "happy-anniversary": ["palette", "tone", "relation", "togetherSince", "ticketLine", "funStat", "milestones", "firstPlace", "firstMemory", "reasons", "promises", "plan", "question", "yesLine", "awardTitle"],
  "anniversary-premium": [
    "palette", "tone", "since", "metOn", "openingLine", "metPlace", "metLine", "chapters", "firsts", "littleThings", "reasons", "ourSong", "mostSaid",
    "stats", "promises", "plans", "question", "datePlan", "yesLine", "lock", "openOn", "passHint",
  ],
  "miss-you": ["palette", "tone", "openingLine", "yourCity", "myCity", "distanceKm", "meetDate", "missThings", "openWhen", "hugLine", "question", "yesLine", "answerMode", "noTries"],
  "miss-you-premium": ["palette", "tone", "openingLine", "yourCity", "myCity", "distanceKm", "unit", "meetDate", "voiceNotes", "picnicLines", "heartLine", "missThings", "question", "yesLine", "answerMode"],
  "royal-wedding-invitation": ["theme", "lang", "nameOrder", "hindiMessage", "brideFamily", "groomFamily", "brideNote", "groomNote", "blessingsOf", "bridePhoto", "groomPhoto", "couplePhoto", "muhurat", "hashtag", "events", "story", "things", "gettingThere", "contacts", "upiId", "upiName", "liveUrl", "videoUrl", "rsvpBy", "maxGuests", "rsvpMeal", "blessings", "invocation"],
  // The four wedding designs on Royal's limits (config/weddingDays/<slug>.ts); a builder changing one updates its line here.
  "palace-door-wedding-invitation": ["theme", "lang", "nameOrder", "hindiMessage", "brideFamily", "groomFamily", "brideNote", "groomNote", "blessingsOf", "bridePhoto", "groomPhoto", "couplePhoto", "muhurat", "hashtag", "events", "story", "things", "gettingThere", "contacts", "upiId", "upiName", "liveUrl", "videoUrl", "rsvpBy", "maxGuests", "rsvpMeal", "blessings", "invocation"],
  "garden-wedding-invitation": ["theme", "lang", "nameOrder", "hindiMessage", "brideFamily", "groomFamily", "brideNote", "groomNote", "blessingsOf", "bridePhoto", "groomPhoto", "muhurat", "hashtag", "events", "story", "things", "gettingThere", "videoUrl", "rsvpBy", "maxGuests", "rsvpMeal", "blessings", "invocation", "contacts", "upiId", "upiName", "liveUrl"],
  "floral-wedding-invitation": ["theme", "lang", "nameOrder", "hindiMessage", "brideFamily", "groomFamily", "brideNote", "groomNote", "blessingsOf", "bridePhoto", "groomPhoto", "couplePhoto", "muhurat", "hashtag", "events", "story", "things", "gettingThere", "videoUrl", "rsvpBy", "maxGuests", "rsvpMeal", "blessings", "invocation", "contacts", "upiId", "upiName", "liveUrl"],
  "lotus-wedding-invitation": ["theme", "lang", "nameOrder", "hindiMessage", "brideFamily", "groomFamily", "brideNote", "groomNote", "blessingsOf", "bridePhoto", "groomPhoto", "muhurat", "hashtag", "events", "story", "things", "gettingThere", "videoUrl", "rsvpBy", "maxGuests", "rsvpMeal", "blessings", "invocation", "contacts", "upiId", "upiName", "liveUrl"],
  "digital-bouquet": ["palette", "tone", "stems", "greenery", "wrap", "ribbon", "bow", "charms", "giftTag", "deliveryLine", "flowerNotes", "cardHand", "cardSize", "question", "yesLine"],
  // Classic: the ten keys published pages already store, then the jharokha rebuild's additive ones.
  "wedding-invitation": ["theme", "namesOrder", "date", "time", "brideFamily", "groomFamily", "events", "rsvp", "rsvpBy", "maxGuests", "lang", "hindiMessage", "brideNote", "groomNote", "blessingsOf", "couplePhoto", "muhurat", "hashtag", "story", "things", "gettingThere", "contacts", "upiId", "upiName", "liveUrl", "videoUrl", "rsvpMeal", "blessings", "invocation"],
  "wedding-invitation-premium": [
    "theme", "order", "motif", "hindi", "date", "time", "city", "hashtag", "brideParents", "brideNote", "groomParents", "groomNote", "events", "story", "faqs", "rsvpBy", "maxGuests", "rsvpMeal",
    "lang", "hindiMessage", "blessingsOf", "muhurat", "gettingThere", "videoUrl", "contacts", "upiId", "upiName", "liveUrl", "blessings",
  ],
  "sorry-premium": ["palette", "tone", "togetherSince", "knockLine", "confession", "feelings", "lessons", "stars", "promises", "question", "yesLine", "answerMode"],
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

  it("every $2 day has five GIF slots (the ✦ premium editions of Miss You and Sorry six, The Proposal seven, the anniversary museum six) and sane limits; only Propose, Valentine's and Halloween ask", () => {
    for (const slug of BASE_DAY_SLUGS) {
      const d = VALENTINE_DAYS[slug];
      // The flagship anniversary book carries the ultra-premium limits (pinned in its own suite).
      if (slug === "anniversary-premium") continue;
      // The wedding tiers have no stickers and their own limits (pinned in their own suite).
      if (isWeddingSlug(slug)) continue;
      // The ✦ premium editions carry one sticker per act.
      assert.equal(d.gifSlots.length, slug === "proposal-premium" ? 7 : slug === "miss-you-premium" || slug === "sorry-premium" || slug === "happy-anniversary" || slug === "digital-bouquet" ? 6 : 5, slug);
      assert.ok(d.maxPhotos >= 6 && d.maxPhotos <= 9, slug);
      assert.ok(d.letterMax === 1500 || d.letterMax === 2000, slug);
      assert.notEqual(d.premium, true, slug);
    }
    assert.deepEqual(
      BASE_DAY_SLUGS.filter((s) => VALENTINE_DAYS[s].asksQuestion),
      ["happy-propose-day", "happy-valentines-day", "happy-halloween", "dandiya-partner", "sorry", "happy-birthday", "birthday-premium", "miss-you", "will-you-be-mine", "miss-you-premium", "sorry-premium", "proposal-premium", "happy-anniversary", "anniversary-premium", "digital-bouquet"]
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

  it("Diwali: tone and mithai fall back to their defaults; wishes are trimmed and capped at five", () => {
    const out = sanitizeExtras("happy-diwali", {
      tone: "spooky",
      mithai: "cake",
      initials: "  ABCDEFGH ",
      wishes: ["  one ", "", "x".repeat(200), "four", "five", "six", "seven"],
    });
    assert.equal(out.tone, "romantic");
    assert.equal(out.mithai, "laddoo");
    assert.equal(out.initials, "ABCDEF");
    const wishes = out.wishes as string[];
    assert.equal(wishes.length, 5);
    assert.equal(wishes[0], "one");
    assert.equal(wishes[1].length, 70);
    assert.equal(VALENTINE_DAYS["happy-diwali"].asksQuestion, false);
    assert.equal(sanitizeExtras("happy-diwali", { mithai: "kaju-katli", tone: "family" }).mithai, "kaju-katli");
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

describe("I'm Sorry extras", () => {
  it("palette and tone fall back to their defaults; lists, coupons and the confession are capped", () => {
    const out = sanitizeExtras("sorry", {
      palette: "neonGreen",
      tone: "boss",
      moodLines: Array.from({ length: 8 }, (_, i) => `mood ${i} ${"x".repeat(100)}`),
      reasons: Array.from({ length: 9 }, () => "r".repeat(90)),
      confession: "c".repeat(400),
      coupons: Array.from({ length: 7 }, (_, i) => ({ title: `T${i}${"t".repeat(40)}`, line: "l".repeat(90), evil: "x" })),
    });
    assert.equal(out.palette, "babyPink");
    assert.equal(out.tone, "partner");
    assert.equal((out.moodLines as string[]).length, 5);
    assert.equal((out.moodLines as string[])[0].length, 70);
    assert.equal((out.reasons as string[]).length, 5);
    assert.equal((out.confession as string).length, 160);
    const coupons = out.coupons as { title: string; line: string }[];
    assert.equal(coupons.length, 4);
    assert.equal(coupons[0].title.length, 28);
    assert.equal(coupons[0].line.length, 60);
    assert.equal("evil" in coupons[0], false);
    assert.equal(sanitizeExtras("sorry", { palette: "lavenderDream", tone: "bestie" }).palette, "lavenderDream");
  });

  it("asks the question, and keeps the two answer modes (the honest \"I need time\" is noAfterTries)", () => {
    assert.equal(VALENTINE_DAYS.sorry.asksQuestion, true);
    const bad = sanitizeExtras("sorry", { answerMode: "maybe", noTries: "9" });
    assert.equal(bad.answerMode, "yesOnly");
    assert.equal(bad.noTries, "4");
    const ok = sanitizeExtras("sorry", { answerMode: "noAfterTries", noTries: "5" });
    assert.equal(ok.answerMode, "noAfterTries");
    assert.equal(ok.noTries, "5");
  });
});

describe("Happy Birthday extras", () => {
  it("palette, tone, crown and askWhen fall back to their defaults; lists, coupons and lines are capped", () => {
    const out = sanitizeExtras("happy-birthday", {
      palette: "chocolateFudge",
      tone: "boss",
      crown: "emperor",
      askWhen: "maybe",
      age: "12345",
      wishLine: "w".repeat(300),
      cakeLine: "c".repeat(300),
      reasons: Array.from({ length: 9 }, () => "r".repeat(90)),
      coupons: Array.from({ length: 7 }, (_, i) => ({ title: `T${i}${"t".repeat(40)}`, line: "l".repeat(90), evil: "x" })),
    });
    assert.equal(out.palette, "strawberryCake");
    assert.equal(out.tone, "partner");
    assert.equal(out.crown, "queen");
    assert.equal(out.askWhen, "yes");
    assert.equal((out.age as string).length, 3);
    assert.equal((out.wishLine as string).length, 100);
    assert.equal((out.cakeLine as string).length, 90);
    assert.equal((out.reasons as string[]).length, 5);
    assert.equal((out.reasons as string[])[0].length, 70);
    const coupons = out.coupons as { title: string; line: string }[];
    assert.equal(coupons.length, 4);
    assert.equal(coupons[0].title.length, 28);
    assert.equal(coupons[0].line.length, 60);
    assert.equal("evil" in coupons[0], false);
    const ok = sanitizeExtras("happy-birthday", { palette: "mintMacaron", crown: "king", askWhen: "no" });
    assert.equal(ok.palette, "mintMacaron");
    assert.equal(ok.crown, "king");
    assert.equal(ok.askWhen, "no");
  });

  it("asks the question, takes only a yes, and keeps the \"when?\" pick in reactions.count", () => {
    assert.equal(VALENTINE_DAYS["happy-birthday"].asksQuestion, true);
    assert.equal(VALENTINE_DAYS["happy-birthday"].musicTrack, true);
    const { set } = reactionWrite("answered", { noDodges: 2, count: 2 }, new Date(0));
    assert.equal(set["reactions.answer"], "yes");
    assert.equal(set["reactions.count"], 2);
  });
});

describe("Miss You ✦ Premium extras", () => {
  it("palette, tone and unit fall back; km is clamped; the radio, the picnic and the stars are capped", () => {
    const out = sanitizeExtras("miss-you-premium", {
      palette: "midnightStars",
      tone: "boss",
      unit: "lightyears",
      myCity: "B".repeat(50),
      distanceKm: 99999,
      voiceNotes: Array.from({ length: 5 }, () => "v".repeat(200)),
      picnicLines: Array.from({ length: 8 }, () => "p".repeat(100)),
      missThings: Array.from({ length: 9 }, () => "m".repeat(90)),
      heartLine: "h".repeat(200),
    });
    assert.equal(out.palette, "cottonCandy");
    assert.equal(out.tone, "partner");
    assert.equal(out.unit, "km");
    assert.equal((out.myCity as string).length, 30);
    assert.equal(out.distanceKm, 20000);
    assert.equal((out.voiceNotes as string[]).length, 3);
    assert.equal((out.voiceNotes as string[])[0].length, 90);
    assert.equal((out.picnicLines as string[]).length, 5);
    assert.equal((out.picnicLines as string[])[0].length, 70);
    assert.equal((out.missThings as string[]).length, 6);
    assert.equal((out.heartLine as string).length, 80);
    assert.equal(sanitizeExtras("miss-you-premium", { palette: "mintBreeze", unit: "mi" }).unit, "mi");
  });

  it("asks the question, ships its own track, and lets them say Later by default", () => {
    assert.equal(VALENTINE_DAYS["miss-you-premium"].asksQuestion, true);
    assert.equal(VALENTINE_DAYS["miss-you-premium"].musicTrack, true);
    assert.equal(sanitizeExtras("miss-you-premium", {}).answerMode, "noAfterTries");
    assert.equal(sanitizeExtras("miss-you-premium", { answerMode: "yesOnly" }).answerMode, "yesOnly");
    assert.equal(answerAllows(sanitizeExtras("miss-you-premium", {}), "no"), true);
    assert.equal(answerAllows(sanitizeExtras("miss-you-premium", { answerMode: "yesOnly" }), "no"), false);
  });
});

describe("Miss You extras", () => {
  it("palette and tone fall back; km is clamped; the jar, the envelopes and the cities are capped", () => {
    const out = sanitizeExtras("miss-you", {
      palette: "neonGreen",
      tone: "boss",
      yourCity: "M".repeat(50),
      distanceKm: 99999,
      meetDate: "2026-11-07T00:00:00Z",
      missThings: Array.from({ length: 9 }, () => "m".repeat(90)),
      openWhen: Array.from({ length: 6 }, (_, i) => ({ when: `W${i}${"w".repeat(50)}`, note: "n".repeat(300), evil: "x" })),
    });
    assert.equal(out.palette, "midnightStars");
    assert.equal(out.tone, "partner");
    assert.equal((out.yourCity as string).length, 30);
    assert.equal(out.distanceKm, 20000);
    assert.equal((out.meetDate as string).length, 10);
    assert.equal((out.missThings as string[]).length, 6);
    assert.equal((out.missThings as string[])[0].length, 70);
    const env = out.openWhen as { when: string; note: string }[];
    assert.equal(env.length, 4);
    assert.equal(env[0].when.length, 40);
    assert.equal(env[0].note.length, 160);
    assert.equal("evil" in env[0], false);
    assert.equal(sanitizeExtras("miss-you", { palette: "cloudLilac", distanceKm: -5 }).palette, "cloudLilac");
    assert.equal(sanitizeExtras("miss-you", { distanceKm: -5 }).distanceKm, 0);
  });

  it("asks the question, ships its own track, and keeps both answer modes (\"Not tonight\" is noAfterTries)", () => {
    assert.equal(VALENTINE_DAYS["miss-you"].asksQuestion, true);
    assert.equal(VALENTINE_DAYS["miss-you"].musicTrack, true);
    const bad = sanitizeExtras("miss-you", { answerMode: "maybe", noTries: "9" });
    assert.equal(bad.answerMode, "yesOnly");
    assert.equal(bad.noTries, "4");
    const ok = sanitizeExtras("miss-you", { answerMode: "noAfterTries", noTries: "5" });
    assert.equal(ok.answerMode, "noAfterTries");
    assert.equal(ok.noTries, "5");
  });
});

describe("Will You Be Mine extras", () => {
  it("palette and tone fall back to their defaults; story, reasons and quiz are capped", () => {
    const out = sanitizeExtras("will-you-be-mine", {
      palette: "neonGreen",
      tone: "boss",
      story: Array.from({ length: 7 }, (_, i) => ({ when: `W${i}${"w".repeat(40)}`, title: "t".repeat(60), line: "l".repeat(200), evil: "x" })),
      reasons: Array.from({ length: 9 }, () => "r".repeat(90)),
      quiz: Array.from({ length: 5 }, () => ({ q: "q".repeat(90), right: "r".repeat(50), wrong1: "a".repeat(50), wrong2: "b".repeat(50), hack: 1 })),
      promise: "p".repeat(400),
    });
    assert.equal(out.palette, "roseGold");
    assert.equal(out.tone, "girlfriend");
    const story = out.story as { when: string; title: string; line: string }[];
    assert.equal(story.length, 4);
    assert.equal(story[0].when.length, 24);
    assert.equal(story[0].title.length, 36);
    assert.equal(story[0].line.length, 100);
    assert.equal("evil" in story[0], false);
    assert.equal((out.reasons as string[]).length, 6);
    assert.equal((out.reasons as string[])[0].length, 70);
    const quiz = out.quiz as Record<string, string>[];
    assert.equal(quiz.length, 3);
    assert.deepEqual([quiz[0].q.length, quiz[0].right.length, quiz[0].wrong1.length, quiz[0].wrong2.length], [60, 30, 30, 30]);
    assert.equal("hack" in quiz[0], false);
    assert.equal((out.promise as string).length, 140);
    const ok = sanitizeExtras("will-you-be-mine", { palette: "starryNight", tone: "marry" });
    assert.equal(ok.palette, "starryNight");
    assert.equal(ok.tone, "marry");
  });

  it("its AI fill schema is valid (the server skips a broken one at boot)", () => {
    assert.deepEqual(validateSchema(willYouBeMine), []);
    for (const f of willYouBeMine.fields.filter((x) => x.path.startsWith("extras."))) {
      const key = f.path.slice("extras.".length).split(/[.[]/)[0];
      assert.ok(VALENTINE_DAYS["will-you-be-mine"].extras.some((e) => e.key === key), f.path);
    }
  });

  it("asks the question, and keeps the two answer modes (the honest \"let me think\" is noAfterTries)", () => {
    assert.equal(VALENTINE_DAYS["will-you-be-mine"].asksQuestion, true);
    const bad = sanitizeExtras("will-you-be-mine", { answerMode: "maybe", noTries: "9" });
    assert.equal(bad.answerMode, "yesOnly");
    assert.equal(bad.noTries, "4");
    const ok = sanitizeExtras("will-you-be-mine", { answerMode: "noAfterTries", noTries: "5" });
    assert.equal(ok.answerMode, "noAfterTries");
    assert.equal(ok.noTries, "5");
  });
});

describe("I'm Sorry ✦ Premium extras", () => {
  it("palette and tone fall back to their defaults; the lists are capped", () => {
    const out = sanitizeExtras("sorry-premium", {
      palette: "midnight",
      tone: "angry",
      knockLine: "k".repeat(200),
      confession: "c".repeat(400),
      feelings: Array.from({ length: 6 }, () => "f".repeat(120)),
      lessons: Array.from({ length: 6 }, () => "l".repeat(120)),
      stars: Array.from({ length: 9 }, () => "s".repeat(120)),
      promises: Array.from({ length: 7 }, () => "p".repeat(120)),
    });
    assert.equal(out.palette, "rainyBlush");
    assert.equal(out.tone, "sweet");
    assert.equal((out.knockLine as string).length, 70);
    assert.equal((out.confession as string).length, 160);
    assert.deepEqual([(out.feelings as string[]).length, (out.feelings as string[])[0].length], [3, 80]);
    assert.deepEqual([(out.lessons as string[]).length, (out.lessons as string[])[0].length], [3, 80]);
    assert.deepEqual([(out.stars as string[]).length, (out.stars as string[])[0].length], [6, 70]);
    assert.deepEqual([(out.promises as string[]).length, (out.promises as string[])[0].length], [4, 70]);
    const ok = sanitizeExtras("sorry-premium", { palette: "lilacDrizzle", tone: "silly", togetherSince: "2024-02-14" });
    assert.equal(ok.palette, "lilacDrizzle");
    assert.equal(ok.tone, "silly");
    assert.equal(ok.togetherSince, "2024-02-14");
  });

  it("asks the question with an honest \"I need a little time\" by default, and ships its own track", () => {
    assert.equal(VALENTINE_DAYS["sorry-premium"].asksQuestion, true);
    assert.equal(VALENTINE_DAYS["sorry-premium"].musicTrack, true);
    assert.equal(sanitizeExtras("sorry-premium", {}).answerMode, "noAfterTries");
    assert.equal(sanitizeExtras("sorry-premium", { answerMode: "maybe" }).answerMode, "noAfterTries");
    assert.equal(sanitizeExtras("sorry-premium", { answerMode: "yesOnly" }).answerMode, "yesOnly");
  });

  it("its AI fill schema is valid and only writes keys the page has", () => {
    assert.deepEqual(validateSchema(sorryPremium), []);
    for (const f of sorryPremium.fields.filter((x) => x.path.startsWith("extras."))) {
      const key = f.path.slice("extras.".length).split(/[.[]/)[0];
      assert.ok(VALENTINE_DAYS["sorry-premium"].extras.some((e) => e.key === key), f.path);
    }
  });
});

describe("The Proposal ✦ Premium extras", () => {
  it("palette and tone fall back to their defaults; lights, story, since, reasons and the date plan are capped", () => {
    const out = sanitizeExtras("proposal-premium", {
      palette: "midnight",
      tone: "date",
      lightsLine: "l".repeat(90),
      story: Array.from({ length: 8 }, (_, i) => ({ when: `W${i}${"w".repeat(40)}`, title: "t".repeat(60), line: "l".repeat(200), evil: "x" })),
      since: "2024-02-14T00:00:00.000Z",
      reasons: Array.from({ length: 10 }, () => "r".repeat(90)),
      promise: "p".repeat(400),
      datePlan: "d".repeat(200),
    });
    assert.equal(out.palette, "roseGoldBlush");
    assert.equal(out.tone, "girlfriend");
    assert.equal((out.lightsLine as string).length, 48);
    const story = out.story as { when: string; title: string; line: string }[];
    assert.equal(story.length, 5);
    assert.deepEqual([story[0].when.length, story[0].title.length, story[0].line.length], [24, 36, 100]);
    assert.equal("evil" in story[0], false);
    assert.equal(out.since, "2024-02-14");
    assert.equal((out.reasons as string[]).length, 7);
    assert.equal((out.reasons as string[])[0].length, 70);
    assert.equal((out.promise as string).length, 140);
    assert.equal((out.datePlan as string).length, 80);
    const ok = sanitizeExtras("proposal-premium", { palette: "lilacGarden", tone: "marry" });
    assert.equal(ok.palette, "lilacGarden");
    assert.equal(ok.tone, "marry");
  });

  it("its AI fill schema is valid (the server skips a broken one at boot)", () => {
    assert.deepEqual(validateSchema(proposalPremium), []);
    assert.ok(proposalPremium.fields.length <= 40);
    for (const f of proposalPremium.fields.filter((x) => x.path.startsWith("extras."))) {
      const key = f.path.slice("extras.".length).split(/[.[]/)[0];
      assert.ok(VALENTINE_DAYS["proposal-premium"].extras.some((e) => e.key === key), f.path);
    }
  });

  it("asks the question, ships seven GIF slots, and keeps the two answer modes", () => {
    assert.equal(VALENTINE_DAYS["proposal-premium"].asksQuestion, true);
    assert.equal(VALENTINE_DAYS["proposal-premium"].gifSlots.length, 7);
    const bad = sanitizeExtras("proposal-premium", { answerMode: "maybe", noTries: "9" });
    assert.equal(bad.answerMode, "yesOnly");
    assert.equal(bad.noTries, "4");
    const ok = sanitizeExtras("proposal-premium", { answerMode: "noAfterTries", noTries: "5" });
    assert.equal(ok.answerMode, "noAfterTries");
    assert.equal(ok.noTries, "5");
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

  it("answered writes no only when asked to; anything else is yes", () => {
    assert.equal(reactionWrite("answered", { answer: "no" }, now).set["reactions.answer"], "no");
    assert.equal(reactionWrite("answered", { answer: "yes" }, now).set["reactions.answer"], "yes");
    assert.equal(reactionWrite("answered", { answer: "NO!" }, now).set["reactions.answer"], "yes");
  });

  it("parseAnswer / answerAllows: no needs the sender's noAfterTries", () => {
    assert.equal(parseAnswer(undefined), "yes");
    assert.equal(parseAnswer("no"), "no");
    assert.equal(parseAnswer("maybe"), undefined);
    assert.equal(answerAllows({}, "no"), false);
    assert.equal(answerAllows({ answerMode: "yesOnly" }, "no"), false);
    assert.equal(answerAllows({ answerMode: "noAfterTries" }, "no"), true);
    assert.equal(answerAllows(null, "yes"), true);
  });

  it("dandiya answer settings sanitize to the two modes and 4/5 tries", () => {
    assert.deepEqual(
      (({ answerMode, noTries }) => ({ answerMode, noTries }))(sanitizeExtras("dandiya-partner", { answerMode: "maybe", noTries: "9" })),
      { answerMode: "yesOnly", noTries: "4" },
    );
    const ok = sanitizeExtras("dandiya-partner", { answerMode: "noAfterTries", noTries: "5" });
    assert.equal(ok.answerMode, "noAfterTries");
    assert.equal(ok.noTries, "5");
  });

  it("never touches another event's field", () => {
    assert.deepEqual(Object.keys(reactionWrite("opened", { noDodges: 3, count: 3 }, now).set), ["reactions.openedAt"]);
  });
});

describe("Birthday Premium extras", () => {
  it("palette, tone and askWhen fall back to their defaults; wishes, milestones, reasons and lines are capped", () => {
    const out = sanitizeExtras("birthday-premium", {
      palette: "midnight",
      tone: "spooky",
      askWhen: "maybe",
      age: "12345",
      togetherSince: "2023-02-14T00:00:00Z",
      coverLine: "c".repeat(200),
      wishes: Array.from({ length: 9 }, () => "w".repeat(90)),
      milestones: Array.from({ length: 8 }, (_, i) => ({ when: `W${i}${"w".repeat(40)}`, title: "t".repeat(90), line: "l".repeat(200), evil: "x" })),
      reasons: Array.from({ length: 9 }, () => "r".repeat(120)),
      cakeLine: "k".repeat(300),
      ticketTitle: "T".repeat(90),
      ticketLine: "L".repeat(300),
    });
    assert.equal(out.palette, "buttercream");
    assert.equal(out.tone, "cute");
    assert.equal(out.askWhen, "yes");
    assert.equal((out.age as string).length, 3);
    assert.equal((out.togetherSince as string).length, 10);
    assert.equal((out.coverLine as string).length, 60);
    assert.equal((out.wishes as string[]).length, 5);
    assert.equal((out.wishes as string[])[0].length, 40);
    const ms = out.milestones as { when: string; title: string; line: string }[];
    assert.equal(ms.length, 5);
    assert.equal(ms[0].when.length, 24);
    assert.equal(ms[0].title.length, 40);
    assert.equal(ms[0].line.length, 80);
    assert.equal("evil" in ms[0], false);
    assert.equal((out.reasons as string[]).length, 6);
    assert.equal((out.reasons as string[])[0].length, 80);
    assert.equal((out.cakeLine as string).length, 90);
    assert.equal((out.ticketTitle as string).length, 32);
    assert.equal((out.ticketLine as string).length, 90);
    const ok = sanitizeExtras("birthday-premium", { palette: "cottonCandy", tone: "funny", askWhen: "no" });
    assert.equal(ok.palette, "cottonCandy");
    assert.equal(ok.tone, "funny");
    assert.equal(ok.askWhen, "no");
  });

  it("asks the question, ships its own track and keeps the \"when?\" pick in reactions.count", () => {
    assert.equal(VALENTINE_DAYS["birthday-premium"].asksQuestion, true);
    assert.equal(VALENTINE_DAYS["birthday-premium"].musicTrack, true);
    assert.equal(VALENTINE_DAYS["birthday-premium"].gifSlots.length, 5);
    const { set } = reactionWrite("answered", { noDodges: 1, count: 3 }, new Date(0));
    assert.equal(set["reactions.answer"], "yes");
    assert.equal(set["reactions.count"], 3);
  });
});

describe("Happy Anniversary extras", () => {
  it("palette, tone and relation fall back to their defaults; milestones, reasons and promises are capped", () => {
    const out = sanitizeExtras("happy-anniversary", {
      palette: "midnight",
      tone: "angry",
      relation: "boss",
      togetherSince: "2023-02-14T00:00:00Z",
      milestones: Array.from({ length: 8 }, (_, i) => ({ when: `W${i}${"w".repeat(40)}`, title: "t".repeat(60), line: "l".repeat(200), evil: "x" })),
      reasons: Array.from({ length: 9 }, () => "r".repeat(120)),
      promises: Array.from({ length: 6 }, () => "p".repeat(90)),
      firstMemory: "m".repeat(400),
      awardTitle: "a".repeat(90),
    });
    assert.equal(out.palette, "blushGallery");
    assert.equal(out.tone, "cute");
    assert.equal(out.relation, "girlfriend");
    assert.equal((out.togetherSince as string).length, 10);
    const ms = out.milestones as { when: string; title: string; line: string }[];
    assert.equal(ms.length, 5);
    assert.deepEqual([ms[0].when.length, ms[0].title.length, ms[0].line.length], [24, 36, 110]);
    assert.equal("evil" in ms[0], false);
    assert.equal((out.reasons as string[]).length, 4);
    assert.equal((out.reasons as string[])[0].length, 80);
    assert.equal((out.promises as string[]).length, 3);
    assert.equal((out.firstMemory as string).length, 160);
    assert.equal((out.awardTitle as string).length, 40);
    const ok = sanitizeExtras("happy-anniversary", { palette: "peachMarble", tone: "funny", relation: "husband" });
    assert.deepEqual([ok.palette, ok.tone, ok.relation], ["peachMarble", "funny", "husband"]);
  });

  it("its AI fill schema is valid and only names real extras (the server skips a broken one at boot)", () => {
    assert.deepEqual(validateSchema(happyAnniversary), []);
    assert.ok(happyAnniversary.fields.length <= 40);
    for (const f of happyAnniversary.fields.filter((x) => x.path.startsWith("extras."))) {
      const key = f.path.slice("extras.".length).split(/[.[]/)[0];
      assert.ok(VALENTINE_DAYS["happy-anniversary"].extras.some((e) => e.key === key), f.path);
    }
  });

  it("asks the question and ships six GIF slots and its own track", () => {
    const d = VALENTINE_DAYS["happy-anniversary"];
    assert.equal(d.asksQuestion, true);
    assert.equal(d.musicTrack, true);
    assert.deepEqual(d.gifSlots, ["h1-welcome", "h2-together", "h3-gallery", "h4-globe", "h5-yes", "h6-award"]);
  });
});

describe("Anniversary Premium extras", () => {
  it("palette, tone and lock fall back to their defaults; chapters, firsts and lists are capped", () => {
    const out = sanitizeExtras("anniversary-premium", {
      palette: "midnight",
      tone: "boss",
      lock: "vault",
      chapters: Array.from({ length: 9 }, (_, i) => ({ when: `Y${i}${"w".repeat(40)}`, title: "t".repeat(60), line: "l".repeat(200), season: "rainy", evil: "x" })),
      firsts: Array.from({ length: 8 }, () => ({ title: "f".repeat(60), line: "l".repeat(200) })),
      littleThings: Array.from({ length: 9 }, () => "h".repeat(90)),
      reasons: Array.from({ length: 12 }, () => "r".repeat(90)),
      stats: Array.from({ length: 5 }, () => ({ num: "9".repeat(20), label: "x".repeat(60) })),
      promises: Array.from({ length: 7 }, () => "p".repeat(100)),
      plans: Array.from({ length: 7 }, () => "q".repeat(100)),
      since: "2022-10-19T00:00:00Z",
    });
    assert.equal(out.palette, "champagnePearl");
    assert.equal(out.tone, "girlfriend");
    assert.equal(out.lock, "none");
    const ch = out.chapters as Record<string, string>[];
    assert.equal(ch.length, 6);
    assert.deepEqual([ch[0].when.length, ch[0].title.length, ch[0].line.length], [20, 40, 120]);
    assert.equal(ch[0].season, "spring");
    assert.equal("evil" in ch[0], false);
    assert.equal((out.firsts as unknown[]).length, 5);
    assert.equal((out.littleThings as string[]).length, 6);
    assert.equal((out.reasons as string[]).length, 8);
    assert.equal((out.stats as unknown[]).length, 3);
    assert.equal((out.promises as string[]).length, 5);
    assert.equal((out.plans as string[]).length, 4);
    assert.equal((out.since as string).length, 10);
    const ok = sanitizeExtras("anniversary-premium", { palette: "sageLinen", tone: "wife", lock: "passcode" });
    assert.deepEqual([ok.palette, ok.tone, ok.lock], ["sageLinen", "wife", "passcode"]);
  });

  it("its AI fill schema is valid (the server skips a broken one at boot)", () => {
    assert.deepEqual(validateSchema(anniversaryPremium), []);
    for (const f of anniversaryPremium.fields.filter((x) => x.path.startsWith("extras."))) {
      const key = f.path.slice("extras.".length).split(/[.[]/)[0];
      assert.ok(VALENTINE_DAYS["anniversary-premium"].extras.some((e) => e.key === key), f.path);
    }
  });

  it("asks the question (yes only) and ships its own track", () => {
    assert.equal(VALENTINE_DAYS["anniversary-premium"].asksQuestion, true);
    assert.equal(VALENTINE_DAYS["anniversary-premium"].musicTrack, true);
    const d = VALENTINE_DAYS["anniversary-premium"];
    assert.equal(d.gifSlots.length, 6);
    assert.deepEqual([d.maxPhotos, d.letterMax], [10, 2500]);
    assert.notEqual(d.premium, true);
  });
});

describe("Digital Bouquet ✦ Premium extras", () => {
  it("keeps every arranged stem (no text leaf), clamps the geometry and caps at 15", () => {
    const stems = Array.from({ length: 20 }, (_, k) => ({ flower: k === 0 ? "cactus" : "peony", x: 5000, y: -40, rot: 999, scale: 10, z: 7.6, evil: "x" }));
    const out = sanitizeExtras("digital-bouquet", { stems });
    const st = out.stems as Record<string, unknown>[];
    assert.equal(st.length, 15);
    assert.deepEqual(st[0], { flower: "rose-red", x: 1000, y: 0, rot: 60, scale: 60, z: 8 });
    assert.equal(st[1].flower, "peony");
    assert.equal("evil" in st[1], false);
  });

  it("looks fall back to their defaults; notes, tag and courier line are capped", () => {
    const out = sanitizeExtras("digital-bouquet", {
      palette: "neon",
      wrap: "plastic",
      ribbon: "black",
      bow: "chain",
      greenery: "cactus",
      cardHand: "comic",
      giftTag: "t".repeat(90),
      deliveryLine: "d".repeat(200),
      charms: ["heart", "teddy", "butterfly", "x"],
      flowerNotes: [{ flower: "tulip", note: "n".repeat(200) }, { flower: "lily", note: "" }],
    });
    assert.deepEqual([out.palette, out.wrap, out.ribbon, out.bow, out.greenery, out.cardHand], ["blushGarden", "tissue", "rose", "bow", "mixed", "hand"]);
    assert.equal((out.giftTag as string).length, 40);
    assert.equal((out.deliveryLine as string).length, 70);
    assert.equal((out.charms as string[]).length, 3);
    const notes = out.flowerNotes as { flower: string; note: string }[];
    // A note row left blank is dropped.
    assert.deepEqual(notes.map((n) => [n.flower, n.note.length]), [["tulip", 80]]);
  });

  it("asks a (yes-only) question, ships its own track, six GIF slots; its AI schema is valid", () => {
    const d = VALENTINE_DAYS["digital-bouquet"];
    assert.equal(d.asksQuestion, true);
    assert.equal(d.musicTrack, true);
    assert.equal(d.gifSlots.length, 6);
    assert.deepEqual([d.maxPhotos, d.letterMax], [6, 1500]);
    assert.deepEqual(validateSchema(digitalBouquet), []);
    for (const f of digitalBouquet.fields.filter((x) => x.path.startsWith("extras."))) {
      const key = f.path.slice("extras.".length).split(/[.[]/)[0];
      assert.ok(d.extras.some((e) => e.key === key), f.path);
    }
  });
});

describe("Wedding Invitation (Classic)", () => {
  const d = VALENTINE_DAYS["wedding-invitation"];
  it("tier limits: 12 photos, 5 events, 3 chapters, no stickers, no question", () => {
    assert.equal(d.maxPhotos, WEDDING_TIER_LIMITS["wedding-invitation"].photos);
    const ev = d.extras.find((f) => f.key === "events");
    assert.ok(ev && ev.kind === "objlist" && ev.maxItems === WEDDING_TIER_LIMITS["wedding-invitation"].events);
    assert.deepEqual([...d.gifSlots], []);
    assert.equal(d.asksQuestion, false);
    assert.notEqual(d.premium, true);
    const story = d.extras.find((f) => f.key === "story");
    assert.ok(story && story.kind === "objlist" && story.maxItems === WEDDING_TIER_LIMITS["wedding-invitation"].story);
  });
  it("keeps five events (text leaves, ids intact), drops a sixth and empty rows; theme falls back", () => {
    const row = (id: string, title: string) => ({ id, title, date: "2026-12-12", time: "19:30", venue: "The Lake Palace", address: "Udaipur", mapUrl: "https://maps.app.goo.gl/x" });
    const out = sanitizeExtras("wedding-invitation", {
      theme: "neon",
      events: [row("wedding", "Wedding"), {}, row("reception", "Reception"), row("mehendi", "Mehendi"), row("haldi", "Haldi"), row("sangeet", "Sangeet"), row("x", "Extra")],
      maxGuests: 40,
    });
    const events = out.events as Record<string, string>[];
    assert.deepEqual(events.map((e) => e.id), ["wedding", "reception", "mehendi", "haldi", "sangeet"]);
    assert.equal(events[0].mapUrl, "https://maps.app.goo.gl/x");
    assert.equal(out.theme, "blush");
    assert.equal(out.maxGuests, 10);
    assert.equal(out.rsvp, true);
  });
  it("a page published before the rebuild keeps every stored value, dark theme included, and new switches stay off", () => {
    const old = {
      theme: "noir",
      namesOrder: "groom",
      date: "2026-12-12",
      time: "19:30",
      brideFamily: "Mrs. Meera & Mr. Raghav Rathore",
      groomFamily: "Mrs. Kavita & Mr. Arjun Singhania",
      events: [{ id: "wedding", title: "Wedding", date: "2026-12-12", time: "19:30", endTime: "", venue: "The Lake Palace", address: "Lake Pichola, Udaipur", mapUrl: "", dressCode: "Traditional festive", dressColor: "", note: "" }],
      rsvp: false,
      rsvpBy: "2026-11-30",
      maxGuests: 4,
    };
    const out = sanitizeExtras("wedding-invitation", old);
    for (const [k, v] of Object.entries(old)) assert.deepEqual(out[k], v, k);
    assert.equal(out.rsvpMeal, false);
    assert.equal(out.blessings, false);
    assert.equal(out.invocation, false);
    assert.equal(out.couplePhoto, 0);
  });
  it("AI schema validates and never writes ids, map links or the theme", () => {
    assert.deepEqual(validateSchema(weddingInvitation), []);
    const paths = weddingInvitation.fields.map((f) => f.path);
    assert.ok(!paths.some((p) => /\.id$|mapUrl|theme|photos/.test(p)), paths.join(","));
    for (const p of paths.filter((x) => x.startsWith("extras."))) {
      const key = p.slice("extras.".length).split(/[.[]/)[0];
      assert.ok(d.extras.some((f) => f.key === key), p);
    }
  });
});


describe("Wedding Invitation ✦ Premium extras", () => {
  it("tier limits: 5 functions, 5 story moments, 3 good-to-know notes, 20 photos; asks nothing", () => {
    const d = VALENTINE_DAYS["wedding-invitation-premium"];
    assert.equal(d.asksQuestion, false);
    assert.deepEqual([d.maxPhotos, d.letterMax, d.gifSlots.length], [20, 1200, 0]);
    const cap = (k: string) => (d.extras.find((e) => e.key === k) as { maxItems: number }).maxItems;
    assert.deepEqual([cap("events"), cap("story"), cap("faqs")], [5, 5, 3]);
  });

  it("keeps the function ids the RSVP refers to, caps rows and falls back to a known theme", () => {
    const events = Array.from({ length: 8 }, (_, k) => ({ id: `e${k}`, title: `F${k}`, date: "2027-02-12", time: "19:30", venue: "v".repeat(200), evil: 1 }));
    const out = sanitizeExtras("wedding-invitation-premium", {
      theme: "neon",
      events,
      story: [{ when: "2018", title: "Met", text: "t", photo: 99 }, { when: "", title: "", text: "", photo: 3 }],
      faqs: Array.from({ length: 5 }, () => ({ title: "Parking", text: "At the gate" })),
      maxGuests: 40,
    });
    assert.equal(out.theme, "powder");
    const ev = out.events as Record<string, unknown>[];
    assert.equal(ev.length, 5);
    assert.equal(ev[0].id, "e0");
    assert.equal((ev[0].venue as string).length, 80);
    assert.equal("evil" in ev[0], false);
    const st = out.story as Record<string, unknown>[];
    // A moment with no words is dropped; the photo index is clamped.
    assert.deepEqual(st, [{ when: "2018", title: "Met", text: "t", photo: 20 }]);
    assert.equal((out.faqs as unknown[]).length, 3);
    assert.equal(out.maxGuests, 10);
  });

  it("its AI schema is valid and only writes keys the page stores", () => {
    const d = VALENTINE_DAYS["wedding-invitation-premium"];
    assert.deepEqual(validateSchema(weddingInvitationPremium), []);
    assert.ok(weddingInvitationPremium.fields.length <= 40);
    for (const f of weddingInvitationPremium.fields.filter((x) => x.path.startsWith("extras."))) {
      const key = f.path.slice("extras.".length).split(/[.[]/)[0];
      assert.ok(d.extras.some((e) => e.key === key), f.path);
    }
  });
});

describe("Royal Wedding Invitation 👑 extras", () => {
  it("is the $20 wedding tier: 40 photos, no stickers, no question; limits match WEDDING_TIER_LIMITS", () => {
    const d = VALENTINE_DAYS["royal-wedding-invitation"];
    const L = WEDDING_TIER_LIMITS["royal-wedding-invitation"];
    assert.deepEqual([d.maxPhotos, d.letterMax, d.gifSlots.length, d.asksQuestion], [L.photos, 1500, 0, false]);
    const max = (k: string) => (d.extras.find((f) => f.key === k) as { maxItems: number }).maxItems;
    assert.deepEqual([max("events"), max("story"), max("things")], [L.events, L.story, L.faq]);
  });

  it("keeps up to eight functions with their ids (RSVPs refer to them), caps every leaf, drops empty rows", () => {
    const events = Array.from({ length: 11 }, (_, k) => ({ id: k === 2 ? "" : `f${k}`, title: k === 2 ? "" : `Function ${k}`, venue: k === 2 ? "" : "v".repeat(200), evil: "x" }));
    const out = sanitizeExtras("royal-wedding-invitation", { events, theme: "neon", maxGuests: 99, story: [{ title: "Met", line: "l".repeat(400), photo: 77 }, { when: "", title: "", line: "", photo: 3 }] });
    const ev = out.events as Record<string, unknown>[];
    assert.equal(ev.length, 8);
    assert.equal(ev.some((e) => e.id === "f2"), false);
    assert.equal((ev[0].venue as string).length, 80);
    assert.equal("evil" in ev[0], false);
    assert.deepEqual(eventIdsOf(out, "royal-wedding-invitation"), ["f0", "f1", "f3", "f4", "f5", "f6", "f7", "f8"]);
    // Light by default since the 2026-10 redesign; a page published on maroon keeps it.
    assert.equal(out.theme, "champagne");
    assert.equal(sanitizeExtras("royal-wedding-invitation", { theme: "maroon" }).theme, "maroon");
    assert.equal(out.maxGuests, 10);
    assert.equal(out.rsvpMeal, true);
    const st = out.story as Record<string, unknown>[];
    assert.equal(st.length, 1);
    assert.deepEqual([(st[0].line as string).length, st[0].photo], [240, 40]);
  });

  it("its AI schema is valid, within the field cap, and only writes declared extras", () => {
    const d = VALENTINE_DAYS["royal-wedding-invitation"];
    assert.deepEqual(validateSchema(royalWeddingInvitation), []);
    assert.ok(royalWeddingInvitation.fields.length <= 40);
    for (const f of royalWeddingInvitation.fields.filter((x) => x.path.startsWith("extras."))) {
      const key = f.path.slice("extras.".length).split(/[.[]/)[0];
      assert.ok(d.extras.some((e) => e.key === key), f.path);
    }
  });
});

describe("The wedding designs on Royal's limits (palace door, garden, floral, lotus)", () => {
  const DESIGNS = [
    { slug: "palace-door-wedding-invitation" as const, schema: palaceDoorWeddingInvitation, theme: "champagne" },
    { slug: "garden-wedding-invitation" as const, schema: gardenWeddingInvitation, theme: "blush" },
    { slug: "floral-wedding-invitation" as const, schema: floralWeddingInvitation, theme: "champagne" },
    { slug: "lotus-wedding-invitation" as const, schema: lotusWeddingInvitation, theme: "champagne" },
  ];
  for (const { slug, schema, theme } of DESIGNS) {
    it(`${slug}: Royal's limits, light themes only, a valid AI schema that writes only declared extras`, () => {
      const d = VALENTINE_DAYS[slug];
      const L = WEDDING_TIER_LIMITS[slug];
      assert.ok(isWeddingSlug(slug));
      assert.deepEqual(L, WEDDING_TIER_LIMITS["royal-wedding-invitation"]);
      assert.deepEqual([d.maxPhotos, d.letterMax, d.gifSlots.length, d.asksQuestion], [L.photos, 1500, 0, false]);
      const max = (k: string) => (d.extras.find((f) => f.key === k) as { maxItems: number }).maxItems;
      assert.deepEqual([max("events"), max("story"), max("things")], [L.events, L.story, L.faq]);
      const out = sanitizeExtras(slug, { theme: "noir" });
      assert.equal(out.theme, theme);
      assert.equal(schema.slug, slug);
      assert.deepEqual(validateSchema(schema), []);
      assert.ok(schema.fields.length <= 40);
      for (const f of schema.fields.filter((x) => x.path.startsWith("extras."))) {
        const key = f.path.slice("extras.".length).split(/[.[]/)[0];
        assert.ok(d.extras.some((e) => e.key === key), f.path);
      }
    });
  }
});
