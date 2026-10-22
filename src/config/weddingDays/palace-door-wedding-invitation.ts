import type { ValentineDayConfig } from "../valentineDays";

/**
 * palace-door-wedding-invitation — Palace Door Wedding Invitation 🚪, a wedding design on Royal's limits
 * (config/weddingShared.ts WEDDING_TIER_LIMITS): a carved haveli door swings open in 3D onto an ivory palace courtyard, with an illustrated couple for every function.
 *
 * Same fields as royal-wedding-invitation, so the wedding guest routes (RSVP
 * per function, blessings wall) and the owner dashboard work unchanged.
 * recipientName = the bride, senderName = the groom, letter = the English
 * invitation, photos = one pool of 40 (the couple's portrait, story chapters
 * and family cards point into it by 1-based index). Adds contacts, UPI shagun
 * and a livestream link on top of Royal's fields. No question is asked. Light themes only.
 *
 * Client mirror: client/app/(templates)/_valentine/days/palace-door-wedding-invitation.ts (same keys
 * and limits; PINNED_KEYS in valentineDays.test.ts pins them).
 */
const config: ValentineDayConfig = {
  title: "Palace Door Wedding Invitation",
  maxPhotos: 40,
  letterMax: 1500,
  asksQuestion: false,
  gifSlots: [],
  extras: [
    /** Light themes only. */
    { key: "theme", kind: "enum", options: ["blush", "champagne", "powder"], default: "champagne" },
    /** Which language the page opens in (guests can switch). */
    { key: "lang", kind: "enum", options: ["en", "hi"], default: "en" },
    { key: "nameOrder", kind: "enum", options: ["bride", "groom"], default: "bride" },
    { key: "hindiMessage", kind: "longtext", max: 700 },
    { key: "brideFamily", kind: "text", max: 120 },
    { key: "groomFamily", kind: "text", max: 120 },
    { key: "brideNote", kind: "text", max: 100 },
    { key: "groomNote", kind: "text", max: 100 },
    /** "With the blessings of" — grandparents. */
    { key: "blessingsOf", kind: "text", max: 160 },
    /** 1-based index into photos; 0 = none. */
    { key: "bridePhoto", kind: "number", min: 0, max: 40, default: 0 },
    { key: "groomPhoto", kind: "number", min: 0, max: 40, default: 0 },
    /** The couple's portrait in the courtyard (1-based index into photos; 0 = the first gallery photo). */
    { key: "couplePhoto", kind: "number", min: 0, max: 40, default: 0 },
    { key: "muhurat", kind: "text", max: 60 },
    { key: "hashtag", kind: "text", max: 40 },
    /** The functions; `id` is a short stable slug the guests' RSVPs refer to. All text. */
    {
      key: "events",
      kind: "objlist",
      maxItems: 8,
      minItems: 1,
      item: [
        { key: "id", kind: "text", max: 24 },
        { key: "title", kind: "text", max: 40 },
        { key: "date", kind: "text", max: 10 },
        { key: "time", kind: "text", max: 5 },
        { key: "endTime", kind: "text", max: 5 },
        { key: "venue", kind: "text", max: 80 },
        { key: "address", kind: "text", max: 140 },
        { key: "mapUrl", kind: "text", max: 400 },
        { key: "dressCode", kind: "text", max: 60 },
        { key: "dressColor", kind: "text", max: 7 },
        { key: "note", kind: "text", max: 200 },
      ],
    },
    {
      key: "story",
      kind: "objlist",
      maxItems: 8,
      item: [
        { key: "when", kind: "text", max: 24 },
        { key: "title", kind: "text", max: 60 },
        { key: "line", kind: "text", max: 240 },
        { key: "photo", kind: "number", min: 0, max: 40, default: 0 },
      ],
    },
    /** Good to know: "Heading: text" lines. */
    { key: "things", kind: "list", maxItems: 6, itemMax: 180 },
    { key: "gettingThere", kind: "longtext", max: 500 },
    /** Family members guests can call: tap-to-call + WhatsApp. The client validates the phone (10 digits, optional +91). */
    {
      key: "contacts",
      kind: "objlist",
      maxItems: 4,
      item: [
        { key: "name", kind: "text", max: 40 },
        { key: "relation", kind: "text", max: 40 },
        { key: "phone", kind: "text", max: 16 },
      ],
    },
    /** Optional shagun by UPI (off when empty). Only shown as a upi:// link and a copyable id; no payment is handled. */
    { key: "upiId", kind: "text", max: 60 },
    { key: "upiName", kind: "text", max: 60 },
    /** Optional livestream (https only, checked by the client); "Watch live" lights up near the ceremony. */
    { key: "liveUrl", kind: "text", max: 300 },
    /** A YouTube link for the pre-wedding film (the client extracts the id). */
    { key: "videoUrl", kind: "text", max: 200 },
    { key: "rsvpBy", kind: "text", max: 10 },
    { key: "maxGuests", kind: "number", min: 1, max: 10, default: 4 },
    /** Read by weddingGuest.controller: the RSVP accepts a meal choice only when true. */
    { key: "rsvpMeal", kind: "bool", default: true },
    { key: "blessings", kind: "bool", default: true },
    /** "॥ श्री गणेशाय नमः ॥" on the closed door (false = "॥ शुभ विवाह ॥"). */
    { key: "invocation", kind: "bool", default: true },
  ],
};

export default config;
